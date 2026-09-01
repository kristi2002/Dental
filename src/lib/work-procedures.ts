import { prisma } from './prisma';

/**
 * The catalogue of work the practice sends out, and what the register has been
 * calling it so far.
 *
 * Kept out of `queries.ts` on purpose: half of this file is a migration aid
 * rather than a query, and it wants to be read next to the reasoning for why it
 * exists at all.
 */

export type WorkProcedureOption = { id: string; name: string };

/**
 * The whole catalogue, retired entries included — for the management page,
 * which is the one screen that has to be able to see what it is un-retiring.
 */
export async function getAllWorkProcedures(): Promise<
  Array<WorkProcedureOption & { archivedAt: Date | null }>
> {
  return prisma.workProcedure.findMany({
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, archivedAt: true },
  });
}

/** The list every `punimi` field offers, alphabetical because it is picked from. */
export async function getWorkProcedures(): Promise<WorkProcedureOption[]> {
  return prisma.workProcedure.findMany({
    where: ACTIVE_PROCEDURES,
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/**
 * The shared "not retired" filter, the same shape `ACTIVE_STOCK` has. A kind of
 * work the practice has stopped sending leaves every picker and stays on every
 * case that named it — see `WorkProcedure.archivedAt`.
 */
export const ACTIVE_PROCEDURES = { archivedAt: null } as const;

/**
 * What a `punimi` field should offer.
 *
 * The catalogue, unless there is not one yet — on the day this ships there will
 * not be, because the deploy pushes the schema and never a backfill. A select
 * with nothing in it would make the case form unusable, so until the practice
 * has named its work the field offers what the register has been writing all
 * along. The catalogue page turns that list into real entries; the moment it has
 * one, it is the only thing offered.
 *
 * Rows rather than names, since `WorkLine.procedureId` exists: a fallback entry
 * carries an empty id, which is the honest thing to say about a spelling that
 * is not in the catalogue and is what the line will store for it.
 */
export async function getProcedureOptions(): Promise<WorkProcedureOption[]> {
  const catalogue = await getWorkProcedures();
  if (catalogue.length > 0) return catalogue;

  const usage = await getProcedureUsage();
  return usage
    .map((row) => ({ id: '', name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A name the register has actually used, and how many lines used it. */
export type ProcedureUsage = { name: string; lines: number };

/**
 * What the register has been calling its work, counted.
 *
 * One `GROUP BY` rather than a count per catalogue entry: the catalogue is a
 * handful of rows and the register is thousands, so the cheap direction is to
 * ask the big table once and match the small list against the answer.
 *
 * Spellings that differ only in case are merged — "Zirkon" and "zirkon" are one
 * thing being counted, and the whole point of the catalogue is that they stop
 * being two.
 */
export async function getProcedureUsage(): Promise<ProcedureUsage[]> {
  const used = await prisma.workLine.groupBy({
    by: ['procedure'],
    _count: { procedure: true },
  });

  const merged = new Map<string, ProcedureUsage>();
  for (const row of used) {
    const name = row.procedure.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    const found = merged.get(key);
    if (found) found.lines += row._count.procedure;
    else merged.set(key, { name, lines: row._count.procedure });
  }

  return [...merged.values()];
}

/** How much of the register would lose its wording if this entry were renamed. */
export function linesUsing(usage: ReadonlyArray<ProcedureUsage>, name: string): number {
  const key = name.trim().toLowerCase();
  return usage.find((row) => row.name.toLowerCase() === key)?.lines ?? 0;
}

/**
 * The names already written down the register that the catalogue has not got.
 *
 * The catalogue arrives empty, and nothing carries the old free text across on
 * its own. That is a choice rather than a limitation: a migration could adopt
 * every distinct spelling, and it should not. A silent adoption would resurrect
 * itself every time the practice deleted an entry, and a bulk one would enshrine
 * the typos. So the names are *offered*: each becomes a button on the catalogue
 * page.
 *
 * That turns the migration into the job the catalogue exists for. A register
 * that has been typing "Kurorë zirkoni", "kurore zirkon" and "Zirkon" shows all
 * three, commonest first, and the practice adds the one it means instead of
 * inheriting its own typos.
 */
export function unnamedProcedures(
  usage: ReadonlyArray<ProcedureUsage>,
  known: ReadonlyArray<string>,
): ProcedureUsage[] {
  const named = new Set(known.map((name) => name.trim().toLowerCase()));

  return usage
    .filter((row) => !named.has(row.name.toLowerCase()))
    // Commonest first: the name on forty cases is the one worth adding, and the
    // one written once is probably the typo.
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}
