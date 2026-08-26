import { assessJob, type JobHealth, type JobRunLike } from '@/lib/job-status';
import { prisma } from '@/lib/prisma';
import { JOBS } from './registry';

/**
 * Every registered job, what it did last, and whether that is good enough.
 *
 * Driven by the registry rather than by the table, which is the important half:
 * a job that has *never run at all* is the single most likely thing to be wrong
 * with a deployment — the sidecar unwired, `JOBS_SECRET` mismatched, the
 * container never started — and a list built from `JobRun` rows could not
 * contain it. The rows are what fill each entry in; the registry is what says
 * the entry should exist.
 *
 * A run whose name is no longer in the registry is deliberately not listed. The
 * schema keeps `JobRun.name` as free text so that history stays readable, and
 * this screen answers "is the clock working", which is a question about jobs
 * that still exist.
 */
export type JobBoardRow = {
  /** The registry key — also the translation key for its name on screen. */
  name: string;
  /** The registry's own English one-liner, for the reader with no translation. */
  description: string;
  everyHours: number;
  health: JobHealth;
  latest: JobRunLike | null;
  /**
   * When the job last actually worked. Carried as the real instant rather than
   * derived back from `health.staleHours`, which is floored to whole hours and
   * would put "2 hours ago" on a run that finished twenty minutes back.
   */
  lastSuccessAt: Date | null;
};

/** What both reads select. Named once so the two cannot drift apart. */
const RUN_FIELDS = {
  startedAt: true,
  finishedAt: true,
  ok: true,
  summary: true,
  error: true,
} as const;

export async function getJobBoard(now: Date = new Date()): Promise<JobBoardRow[]> {
  const names = Object.keys(JOBS);

  // Two reads per job rather than one over the table: "the newest run" and "the
  // newest run that worked" are different rows, and the whole point of the
  // second is that it is often much older than the first. Two indexed lookups
  // per job, against a registry that holds two entries — the shape that would
  // matter at a hundred jobs is not the shape this needs.
  const rows = await Promise.all(
    names.map(async (name) => {
      const [latest, lastSuccess] = await Promise.all([
        prisma.jobRun.findFirst({
          where: { name },
          orderBy: { startedAt: 'desc' },
          select: RUN_FIELDS,
        }),
        prisma.jobRun.findFirst({
          where: { name, ok: true },
          orderBy: { startedAt: 'desc' },
          select: RUN_FIELDS,
        }),
      ]);

      const job = JOBS[name];
      return {
        name,
        description: job.description,
        everyHours: job.everyHours,
        health: assessJob({ latest, lastSuccess }, job.everyHours, now),
        latest,
        lastSuccessAt: lastSuccess?.startedAt ?? null,
      };
    }),
  );

  return rows;
}
