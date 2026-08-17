import { ACTIVE_STOCK } from '@/lib/queries';
import { prisma } from '@/lib/prisma';

/**
 * What this practice actually uses when it does this treatment.
 *
 * The catalogue used to carry a bill of materials per service, and recording a
 * visit spent it. That was retired for a good reason: it was a *prediction* —
 * the catalogue's guess at what a filling costs, applied whether or not that is
 * what came out of the drawer — and scanning the box at the chair is both more
 * accurate and honest about the extraction that took two carpules instead of one.
 *
 * But scanning only records what somebody scans, and a practice that scans
 * nothing has a cupboard whose count moves once a quarter at stocktake. So this
 * is the middle path, and the difference from the old bill of materials is the
 * whole point: it is not a rule anybody typed, it is the ledger read back. These
 * are the materials that were genuinely consumed at visits where this treatment
 * was recorded, in the amounts they were genuinely consumed in, offered as a
 * starting figure somebody confirms or corrects rather than a deduction that
 * happens silently.
 *
 * Archived materials are left out: a suggestion to spend something the practice
 * has stopped buying is worse than no suggestion.
 */

export type MaterialSuggestion = {
  itemId: string;
  name: string;
  /** Boxes on the shelf right now, so the form can say when it is short. */
  onHand: number;
  /** Typical boxes per visit, rounded — the figure the field starts at. */
  typicalQuantity: number;
  /** How many past visits this is drawn from. Below a handful it is a guess. */
  visits: number;
};

/**
 * How many past movements to read. A cap rather than a date window: a treatment
 * done twice a year needs a long memory, and one done daily needs no more than
 * the recent past to be representative.
 */
const SAMPLE_SIZE = 400;

export async function suggestMaterials(serviceIds: string[]): Promise<MaterialSuggestion[]> {
  const wanted = serviceIds.filter(Boolean);
  if (wanted.length === 0) return [];

  const movements = await prisma.stockMovement.findMany({
    where: {
      // Consumption only. A delivery tells you what was bought, which is a
      // different question and would swamp the average if counted.
      delta: { lt: 0 },
      visitRecordId: { not: null },
      item: ACTIVE_STOCK,
      visitRecord: { services: { some: { serviceId: { in: wanted } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: SAMPLE_SIZE,
    select: {
      itemId: true,
      delta: true,
      visitRecordId: true,
      item: { select: { name: true, quantity: true } },
    },
  });

  // Per item: how much went, and across how many distinct visits.
  //
  // Distinct *visits*, not movements — a material drawn from two lots in one
  // visit writes two rows, and counting those as two visits would halve the
  // typical amount and suggest one carpule where two are always used.
  const tally = new Map<
    string,
    { name: string; onHand: number; units: number; visits: Set<string> }
  >();

  for (const movement of movements) {
    const row = tally.get(movement.itemId) ?? {
      name: movement.item.name,
      onHand: movement.item.quantity,
      units: 0,
      visits: new Set<string>(),
    };
    row.units += Math.abs(movement.delta);
    if (movement.visitRecordId) row.visits.add(movement.visitRecordId);
    tally.set(movement.itemId, row);
  }

  return [...tally.entries()]
    .map(([itemId, row]) => ({
      itemId,
      name: row.name,
      onHand: row.onHand,
      // At least one: a material that appears at all is used at least once, and
      // rounding a genuinely small average down to zero would offer a chip that
      // spends nothing.
      typicalQuantity: Math.max(1, Math.round(row.units / Math.max(1, row.visits.size))),
      visits: row.visits.size,
    }))
    // Most-used first — the drawer's own order of likelihood.
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name))
    .slice(0, 12);
}

/**
 * Parse the form's `itemId:quantity` list.
 *
 * One field rather than a pair per material: the chips are built in the browser
 * from an answer the server gave, and a form that has to name every possible
 * material as a field would carry the whole storage room on every visit.
 */
export function parseMaterialList(value: string): Array<{ itemId: string; quantity: number }> {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [itemId, rawQuantity] = entry.split(':');
      return { itemId: (itemId ?? '').trim(), quantity: Number.parseInt(rawQuantity ?? '', 10) };
    })
    .filter((entry) => entry.itemId.length > 0 && Number.isFinite(entry.quantity) && entry.quantity > 0);
}
