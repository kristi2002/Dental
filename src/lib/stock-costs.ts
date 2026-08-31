import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * What the storage room costs, read back out of what was already typed.
 *
 * Every price in this file was recorded by somebody receiving a delivery, and
 * until now none of it was ever read. `StockBatch.unitPrice` is written by the
 * scanner, by the lot form and by the catalogue import; `StockItem.unitPrice` is
 * overwritten by whichever delivery priced it last. Three writers, no readers —
 * the practice paid the typing cost of an accounts system and got a set of
 * write-only columns.
 *
 * **Where this may be shown.** Money is off every storage-room screen by the
 * owner's decision, and that decision stands: the cupboard is read by whoever is
 * standing at it, and what the practice pays for a box is not their business.
 * The line the permission model already draws is `analytics.view` — held by the
 * owner and by the accountant, and withheld from the assistant and the front
 * desk, whose role comments say "no business figures" in as many words. So
 * everything here is for that page and no other, and nothing in this file may be
 * imported by a screen under `/stock`.
 *
 * **Honesty over completeness.** Not every box has a price, and the gaps are not
 * random — a delivery scanned from a symbol carrying no lot number and no expiry
 * creates no lot at all, so it carries no price either. Every function below
 * therefore reports what it could not account for alongside what it could. A
 * spend figure that quietly omits a third of the deliveries is worse than no
 * spend figure, because it looks like an answer.
 *
 * Arithmetic stays in `Prisma.Decimal` to the last line, for the reason
 * `src/lib/money.ts` gives: a cupboard valued by adding a few hundred floats
 * drifts by real money.
 */

const ZERO = new Prisma.Decimal(0);

/** A delivery, shaped for the analytics page's own month bucketing. */
export type DeliveryCost = {
  /** The invoice date where there is one, else the day it was typed in. */
  date: Date;
  amount: number;
};

export type SupplierSpend = {
  /** Empty for the group of materials nobody has said where to buy. */
  supplierId: string;
  supplierName: string;
  total: number;
  /** Boxes this covers — the figure that makes a total worth comparing. */
  boxes: number;
};

/**
 * How much of the window's receiving carried a price at all.
 *
 * Reported next to every spend figure rather than buried, because the ratio is
 * the difference between "we spent this" and "we spent at least this".
 */
export type SpendCoverage = {
  pricedBoxes: number;
  unpricedBoxes: number;
};

export type StockSpend = {
  deliveries: DeliveryCost[];
  bySupplier: SupplierSpend[];
  total: number;
  coverage: SpendCoverage;
};

/**
 * What was bought in a window, by month and by supplier.
 *
 * Dated by `purchasedAt` and not by `createdAt`, which is the distinction the
 * column was added for: `createdAt` is the keystroke, `purchasedAt` is the
 * invoice, and a lot entered a fortnight late lands in the wrong month under the
 * first. `createdAt` is the fallback only where nobody stated a purchase date,
 * which is the best available answer rather than a good one.
 *
 * A lot's cost is what arrived, not what is left: `quantity` is documented never
 * to change, which is exactly what makes it the figure an invoice can be checked
 * against months later. Drawing it down as the boxes were used would turn a
 * purchase ledger into a valuation, which is a different question.
 */
