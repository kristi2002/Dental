/**
 * What the backup sidecar did last, read back for the screen.
 *
 * The container in `docker/backup` dumps the database twice a day and copies it
 * offsite. It also writes two small JSON files, and this is the only reason it
 * bothers: **a backup system that fails silently is worse than no backup system
 * at all**, because it manufactures confidence. A clinic with no backups knows
 * it has no backups. A clinic whose backups stopped in March believes it is
 * covered right up to the morning it finds out otherwise.
 *
 * So the deal is: the sidecar writes down every run, and the app puts a banner
 * in front of the owner when the writing stops. Nothing here can fix a backup —
 * it can only make a broken one impossible to miss.
 *
 * Everything below is defensive to the point of paranoia about the shape of
 * those files. They are produced by a shell script in another container, on a
 * volume that may not be mounted at all in development, and the one thing this
 * module must never do is take a page down because a status file was odd. Every
 * failure path ends at "unknown", which the screen reports honestly.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Set by `docker-compose.prod.yml`, mounted read-only into the app. Absent in
 * development, where there is no sidecar and the card says so.
 */
const STATUS_DIR = process.env.BACKUP_STATUS_DIR ?? '';

/**
 * How long since the last *successful* backup before the app starts saying so.
 *
 * The schedule is 02:00 and 13:00, so the longest ordinary gap is the thirteen
 * hours from the afternoon run to the small hours. Twenty-six hours is that,
 * doubled — long enough that a single skipped run over a deploy does not cry
 * wolf, short enough that nobody loses a second day's work before hearing about
 * it.
 */
export const BACKUP_LATE_HOURS = 26;

/**
 * And when it stops being a warning. Two missed days is no longer a hiccup: it
 * is a system that is not working, and it is worth the interruption.
 */
export const BACKUP_CRITICAL_HOURS = 48;

export type BackupSeverity = 'ok' | 'late' | 'critical' | 'unknown';

/**
 * *Why* it is not healthy, as opposed to how loudly to say so.
 *
 * Severity decides the colour; this decides the sentence. Keeping them apart
 * matters because two of these — a copy that is late and a copy that never
 * leaves the building — are equally amber and want completely different things
 * done about them.
 */
export type BackupReason = 'ok' | 'unconfigured' | 'never' | 'stale' | 'failing' | 'localOnly';

export type BackupRun = {
  state: 'ok' | 'failed';
  message: string;
  finishedAt: Date | null;
  lastSuccessAt: Date | null;
  durationSeconds: number;
  dump: { file: string; bytes: number };
  files: { count: number; bytes: number };
  offsite: {
    configured: boolean;
    repository: string;
    snapshotId: string | null;
    snapshotCount: number;
  };
};

export type BackupVerification = {
  state: 'ok' | 'warning' | 'failed';
  message: string;
  checkedAt: Date | null;
  lastPassedAt: Date | null;
  source: 'offsite' | 'local';
  snapshotId: string | null;
  dumpFile: string;
  repositoryCheck: 'ok' | 'failed' | 'skipped';
  tables: { table: string; live: number; restored: number }[];
  files: { expected: number; present: number; missing: number; missingSamples: string[] };
};

export type BackupStatus = {
  /** False when nothing has ever written a status file — development, or a stack deployed before the sidecar existed. */
  configured: boolean;
  run: BackupRun | null;
  verification: BackupVerification | null;
  severity: BackupSeverity;
  /** Which sentence the banner should say. See `assess`. */
  reason: BackupReason;
  /** Hours since the last successful backup, or null if there has never been one. */
  ageHours: number | null;
};

// --- Reading the files ------------------------------------------------------

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A timestamp the shell wrote, or null. `new Date('nonsense')` is an Invalid
 * Date rather than a throw, and an Invalid Date renders as "Invalid Date" on
 * the page and poisons every subtraction it touches — so it is turned into null
 * here, once, rather than guarded against at each use.
 */
function asDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  if (!STATUS_DIR) return null;
  try {
    const raw = await readFile(path.join(STATUS_DIR, file), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    // A missing file is the ordinary case before the first run, and an
    // unparseable one is the sidecar being interrupted mid-write. Neither is
    // worth a stack trace, and neither is worth failing a page render over.
    return null;
  }
}

export function parseRun(raw: Record<string, unknown> | null): BackupRun | null {
  if (!raw) return null;

  const dump = (raw.dump ?? {}) as Record<string, unknown>;
  const files = (raw.files ?? {}) as Record<string, unknown>;
  const offsite = (raw.offsite ?? {}) as Record<string, unknown>;

  return {
    // Anything that is not literally "ok" is treated as a failure. A status
    // file this module cannot understand is not evidence that a backup worked.
    state: raw.state === 'ok' ? 'ok' : 'failed',
    message: asString(raw.message),
    finishedAt: asDate(raw.finishedAt),
    lastSuccessAt: asDate(raw.lastSuccessAt),
    durationSeconds: asNumber(raw.durationSeconds),
    dump: { file: asString(dump.file), bytes: asNumber(dump.bytes) },
    files: { count: asNumber(files.count), bytes: asNumber(files.bytes) },
    offsite: {
      configured: offsite.configured === true,
      repository: asString(offsite.repository),
      snapshotId: asString(offsite.snapshotId) || null,
      snapshotCount: asNumber(offsite.snapshotCount),
    },
  };
}

