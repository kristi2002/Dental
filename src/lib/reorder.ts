import { addDays, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { usableQuantity } from '@/lib/expiry';
import { ACTIVE_STOCK } from '@/lib/queries';

/**
 * What to order, worked out from what was actually used.
 *
 * The clinic already logs every consumption as a StockMovement, so the burn rate
 * is a measurement rather than a guess. The output is a shopping list, not an
 * order: nothing is purchased automatically and nothing is written back.
 */

/** Long enough to smooth a quiet fortnight, short enough to track real change. */
const WINDOW_DAYS = 90;

/** Order enough to cover this far ahead, on top of the minimum level. */
const COVER_DAYS = 60;

/** Below this many days of stock left, the item is called urgent. */
const URGENT_DAYS = 14;

export type ReorderLine = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minLimit: number;
  /** Pieces per unit. 1 for anything counted singly. */
  packSize: number;
  /** Units consumed per 30 days over the window. */
  monthlyUse: number;
  /** `null` when nothing is being used — stock that never moves never runs out. */
  daysLeft: number | null;
  /** How many units to buy: the owner's stated quantity, else the projection. */
  suggested: number;
  /** True when the quantity was stated rather than projected. */
  stated: boolean;
  urgent: boolean;
  /** ISO date the order went out, or null. A line already on order is shown as
   *  answered rather than asked again every morning. */
  orderedAt: string | null;
  expectedAt: string | null;
  supplierName: string;
};

export async function getReorderSuggestions(): Promise<ReorderLine[]> {
  const since = addDays(today(), -WINDOW_DAYS);

  const [items, used] = await Promise.all([
    prisma.stockItem.findMany({
      where: ACTIVE_STOCK,
      orderBy: { name: 'asc' },
      include: {
        supplier: { select: { name: true } },
        batches: { select: { expiryDate: true, quantity: true } },
      },
    }),
    prisma.stockMovement.groupBy({
      by: ['itemId'],
      // Only consumption counts. Restocking is not demand.
      where: { createdAt: { gte: since }, delta: { lt: 0 } },
      _sum: { delta: true },
    }),
  ]);

  const consumption = new Map(
    used.map((row) => [row.itemId, Math.abs(row._sum.delta ?? 0)]),
  );

  const lines: ReorderLine[] = [];
  for (const item of items) {
    // What is actually usable drives every decision below. An expired lot is
    // not stock — ordering against a count that includes it is how a cupboard
    // ends up full and unusable on the same morning.
    const onHand = usableQuantity(item.quantity, item.batches);
    const overWindow = consumption.get(item.id) ?? 0;
    const monthlyUse = (overWindow / WINDOW_DAYS) * 30;

    const dailyUse = overWindow / WINDOW_DAYS;
    const daysLeft = dailyUse > 0 ? Math.floor(onHand / dailyUse) : null;

    // Cover the next stretch and still land on the minimum level, then round up
    // to something a person would actually write on an order form.
    const target = Math.ceil(dailyUse * COVER_DAYS) + item.minLimit;
    const projected = Math.max(0, target - onHand);

    const urgent =
      onHand <= item.minLimit || (daysLeft !== null && daysLeft <= URGENT_DAYS);

    // Nothing to say about an item that is neither low nor running down.
    //
    // A stated order quantity has no projection behind it — bulk stock is
    // counted on the shelf every few months, so its consumption is lumpy and
    // "days left" is noise. The minimum level is the entire signal, and the
    // line stays quiet until the shelf actually reaches it.
    const worthSaying = item.orderQty !== null ? urgent : urgent || projected > 0;
    if (!worthSaying) continue;

    const onOrder = item.orderedAt !== null;

    lines.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: onHand,
      minLimit: item.minLimit,
      packSize: item.packSize,
      monthlyUse: Math.round(monthlyUse * 10) / 10,
      daysLeft,
      // The owner's own figure wins. Falling back to `minLimit` when there is
      // nothing to project from is a guess, but a guess on the order form is
      // better than a zero — it is the number `orderQty` exists to replace.
      suggested: item.orderQty ?? (urgent && projected === 0 ? item.minLimit : projected),
      stated: item.orderQty !== null,
      // Something already on its way is not urgent any more — the decision has
      // been taken, and leaving it at the top of the list is what teaches people
      // to skim past the top of the list.
      urgent: urgent && !onOrder,
      orderedAt: item.orderedAt ? item.orderedAt.toISOString() : null,
      expectedAt: item.expectedAt ? item.expectedAt.toISOString() : null,
      supplierName: item.supplier?.name ?? '',
    });
  }

  // Most urgent first: soonest to run out, then biggest order. Anything already
  // ordered sinks below everything still needing a decision.
  return lines.sort((a, b) => {
    const aOrdered = a.orderedAt !== null;
    const bOrdered = b.orderedAt !== null;
    if (aOrdered !== bOrdered) return aOrdered ? 1 : -1;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const aDays = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return aDays === bDays ? b.suggested - a.suggested : aDays - bDays;
  });
}

/**
 * How much to ask the supplier for.
 *
 * The shelf is counted in boxes but the supplier sells pieces, so a box-counted
 * line is printed as both — pieces first, because that is the number said out
 * loud when the order is placed. "500 (5 boxes)", not "5 box".
 */
export function orderAmount(line: Pick<ReorderLine, 'suggested' | 'unit' | 'packSize'>): string {
  if (line.packSize > 1) {
    return `${line.suggested * line.packSize} (${line.suggested} ${line.unit})`;
  }
  return `${line.suggested} ${line.unit}`;
}

/** The order list as plain text, for pasting into a WhatsApp message to a supplier. */
export function reorderAsText(lines: ReorderLine[], heading: string): string {
  // What is already coming does not belong on an order form.
  const body = lines
    .filter((line) => line.suggested > 0 && line.orderedAt === null)
    .map((line) => `• ${line.name}: ${orderAmount(line)}`)
    .join('\n');

  return `${heading}\n${body}`;
}
