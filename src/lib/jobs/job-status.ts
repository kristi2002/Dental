/**
 * What the scheduled jobs have actually been doing.
 *
 * `run.ts` has always written a `JobRun` row for every attempt, and until now
 * **nothing read them**. The registry's own comment says "the `JobRun` row is
 * where that proof accumulates" and `.env.production.example` tells the operator
 * to leave the sweep in report-only mode "until a few JobRun rows say it is
 * finding what you expect" — against a database no screen in the app queried.
 *
 * So the failure mode was the quiet one. `queue-appointment-reminders` starts
 * throwing in September — a null contact, a schema change, anything — and fails
 * silently every evening at six. No patient is reminded of anything for months,
 * no-shows climb, and nobody connects the two. The rows recording it were there
 * the whole time.
 *
 * Same shape as `backup-status.ts` beside it, for the same reason: the verdict
 * is a pure function of the rows and the clock, so it can be tested without a
 * database, and it is the one decision where a mistake would be invisible in
 * exactly the situation it exists for.
 */

import { prisma } from '@/lib/prisma';
import { JOBS } from './registry';

/** Ordered by how loudly the screen should say it. */
export type JobSeverity = 'ok' | 'late' | 'critical' | 'unknown';

export type JobReason =
  /** Last run finished and succeeded, recently enough. */
  | 'ok'
  /** Last run finished and threw. */
  | 'failing'
  /** Nothing has run for well over the expected interval. */
  | 'overdue'
  /** A row was opened and never closed — the container died mid-run. */
  | 'stalled'
  /** Registered, scheduled, and no row has ever been written for it. */
  | 'never';

export type JobState = {
  name: string;
  description: string;
  everyHours: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  ok: boolean | null;
  summary: string | null;
  error: string | null;
  lastSuccessAt: Date | null;
  severity: JobSeverity;
  reason: JobReason;
};

export type JobsStatus = {
  jobs: JobState[];
  /** The worst of them — what the banner, if any, should show. */
  severity: JobSeverity;
};

/**
 * How far past its expected interval a job may drift before it is overdue.
 *
 * Generous on purpose. A daily job legitimately runs a little late, a container
 * restart can skip one firing, and a nightly job that ran at 18:00 yesterday is
 * 24 hours old for a moment every evening before today's run — so a factor of
 * 1 would put a warning on a healthy practice once a day. Two and a half means
 * a daily job has to miss two consecutive evenings, and the weekly sweep most
 * of a fortnight, before anybody is told. Both are unambiguous.
 */
const OVERDUE_FACTOR = 2.5;

/**
 * How long a run may sit unfinished before it counts as stalled rather than
 * still going. Matches `STALE_RUN_MS` in `run.ts`, which is the point at which
 * the runner itself stops believing an in-flight row.
 */
const STALLED_AFTER_MS = 60 * 60 * 1000;

/** One job's last attempt, as the database holds it. */
export type LastRun = {
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  summary: string | null;
  error: string | null;
};

/**
 * The verdict for one job.
 *
 * Order matters, and it is the same reasoning `backup-status.ts` uses: age is
 * measured from the last **success**, never the last attempt. A job failing
 * every evening since Tuesday is running perfectly and achieving nothing, and
 * judging it by `startedAt` would show a green light on a practice whose
 * reminders stopped a week ago.
 */
export function assess(
  last: LastRun | null,
  lastSuccessAt: Date | null,
  everyHours: number,
  now: Date = new Date(),
): { severity: JobSeverity; reason: JobReason } {
  if (!last) return { severity: 'unknown', reason: 'never' };

  // Opened and never closed. Distinct from a failure: nothing wrote a verdict,
  // so the run did not finish badly — it did not finish.
  if (!last.finishedAt) {
    const inFlightMs = now.getTime() - last.startedAt.getTime();
    if (inFlightMs > STALLED_AFTER_MS) return { severity: 'critical', reason: 'stalled' };
    return { severity: 'ok', reason: 'ok' };
  }

  const overdueMs = everyHours * 3_600_000 * OVERDUE_FACTOR;

  // Never once succeeded, and something has been trying: worse than overdue,
  // because there is no good copy of this job's work anywhere behind it.
  if (!lastSuccessAt) return { severity: 'critical', reason: 'failing' };

  const sinceSuccessMs = now.getTime() - lastSuccessAt.getTime();
  if (sinceSuccessMs > overdueMs) {
    // Both true — stopped succeeding *and* long enough ago to matter. The
    // failure is the more useful thing to say, so it wins the reason while the
    // age decides the severity.
    return { severity: 'critical', reason: last.ok === false ? 'failing' : 'overdue' };
  }

  // A single failure while a recent success stands behind it is amber, not red,
  // and becomes red on its own as that success ages out above. Otherwise one
  // transient blip paints a warning across a practice whose job ran fine
  // yesterday.
  if (last.ok === false) return { severity: 'late', reason: 'failing' };

  return { severity: 'ok', reason: 'ok' };
}

const RANK: Record<JobSeverity, number> = { ok: 0, unknown: 1, late: 2, critical: 3 };

export function worstOf(severities: JobSeverity[]): JobSeverity {
  return severities.reduce<JobSeverity>(
    (worst, next) => (RANK[next] > RANK[worst] ? next : worst),
    'ok',
  );
}

/**
 * Every registered job with its last attempt and last success.
 *
 * Driven by the registry rather than by the table, so a job that has never run
 * is reported as `never` instead of simply being absent from the screen —
 * "nothing has ever triggered this" being precisely the state worth seeing.
 *
 * Never throws: a database that cannot answer reports `unknown`, which the
 * screen says out loud rather than rendering as health.
 */
export async function getJobsStatus(now: Date = new Date()): Promise<JobsStatus> {
  const names = Object.keys(JOBS);

  const jobs = await Promise.all(
    names.map(async (name): Promise<JobState> => {
      const definition = JOBS[name];
      const base = {
        name,
        description: definition.description,
        everyHours: definition.everyHours,
      };

      let last: LastRun | null = null;
      let lastSuccessAt: Date | null = null;

      try {
        [last, lastSuccessAt] = await Promise.all([
          prisma.jobRun.findFirst({
            where: { name },
            orderBy: { startedAt: 'desc' },
            select: {
              startedAt: true,
              finishedAt: true,
              ok: true,
              summary: true,
              error: true,
            },
          }),
          prisma.jobRun
            .findFirst({
              where: { name, ok: true },
              orderBy: { startedAt: 'desc' },
              select: { finishedAt: true, startedAt: true },
            })
            .then((row) => row?.finishedAt ?? row?.startedAt ?? null),
        ]);
      } catch {
        return {
          ...base,
          startedAt: null,
          finishedAt: null,
          ok: null,
          summary: null,
          error: null,
          lastSuccessAt: null,
          severity: 'unknown',
          reason: 'never',
        };
      }

      const { severity, reason } = assess(last, lastSuccessAt, definition.everyHours, now);

      return {
        ...base,
        startedAt: last?.startedAt ?? null,
        finishedAt: last?.finishedAt ?? null,
        ok: last?.ok ?? null,
        summary: last?.summary ?? null,
        error: last?.error ?? null,
        lastSuccessAt,
        severity,
        reason,
      };
    }),
  );

  return { jobs, severity: worstOf(jobs.map((job) => job.severity)) };
}