export function parseVerification(
  raw: Record<string, unknown> | null,
): BackupVerification | null {
  if (!raw) return null;

  const files = (raw.files ?? {}) as Record<string, unknown>;
  const tables = Array.isArray(raw.tables) ? raw.tables : [];
  const samples = Array.isArray(files.missingSamples) ? files.missingSamples : [];

  return {
    state: raw.state === 'ok' ? 'ok' : raw.state === 'warning' ? 'warning' : 'failed',
    message: asString(raw.message),
    checkedAt: asDate(raw.checkedAt),
    lastPassedAt: asDate(raw.lastPassedAt),
    source: raw.source === 'offsite' ? 'offsite' : 'local',
    snapshotId: asString(raw.snapshotId) || null,
    dumpFile: asString(raw.dumpFile),
    repositoryCheck:
      raw.repositoryCheck === 'ok' ? 'ok' : raw.repositoryCheck === 'failed' ? 'failed' : 'skipped',
    tables: tables.flatMap((entry) => {
      if (entry === null || typeof entry !== 'object') return [];
      const row = entry as Record<string, unknown>;
      return [
        {
          table: asString(row.table),
          live: asNumber(row.live, -1),
          restored: asNumber(row.restored, -1),
        },
      ];
    }),
    files: {
      expected: asNumber(files.expected),
      present: asNumber(files.present),
      missing: asNumber(files.missing),
      missingSamples: samples.filter((s): s is string => typeof s === 'string'),
    },
  };
}

// --- The verdict ------------------------------------------------------------

/**
 * What to say, and how loudly, given the last run and the clock.
 *
 * Kept separate from the reading so it can be tested without a filesystem —
 * this is the decision the banner is built on, and it is the one place a
 * mistake would be invisible in exactly the situation it exists for.
 *
 * Two rules do the real work here.
 *
 * **Age is measured from the last success, never the last attempt.** A sidecar
 * that has been failing every twelve hours since Tuesday is running perfectly
 * and protecting nothing; judging it by `finishedAt` would show a green light
 * on a practice with a week-old backup.
 *
 * **A copy that never leaves the building is not healthy.** When the offsite
 * repository is unconfigured the sidecar still dumps, still succeeds, and still
 * writes a cheerful status file — but every copy it makes sits on the same disk
 * as the database it protects, so the dead disk that is the realistic disaster
 * for a single-clinic Postgres takes both. Reporting that as green would be
 * this module doing the exact thing it exists to prevent.
 */
export function assess(
  run: BackupRun | null,
  now: Date = new Date(),
): { severity: BackupSeverity; reason: BackupReason } {
  if (!run) return { severity: 'unknown', reason: 'unconfigured' };
  if (!run.lastSuccessAt) return { severity: 'critical', reason: 'never' };

  const ageHours = (now.getTime() - run.lastSuccessAt.getTime()) / 3_600_000;

  if (ageHours >= BACKUP_CRITICAL_HOURS) return { severity: 'critical', reason: 'stale' };
  // A single failed run is a warning while a good copy is still recent, and
  // becomes critical on its own as that copy ages out above. Reporting it as
  // critical immediately would mean a transient network blip during one run
  // puts a red bar across a practice whose backup is four hours old.
  if (run.state === 'failed') return { severity: 'late', reason: 'failing' };
  if (ageHours >= BACKUP_LATE_HOURS) return { severity: 'late', reason: 'stale' };

  // Last, because every condition above is a live problem and this one is an
  // unfinished setup step. It is still amber rather than green: local-only is
  // better than nothing and it is not a backup.
  if (!run.offsite.configured) return { severity: 'late', reason: 'localOnly' };

  return { severity: 'ok', reason: 'ok' };
}

export function severityOf(run: BackupRun | null, now: Date = new Date()): BackupSeverity {
  return assess(run, now).severity;
}

function ageHoursOf(run: BackupRun | null, now: Date = new Date()): number | null {
  if (!run?.lastSuccessAt) return null;
  return (now.getTime() - run.lastSuccessAt.getTime()) / 3_600_000;
}

/**
 * Everything the Staff page and the banner need, in one read.
 *
 * Never throws. The worst outcome available to it is `configured: false`, which
 * the screen reports as "not set up" rather than as "fine".
 */
export async function getBackupStatus(now: Date = new Date()): Promise<BackupStatus> {
  const [runRaw, verifyRaw] = await Promise.all([readJson('backup.json'), readJson('verify.json')]);

  const run = parseRun(runRaw);
  const verification = parseVerification(verifyRaw);
  const { severity, reason } = assess(run, now);

  return {
    configured: run !== null,
    run,
    verification,
    severity,
    reason,
    ageHours: ageHoursOf(run, now),
  };
}

/** Bytes, for a card that has to fit the number in a row. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}