export async function getStockSpend({ from, to }: { from: Date; to: Date }): Promise<StockSpend> {
  const batches = await prisma.stockBatch.findMany({
    where: {
      OR: [
        { purchasedAt: { gte: from, lt: to } },
        { purchasedAt: null, createdAt: { gte: from, lt: to } },
      ],
    },
    select: {
      quantity: true,
      unitPrice: true,
      purchasedAt: true,
      createdAt: true,
      item: {
        select: {
          supplierId: true,
          supplier: { select: { name: true } },
        },
      },
    },
  });

  const deliveries: DeliveryCost[] = [];
  const suppliers = new Map<string, { name: string; total: Prisma.Decimal; boxes: number }>();
  let total = ZERO;
  let pricedBoxes = 0;
  let unpricedBoxes = 0;

  for (const batch of batches) {
    if (batch.unitPrice === null) {
      unpricedBoxes += batch.quantity;
      continue;
    }
    pricedBoxes += batch.quantity;

    const cost = batch.unitPrice.mul(batch.quantity);
    total = total.add(cost);
    deliveries.push({ date: batch.purchasedAt ?? batch.createdAt, amount: cost.toNumber() });

    const key = batch.item.supplierId ?? '';
    const group = suppliers.get(key) ?? {
      name: batch.item.supplier?.name ?? '',
      total: ZERO,
      boxes: 0,
    };
    group.total = group.total.add(cost);
    group.boxes += batch.quantity;
    suppliers.set(key, group);
  }

  const bySupplier = [...suppliers]
    .map(([supplierId, group]) => ({
      supplierId,
      supplierName: group.name,
      total: group.total.toNumber(),
      boxes: group.boxes,
    }))
    .toSorted((a, b) => b.total - a.total);

  return {
    deliveries,
    bySupplier,
    total: total.toNumber(),
    coverage: { pricedBoxes, unpricedBoxes },
  };
}

export type TreatmentCost = {
  /** Null for a treatment typed by hand rather than picked from the catalogue. */
  serviceId: string | null;
  name: string;
  visits: number;
  total: number;
  /** The number the page is actually for: what one of these costs in materials. */
  perVisit: number;
};

export type TreatmentCosts = {
  lines: TreatmentCost[];
  /**
   * Visits that consumed materials but recorded more than one treatment.
   *
   * Left out rather than split. Two treatments in one appointment share a
   * consumption that nothing in the record divides, and halving it would invent
   * a number: the composite went into the filling, not half into the filling and
   * half into the scale-and-polish. Stated so the reader knows how much of the
   * period this is drawn from.
   */
  skippedVisits: number;
  /**
   * How much of the total came from the price on the actual lot, rather than
   * from the material's last known price. 1 means every box was traced to the
   * delivery that bought it.
   */
  exactShare: number;
};

/**
 * What materials a treatment spends, per visit.
 *
 * The one figure in the app that can tell an owner a treatment is priced below
 * what it costs to perform, and every input has been in the database for a
 * while: `StockMovement.visitRecordId` says which visit consumed what,
 * `StockMovement.batchId` says which lot it came out of, and the lot knows what
 * it cost. Nothing had ever put the three together.
 *
 * Only visits recording exactly one treatment are counted — see `skippedVisits`.
 *
 * A movement whose lot is unknown, or whose lot was never priced, falls back to
 * the material's last known price. That is a real approximation and is *not*
 * silently folded in: `exactShare` says how much of the answer rests on it, so a
 * figure mostly built from fallbacks can be read as the estimate it is.
 */
