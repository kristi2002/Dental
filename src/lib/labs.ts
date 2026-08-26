import { cache } from 'react';
import { prisma } from '@/lib/prisma';

/**
 * The laboratories the practice sends work to.
 *
 * The twin of `work-procedures.ts`, and it exists for the same reason with one
 * addition. `WorkLine.lab` was free text, so one laboratory was three spellings
 * and "what did we send DentalTech this quarter" could not be asked. That is
 * the `WorkProcedure` argument exactly.
 *
 * What is different is that a laboratory can be *rung*. The follow-up board
 * exists more or less because somebody has to chase a bridge on Thursday, and
 * until this table there was nowhere to keep the number — so the dashboard's
 * "waiting on the laboratory" panel offered the only telephone number the
 * register held, which was the patient's.
 *
 * No "adopt what the register already says" flow, unlike the procedures list.
 * The migration that created this table did that once, for every spelling in the
 * register, folding case and whitespace as it went — so a practice arrives here
 * with its laboratories already named rather than with a list of suggestions.
 */

export type LabOption = {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
};

/** Active only, in picker order. A retired laboratory is off every form. */
export const getLabs = cache(async (): Promise<LabOption[]> => {
  const rows = await prisma.lab.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, phone: true, email: true, notes: true },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    email: row.email ?? '',
    notes: row.notes ?? '',
  }));
});

export type LabUsage = LabOption & {
  archivedAt: Date | null;
  /** How many lines in the register name this laboratory. */
  lines: number;
  /** How many of those are still out — the number that makes retiring it a decision. */
  outstanding: number;
};

/**
 * Every laboratory including the retired ones, with what the register owes them.
 *
 * `outstanding` is the figure the list is really for: retiring a laboratory with
 * four cases still at it is a thing somebody should be told before they press
 * the button, not after.
 */
export async function getLabUsage(): Promise<LabUsage[]> {
  const [labs, counts] = await Promise.all([
    prisma.lab.findMany({
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        notes: true,
        archivedAt: true,
      },
    }),
    prisma.workLine.findMany({
      where: { labId: { not: null } },
      select: { labId: true, work: { select: { receivedAt: true } } },
    }),
  ]);

  const lines = new Map<string, number>();
  const outstanding = new Map<string, number>();
  for (const line of counts) {
    const id = line.labId!;
    lines.set(id, (lines.get(id) ?? 0) + 1);
    if (line.work.receivedAt === null) {
      outstanding.set(id, (outstanding.get(id) ?? 0) + 1);
    }
  }

  return labs.map((lab) => ({
    id: lab.id,
    name: lab.name,
    phone: lab.phone ?? '',
    email: lab.email ?? '',
    notes: lab.notes ?? '',
    archivedAt: lab.archivedAt,
    lines: lines.get(lab.id) ?? 0,
    outstanding: outstanding.get(lab.id) ?? 0,
  }));
}

/**
 * The laboratories on one case, deduplicated, with whatever can be dialled.
 *
 * A case is not always one laboratory — a bridge and a denture can go to
 * different benches on one impression — so this is a list rather than a field.
 * It is nearly always one entry, which is why the chase row prints them inline.
 *
 * Lines written before the table existed have a name and no row; they are kept,
 * with no number, because "we sent this to Fier and have no way to ring them" is
 * a more useful thing for a chase list to say than nothing at all.
 */
export type LabContact = { id: string | null; name: string; phone: string; email: string };

export function labsOnCase(
  lines: ReadonlyArray<{
    lab: string | null;
    labRef: { id: string; name: string; phone: string | null; email: string | null } | null;
  }>,
): LabContact[] {
  const seen = new Map<string, LabContact>();

  for (const line of lines) {
    const name = line.labRef?.name ?? line.lab?.trim() ?? '';
    if (!name) continue;

    // Keyed on the row when there is one and on the folded text when there is
    // not, so two lines naming one laboratory collapse whether or not the
    // migration reached them.
    const key = line.labRef?.id ?? `text:${name.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.set(key, {
      id: line.labRef?.id ?? null,
      name,
      phone: line.labRef?.phone ?? '',
      email: line.labRef?.email ?? '',
    });
  }

  return [...seen.values()];
}
