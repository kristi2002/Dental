import { prisma } from '@/lib/prisma';
import { isJobName, JOBS } from './registry';

/**
 * Running one job, and writing down that it ran.
 *
 * The writing down is the point. A scheduled job with no record is a job that
 * has been failing since March and will be discovered when somebody wonders why
 * the disk is full — which is exactly how the backup used to work before it
 * grew a status file, and the same lesson applies here.
 *
 * The row is opened *before* the work starts and closed in a `finally`, so a
 * crash mid-run leaves a row with `finishedAt` null. That is deliberate: "did
 * not finish" and "finished badly" are different failures, and a runner that
 * only writes on success cannot tell you about the first one.
 */

/** Long enough to be diagnostic, short enough not to turn the table into a log. */
const MAX_SUMMARY = 500;
const MAX_ERROR = 2000;

/**
 * How long a run may be in flight before a new one is allowed to start anyway.
 *
 * There is one app container, so two runs of one job overlapping means either
 * the schedule fires faster than the job finishes, or a previous run died
 * without its `finally` — a container killed mid-sweep, say. The first deserves
 * a refusal; the second must not wedge the job forever, so the guard expires.
 *
 * Not a database lock. An advisory lock would be exact, and it would also tie
 * correctness to which pooled connection happened to serve the request, which
 * is a worse trade for a clinic running one of everything.
 */
const STALE_RUN_MS = 60 * 60 * 1000;

export type JobResult =
  | { status: 'ok'; summary: string; ms: number }
  | { status: 'busy' }
  | { status: 'unknown' }
  | { status: 'failed'; error: string; ms: number };

export async function runJob(name: string): Promise<JobResult> {
  if (!isJobName(name)) return { status: 'unknown' };

  const since = new Date(Date.now() - STALE_RUN_MS);
  const inFlight = await prisma.jobRun.findFirst({
    where: { name, finishedAt: null, startedAt: { gte: since } },
    select: { id: true },
  });
  if (inFlight) return { status: 'busy' };

  const run = await prisma.jobRun.create({ data: { name }, select: { id: true } });
  const startedAt = Date.now();

  try {
    const summary = (await JOBS[name].run()).slice(0, MAX_SUMMARY);
    const ms = Date.now() - startedAt;

    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, summary },
    });

    console.log(`[jobs] ${name}: ${summary} (${ms}ms)`);
    return { status: 'ok', summary, ms };
  } catch (error) {
    const ms = Date.now() - startedAt;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR);

    // Best-effort: if the database is what failed, there is nowhere to write
    // this, and the throw must not replace the original error in the log.
    try {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: false, error: message },
      });
    } catch (writeError) {
      console.error(`[jobs] ${name}: could not record the failure`, writeError);
    }

    console.error(`[jobs] ${name} failed after ${ms}ms:`, error);
    return { status: 'failed', error: message, ms };
  }
}