export async function getTreatmentMaterialCosts({
  from,
  to,
}: {
  from: Date;
  to: Date;
}): Promise<TreatmentCosts> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      delta: { lt: 0 },
      visitRecordId: { not: null },
    },
    select: {
      delta: true,
      visitRecordId: true,
      batch: { select: { unitPrice: true } },
      item: { select: { unitPrice: true } },
    },
  });

  if (movements.length === 0) {
    return { lines: [], skippedVisits: 0, exactShare: 1 };
  }

  // Which treatment each visit was, where it was only one of them. Asked in one
  // query for the whole window rather than per movement.
  const visitIds = [...new Set(movements.map((movement) => movement.visitRecordId as string))];
  const visits = await prisma.visitRecord.findMany({
    where: { id: { in: visitIds } },
    select: { id: true, services: { select: { serviceId: true, name: true } } },
  });

  const single = new Map(
    visits
      .filter((visit) => visit.services.length === 1)
      .map((visit) => [visit.id, visit.services[0]] as const),
  );

  const groups = new Map<
    string,
    { serviceId: string | null; name: string; total: Prisma.Decimal; visits: Set<string> }
  >();
  let exact = ZERO;
  let approximate = ZERO;

  for (const movement of movements) {
    const visitId = movement.visitRecordId as string;
    const service = single.get(visitId);
    if (!service) continue;

    const fromLot = movement.batch?.unitPrice ?? null;
    const price = fromLot ?? movement.item.unitPrice;
    if (price === null) continue;

    const cost = price.mul(-movement.delta);
    if (fromLot === null) approximate = approximate.add(cost);
    else exact = exact.add(cost);

    // Grouped by catalogue id where there is one, by name where there is not —
    // the same rule the treatments chart on this page already follows, so a
    // hand-typed treatment is shown as itself instead of being dropped.
    const key = service.serviceId ?? `name:${service.name}`;
    const group = groups.get(key) ?? {
      serviceId: service.serviceId,
      name: service.name,
      total: ZERO,
      visits: new Set<string>(),
    };
    group.total = group.total.add(cost);
    group.visits.add(visitId);
    groups.set(key, group);
  }

  const lines = [...groups.values()]
    .map((group) => {
      const total = group.total.toNumber();
      return {
        serviceId: group.serviceId,
        name: group.name,
        visits: group.visits.size,
        total,
        perVisit: group.visits.size === 0 ? 0 : total / group.visits.size,
      };
    })
    .toSorted((a, b) => b.perVisit - a.perVisit);

  const counted = exact.add(approximate);

  return {
    lines,
    skippedVisits: visits.filter((visit) => visit.services.length !== 1).length,
    exactShare: counted.isZero() ? 1 : exact.div(counted).toNumber(),
  };
}

export type PriceMove = {
  itemId: string;
  name: string;
  previous: number;
  latest: number;
  /** Positive is dearer. Rounded nowhere — the display decides. */
  changePercent: number;
  /** When the dearer delivery landed, so a move can be placed in the month. */
  latestAt: Date;
};

/**
 * Materials whose last delivery cost something other than the one before it.
 *
 * The quiet way a supply bill grows: no single delivery looks wrong, and the
 * only place the two prices ever sat together was in the head of whoever
 * received both. `StockBatch.unitPrice` was written precisely so this comparison
 * would be possible — "the number an invoice can be checked against months
 * later" — and nothing had ever made it.
 *
 * Ordered by the size of the move rather than by date, because a 30% rise on
 * something bought monthly matters more than last week's 2%.
 */
export async function getPriceMoves({
  minPercent = 5,
  limit = 12,
}: { minPercent?: number; limit?: number } = {}): Promise<PriceMove[]> {
  const batches = await prisma.stockBatch.findMany({
    where: { unitPrice: { not: null } },
    orderBy: [{ itemId: 'asc' }, { purchasedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      itemId: true,
      unitPrice: true,
      purchasedAt: true,
      createdAt: true,
      item: { select: { name: true, variantName: true, archivedAt: true } },
    },
  });

  const seen = new Map<string, typeof batches>();
  for (const batch of batches) {
    // Archived materials are off every list in the app; a price move on
    // something the practice has stopped buying is not news.
    if (batch.item.archivedAt) continue;
    seen.set(batch.itemId, [...(seen.get(batch.itemId) ?? []), batch]);
  }

  const moves: PriceMove[] = [];

  for (const [itemId, lots] of seen) {
    if (lots.length < 2) continue;

    const [newest, previous] = lots;
    if (newest.unitPrice === null || previous.unitPrice === null) continue;
    if (previous.unitPrice.isZero()) continue;

    const latest = newest.unitPrice.toNumber();
    const before = previous.unitPrice.toNumber();
    const changePercent = ((latest - before) / before) * 100;
    if (Math.abs(changePercent) < minPercent) continue;

    moves.push({
      itemId,
      name: newest.item.variantName
        ? `${newest.item.name} · ${newest.item.variantName}`
        : newest.item.name,
      previous: before,
      latest,
      changePercent,
      latestAt: newest.purchasedAt ?? newest.createdAt,
    });
  }

  return moves
    .toSorted((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, limit);
}
