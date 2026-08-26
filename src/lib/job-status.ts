/**
 * Whether the clock is actually running, and how loudly to say so.
 *
 * `JobRun`'s own doc comment has always claimed these rows "are read by the
 * same pages everything else is". They were read by nothing. Every reference to
 * `prisma.jobRun` in the repository was inside `runJob` — one in-flight guard
 * and two writes — so a job that had been throwing every evening since March
 * presented to the practice as **an empty outbox**, which the reminders screen
 * documents as the *good* state ("yesterday evening's was worked").
 *
 * The failure and the success looked identical. That is the whole gap, and it is
 * the same one the backup had before it grew a status file — so this module is
 * deliberately the shape of `backup-status.ts`: a pure `assess` the screen is
 * built on, kept apart from the reading so a mistake in it cannot hide in
 * exactly the situation it exists for.
 *
 * Two rules do the real work, and both are borrowed from that module because
 * both lessons were learned there first.
 *
 * **Age is measured from the last success, never the last attempt.** A job
 * failing every night is running perfectly and achieving nothing; judging it by
 * `startedAt` would put a green light on a practice whose reminders have not
 * been queued for a week.
 *
 * **A run that never finished is its own failure.** `runJob` opens the row
 * before the work and closes it in a `finally`, so a container killed mid-sweep
 * leaves `finishedAt` null forever. "Did not finish" and "finished badly" are
 * different things and a reader should be told which.
 */

/** Matching `BackupSeverity`, so the two cards on the staff page read alike. */
export type JobSeverity = 'ok' | 'late' | 'critical' | 'unknown';

/**
 * Why, in one word, so the badge and the sentence come from one decision.
 *
 * `stalled` is the crashed-mid-run case and `failing` the threw-an-error case.
 * They are separated because they call for different things: the first is a
 * container that went away, the second is a bug in the job.
 */
export type JobReason = 'ok' | 'never' | 'stale' | 'failing' | 'stalled' | 'running';

/** Just enough of a `JobRun` to judge it. Structural, so the query picks fields. */
export type JobRunLike = {
  startedAt: Date;
  /** Null while it is running — and forever, if it never got to its `finally`. */
  finishedAt: Date | null;
  /** Null while running, then true or false. */
  ok: boolean | null;
  summary: string | null;
  error: string | null;
};

export type JobHealth = {
  severity: JobSeverity;
  reason: JobReason;
  /** Whole hours since the last success, or null when there has never been one. */
  staleHours: number | null;
};

/**
 * How far past its cadence a job may drift before each verdict.
 *
 * Multiples of the job's own `everyHours` rather than fixed hours, because a
 * daily job and a weekly one are not late at the same age — six days without a
 * sweep is a Tuesday, and six days without the reminder queue is a week of
 * patients nobody rang.
 *
 * Two missed runs is amber and four is red: one skipped run is a deploy landing
 * on the wrong minute, and the sidecar's own log says as much. A pattern is not.
 */
const LATE_AFTER_RUNS = 2;
const CRITICAL_AFTER_RUNS = 4;

/**
 * How long a run may be in flight before "running" becomes "stalled".
 *
 * The same hour `runJob` waits before it will start a job over the top of an
 * unfinished one, and deliberately the same number: a run this screen still
 * calls healthy is exactly a run the runner would still refuse to duplicate.
 * Two different answers to "is this one still going?" is how a screen ends up
 * disagreeing with the thing it reports on.
 */
const STALE_RUN_HOURS = 1;

export function assessJob(
  runs: {
    /** The newest run of this job, whatever became of it. */
    latest: JobRunLike | null;
    /** The newest run that finished and reported success. */
    lastSuccess: JobRunLike | null;
  },
  everyHours: number,
  now: Date = new Date(),
): JobHealth {
  const { latest, lastSuccess } = runs;

  // Nothing has ever run. On a fresh deployment that is simply true; on one that
  // has been up a fortnight it means the sidecar is not wired to the app, which
  // is the failure this whole card exists to make visible. The card cannot tell
  // the two apart, so it says which it is and prints the cadence beside it —
  // and `unknown` rather than a colour, because guessing here would either cry
  // wolf on every first boot or stay quiet on every broken one.
  if (!latest) return { severity: 'unknown', reason: 'never', staleHours: null };

  const hoursSince = (from: Date) => (now.getTime() - from.getTime()) / 3_600_000;
  const staleHours = lastSuccess ? Math.floor(hoursSince(lastSuccess.startedAt)) : null;

  // In flight right now. Reported as its own state rather than folded into
  // whatever the last success was, because "it is working on it" is the one
  // answer that makes a reader wait rather than act.
  if (latest.finishedAt === null && hoursSince(latest.startedAt) < STALE_RUN_HOURS) {
    return { severity: 'ok', reason: 'running', staleHours };
  }

  if (staleHours === null) {
    // It has run and has never once succeeded. Whatever the last attempt did,
    // this job has achieved nothing since the day it was added.
    return { severity: 'critical', reason: latest.ok === false ? 'failing' : 'stalled', staleHours };
  }

  // Age first, and from the success. Everything below is about the most recent
  // attempt, which matters far less than whether the work is actually getting
  // done — a job that failed once an hour ago is in better shape than one whose
  // last success was in March, however cheerful its last row looks.
  if (staleHours >= everyHours * CRITICAL_AFTER_RUNS) {
    return { severity: 'critical', reason: 'stale', staleHours };
  }

  // A crashed run and a failed run, in that order: a row left open is the more
  // alarming of the two, because nothing wrote down what went wrong.
  if (latest.finishedAt === null) return { severity: 'late', reason: 'stalled', staleHours };
  if (latest.ok === false) return { severity: 'late', reason: 'failing', staleHours };

  if (staleHours >= everyHours * LATE_AFTER_RUNS) {
    return { severity: 'late', reason: 'stale', staleHours };
  }

  return { severity: 'ok', reason: 'ok', staleHours };
}

/**
 * The worst verdict across every job, for a heading that has to say one thing.
 *
 * `unknown` does not win over a real problem: a practice with one job never run
 * and another failing since March needs to be told about the second.
 */
const RANK: Record<JobSeverity, number> = { ok: 0, unknown: 1, late: 2, critical: 3 };

export function worstJobSeverity(
  healths: ReadonlyArray<Pick<JobHealth, 'severity'>>,
): JobSeverity {
  let worst: JobSeverity = 'ok';
  for (const health of healths) {
    if (RANK[health.severity] > RANK[worst]) worst = health.severity;
  }
  return worst;
}
