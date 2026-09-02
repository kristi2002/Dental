import { prisma } from '@/lib/prisma';

/**
 * A material's own history, read back.
 *
 * `StockMovement` is written faithfully by eight different paths and has never
 * been displayed anywhere. The schema calls it "a plain audit trail of what was
 * consumed and when"; the analytics page reads it in aggregate for one bar
 * chart, `reorder.ts` reads it for a burn rate, and no screen in the app has
 * ever been able to answer the question a person actually standing at a shelf
 * asks — *where did these go?*
 *
 * Which made the ledger's careful parts unfalsifiable. Every consumption records
 * which lot it came out of and which visit spent it, precisely so a recall
 * notice can be answered and a mis-recorded visit can be found; with nothing
 * rendering any of it, a wrong allocation looked exactly like a right one.
 */

/**
 * The reasons the application actually writes, and nothing else.
 *
 * `StockMovement.reason` is a free-text column and the schema shows it as one —
 * so this is a lookup with a fallback, not an enum. A row written by a script, by
 * an older version, or by hand shows its own text rather than being hidden or
 * mislabelled: an unrecognised reason is still a true fact about the shelf.
 */
const LEDGER_REASONS = {
  delivery: 'delivery',
  'delivery reversed': 'deliveryReversed',
  'scan in': 'scanIn',
  'scan out': 'scanOut',
  stocktake: 'stocktake',
  used: 'used',
  'used in visit': 'usedInVisit',
  restock: 'restock',
  'visit deleted': 'visitDeleted',
  'write-off': 'writeOff',
} as const satisfies Record<string, string>;

export type LedgerReason = (typeof LEDGER_REASONS)[keyof typeof LEDGER_REASONS];

/**
 * The translation key for a reason, or null when nothing is known about it.
 *
 * The stored values carry spaces and a hyphen — `used in visit`, `write-off` —
 * and are what eight call sites already write, so they are not going to change.
 * What changes is the key they are looked up under: next-intl reads a dot as
 * nesting, and a message id built by interpolating raw column text is one
 * schema change away from silently addressing the wrong namespace.
 */
export function reasonKey(reason: string | null): LedgerReason | null {
  if (!reason) return null;
  return (LEDGER_REASONS as Record<string, LedgerReason>)[reason] ?? null;
}

export type ConsumptionAdherence = {
  visits: number;
  /** Visits that booked at least one box out against themselves. */
  withMaterials: number;
  /** `withMaterials / visits`, or 1 when there were no visits to judge. */
  share: number;
};

/**
 * How often a visit actually records what it used.
 *
 * The figure the whole storage room rests on and nothing measured.
 *
 * Bills of materials were retired deliberately — `ServiceMaterial` says why, and
 * the reasoning is sound: a treatment that used two carpules instead of the
 * predicted one is a thing a bill of materials can never be honest about. What
 * replaced it is people. Consumption is recorded because somebody scans a box
 * out, or ticks a material chip on the visit form, and if they stop doing that
 * then the shelf count drifts, the ninety-day burn rate in `reorder.ts` goes
 * soft, the reorder suggestions quietly become wrong, and the cost-per-treatment
 * table is drawn from a shrinking corner of the practice.
 *
 * Every one of those screens goes on looking exactly as confident as before.
 * That is the failure this answers: not "the number is wrong" but "nothing tells
 * you the number stopped being fed".
 *
 * **Not a target, and must not be shown as one.** A check-up, a consultation and
 * a review legitimately consume nothing, so a healthy practice is nowhere near
 * 100% and chasing it would mean inventing consumption. What the figure is good
 * for is its *level* and its *drift*: 60% steady is a working system, 60%
 * falling to 15% over a quarter is the system being abandoned, and the second
 * one was previously invisible.
 */
export async function getConsumptionAdherence({
  from,
  to,
}: {
  from: Date;
  to: Date;
}): Promise<ConsumptionAdherence> {
  const window = { visitDate: { gte: from, lt: to } };

  const [visits, withMaterials] = await Promise.all([
    prisma.visitRecord.count({ where: window }),
    // Asked through the relation rather than by grouping movements: a movement
    // is dated when it was *written*, and a visit typed up the next morning
    // would fall outside a window its visit sits inside. The visit's own date is
    // the one both halves of this fraction have to agree on.
    prisma.visitRecord.count({
      where: { ...window, stockMovements: { some: { delta: { lt: 0 } } } },
    }),
  ]);

  return { visits, withMaterials, share: visits === 0 ? 1 : withMaterials / visits };
}

export type LedgerEntry = {
  id: string;
  /** Negative is off the shelf, positive is onto it. */
  delta: number;
  at: Date;
  /** Recognised reason, for the translated label. */
  reason: LedgerReason | null;
  /** What the column literally said, shown when the reason is not recognised. */
  rawReason: string;
  /** Who did it. Empty for a movement written before accounts, or by a script. */
  staffName: string;
  /** The lot it came out of, where the material is tracked by lot. */
  lotNumber: string;
  /** Set when a visit spent it — the link that makes a deduction traceable. */
  visitId: string;
  visitDate: Date | null;
  patientId: string;
  patientName: string;
};

/**
 * The last N movements for one material, newest first.
 *
 * Capped rather than paged. The ledger is append-only and never pruned — the
 * schema calls it the largest table in the database and the worst one to scan —
 * and a material bought weekly for three years has hundreds of rows nobody
 * scrolls to the end of. What a person at a shelf wants is the recent past, and
 * `@@index([itemId, createdAt])` is exactly the index that serves it.
 */
export async function getMaterialLedger(itemId: string, limit = 40): Promise<LedgerEntry[]> {
  const movements = await prisma.stockMovement.findMany({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      delta: true,
      reason: true,
      createdAt: true,
      staffUser: { select: { firstName: true, lastName: true } },
      batch: { select: { lotNumber: true } },
      visitRecord: {
        select: {
          id: true,
          visitDate: true,
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  return movements.map((movement) => ({
    id: movement.id,
    delta: movement.delta,
    at: movement.createdAt,
    reason: reasonKey(movement.reason),
    rawReason: movement.reason ?? '',
    staffName: movement.staffUser
      ? `${movement.staffUser.firstName} ${movement.staffUser.lastName}`.trim()
      : '',
    lotNumber: movement.batch?.lotNumber ?? '',
    visitId: movement.visitRecord?.id ?? '',
    visitDate: movement.visitRecord?.visitDate ?? null,
    patientId: movement.visitRecord?.patient?.id ?? '',
    patientName: movement.visitRecord?.patient
      ? `${movement.visitRecord.patient.firstName} ${movement.visitRecord.patient.lastName}`.trim()
      : '',
  }));
}
