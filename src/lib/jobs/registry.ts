import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { composeMorningDigest } from '@/lib/jobs/digest';
import { queueAppointmentReminders, queueRecalls } from '@/lib/messages/queue';
import { referencedStorageKeys } from '@/lib/storage-keys';

/**
 * The jobs a clock is allowed to run, and nothing else.
 *
 * **What does not belong here.** The app is "nudge, don't send" and
 * "derive, don't store": almost every question it answers is recomputed at read
 * time, so almost nothing needs a timer. Recall due-ness, snooze expiry, lab
 * overdue-ness, batch expiry and reorder urgency are comparisons made when
 * somebody looks, and they can never be stale. Adding any of them here would be
 * inventing a way for them to go wrong.
 *
 * Two more are deliberately absent:
 *
 *  - **Pruning the activity log.** `audit-retention.ts` states, at length, that
 *    a trim is a deliberate act somebody performs by hand and that nothing in
 *    the app or the deploy removes an entry. Scheduling it would overturn a
 *    decision about medical-record retention, which is not a decision a job
 *    registry gets to make.
 *  - **Closing yesterday's open appointments.** The blueprint's own note prefers
 *    surfacing them on the dashboard to writing NO_SHOW automatically, which
 *    drops it from a job to a query. Marking a patient absent is an accusation;
 *    it should have a person behind it.
 *
 * A job is a plain async function returning one line of summary. It gets no
 * arguments, because a job triggered by a clock has nobody to ask.
 */
export type Job = {
  /** What it is for, in one line — shown beside its last run. */
  description: string;
  /**
   * How often this must have **worked**, in hours. Not how often the clock
   * fires it.
   *
   * The distinction is the whole of it. The app cannot read the sidecar's
   * crontab — the schedule lives in `docker/jobs/entrypoint.sh` and every entry
   * there is overridable per deployment — so this could never be a mirror of it
   * anyway. What it is instead is the app's own statement of the interval within
   * which this job going quiet becomes a problem, which is what
   * `job-status.ts` needs and is a more stable thing than a schedule.
   *
   * The reminder queue is the case that makes the difference concrete: it is
   * triggered twice a day, once in the evening and once first thing, because the
   * evening run cannot see an evening booking. It is still a **daily** job — one
   * success a day is the practice's actual requirement, and the second trigger
   * is a way of meeting it more reliably rather than a doubling of the cadence.
   */
  everyHours: number;
  /** Returns the summary to record. Throwing is how a job fails. */
  run: () => Promise<string>;
};

/** Cadences, named rather than spelled as numbers at each use. */
const DAILY = 24;
const WEEKLY = 24 * 7;

/** An upload in flight is not an orphan — the same hour `sweep-orphan-files.ts` waits. */
const MIN_AGE_MS = 60 * 60 * 1000;

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * Delete files in the storage directory that no row points at.
 *
 * The scheduled twin of `prisma/sweep-orphan-files.ts`, sharing the part that
 * matters — `referencedStorageKeys`, which knows about all four columns that
 * name a file. It knew about one of them until very recently, and would have
 * deleted the other three's files; see `src/lib/storage-keys.ts`.
 *
 * **Reports by default and deletes only when told.** `JOBS_SWEEP_APPLY=true` is
 * the switch. A job that removes files on a clinic's disk should spend a while
 * proving it removes the right ones first, and the `JobRun` row is where that
 * proof accumulates — a fortnight of "9 orphans, 765 B" is what makes turning
 * it on an informed act rather than a hopeful one.
 */
async function sweepOrphanFiles(): Promise<string> {
  const apply = process.env.JOBS_SWEEP_APPLY === 'true';
  const dir =
    process.env.FILE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'patient-files');

  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'no storage directory';
    throw error;
  }

  const referenced = await referencedStorageKeys(prisma);

  const now = Date.now();
  let orphans = 0;
  let bytes = 0;
  let tooYoung = 0;

  for (const name of names) {
    if (referenced.has(name)) continue;

    const info = await stat(path.join(dir, name));
    if (!info.isFile()) continue;

    if (now - info.mtimeMs < MIN_AGE_MS) {
      tooYoung += 1;
      continue;
    }

    orphans += 1;
    bytes += info.size;
    if (apply) await unlink(path.join(dir, name));
  }

  const scope = `${names.length} on disk, ${referenced.size} referenced`;
  const found = `${orphans} orphaned (${human(bytes)})`;
  const recent = tooYoung > 0 ? `, ${tooYoung} too recent to judge` : '';

  return `${scope}; ${found}${recent} — ${apply ? 'removed' : 'reported only'}`;
}

export const JOBS: Record<string, Job> = {
  /**
   * Work out who needs reminding about tomorrow, and put them in the outbox.
   *
   * The first job that exists for the practice rather than for the machine, and
   * the first thing in this app that decides something about a patient without
   * being asked. It still sends nothing: it fills a queue a person works down.
   * That is the line the app has always drawn — see "nudge, don't send" in the
   * blueprint — and the clock does not move it.
   */
  'queue-appointment-reminders': {
    description: "Queue tomorrow's appointment reminders for somebody to send.",
    everyHours: DAILY,
    run: queueAppointmentReminders,
  },

  /**
   * Put the patients nobody has seen for months in front of somebody.
   *
   * Weekly, not daily, and the cadence is the argument: a recall is not urgent
   * on any particular morning — it is urgent over a season — and a queue that
   * refilled itself every night would be read as noise by the third day. The
   * recall list has always been there to be opened; this is the practice being
   * handed it instead of having to remember.
   *
   * Sends nothing, like everything else here. `getRecalls` decides who, this
   * writes a row, and a person decides whether.
   */
  'queue-recalls': {
    description: 'Queue the patients who are overdue for a check-up.',
    everyHours: WEEKLY,
    run: queueRecalls,
  },

  /**
   * Write down what was waiting on the practice this morning.
   *
   * The first job here that is about the practice rather than about a patient
   * or about the machine, and the only thing in the app that looks forward on
   * the practice's own behalf. It reads the same three piles the reminder board
   * reads and stores the numbers against the day.
   *
   * It sends nothing — see `lib/jobs/digest.ts`, which sets out why that is the
   * design and not a stage of it. The row it writes carries a `sentAt` that
   * stays null until somebody decides the practice should be emailed its own
   * board, with a mailer that is actually configured. Until then this is a
   * queue filling quietly, which is the point: the day that decision is made,
   * there is a history to send from rather than a feature to start writing.
   *
   * Daily, and idempotent on the day — a restart re-runs it and the unique
   * index on `forDay` turns the second write into a refresh.
   */
  'compose-morning-digest': {
    description: "Record what was waiting on the practice this morning. It sends nothing.",
    everyHours: DAILY,
    run: composeMorningDigest,
  },

  'sweep-orphan-files': {
    description: 'Remove uploaded files that no record points at any more.',
    everyHours: WEEKLY,
    run: sweepOrphanFiles,
  },
};

export function isJobName(value: string): value is keyof typeof JOBS {
  return Object.hasOwn(JOBS, value);
}
