/**
 * Which courses of treatment a screen — or a file — is asking for.
 *
 * Lifted out of `/plans/page.tsx`, where it lived as a private function, the
 * moment a second caller appeared. The export beside that page promises to hand
 * over "what is on screen", and a promise like that is only kept if there is one
 * implementation of what "on screen" means — the same reasoning the works
 * register's `filterWorks` is written down under, and the same failure if it is
 * not: two readings of one tab that disagree only for the rows nobody checks.
 */

import type { Prisma } from '@/generated/prisma/client';
import { TreatmentPlanStatus } from '@/generated/prisma/enums';

/**
 * The four tabs. Three are a plan's own status; `stalled` is a *derived* subset
 * of the open ones — see `summarisePlan`, which is where "quiet for sixty days
 * with nothing booked" is decided — and so cannot be asked of the database.
 */
export type PlanFilter = 'open' | 'stalled' | 'completed' | 'cancelled';
export const PLAN_FILTERS: PlanFilter[] = ['open', 'stalled', 'completed', 'cancelled'];

/** The two tabs that hold history rather than work. */
export const isArchive = (filter: PlanFilter) =>
  filter === 'completed' || filter === 'cancelled';

/** Anything unrecognised opens on the working tab rather than throwing. */
export function toPlanFilter(value: string | null | undefined): PlanFilter {
  return PLAN_FILTERS.includes(value as PlanFilter) ? (value as PlanFilter) : 'open';
}

/** The status a tab reads. `stalled` is open plans, narrowed afterwards. */
export function planStatusFor(filter: PlanFilter): TreatmentPlanStatus {
  if (filter === 'completed') return TreatmentPlanStatus.COMPLETED;
  if (filter === 'cancelled') return TreatmentPlanStatus.CANCELLED;
  return TreatmentPlanStatus.ACTIVE;
}

/**
 * One box, three things somebody might remember: whose plan it is, what the plan
 * was called, or the treatment itself.
 *
 * Asked of the database rather than of an array. Every open plan in the practice
 * used to be loaded with all of its steps and then filtered in JavaScript, which
 * is a scan of the whole table to answer a question Postgres was already holding
 * an index for.
 *
 * `mode: 'insensitive'` is case-folding, not accent-folding: Postgres will match
 * "MARIA" for "maria" but not "Kelmendi" for "Kelmëndi". The patient half of the
 * search therefore also goes through `searchKey`, which is the accent-stripped
 * column the patient list already searches on, so a plan is findable by its
 * owner exactly as its owner is.
 */
export function planWhere(
  status: TreatmentPlanStatus,
  query: string,
): Prisma.TreatmentPlanWhereInput {
  if (!query) return { status };

  const folded = query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();

  return {
    status,
    OR: [
      { title: { contains: query, mode: 'insensitive' } },
      { steps: { some: { title: { contains: query, mode: 'insensitive' } } } },
      { patient: { searchKey: { contains: folded } } },
      { patient: { firstName: { contains: query, mode: 'insensitive' } } },
      { patient: { lastName: { contains: query, mode: 'insensitive' } } },
    ],
  };
}
