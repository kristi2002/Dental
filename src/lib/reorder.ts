import { addDays, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { usableQuantity } from '@/lib/expiry';
import { ACTIVE_STOCK } from '@/lib/queries';
import { orderLateBy } from '@/lib/stock-alerts';

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
  /** Boxes on the shelf, with anything expired already taken off. */
  quantity: number;
  minLimit: number;
  /** Boxes consumed per 30 days over the window. */
  monthlyUse: number;
  /** `null` when nothing is being used — stock that never moves never runs out. */
  daysLeft: number | null;
  /** How many boxes to buy: the owner's stated quantity, else the projection. */
  suggested: number;
  /** True when the quantity was stated rather than projected. */
  stated: boolean;
  urgent: boolean;
  /** ISO date the order went out, or null. A line already on order is shown as
   *  answered rather than asked again every morning. */
  orderedAt: string | null;
  expectedAt: string | null;
  /**
   * Whole days past the promised delivery, or 0.
   *
   * The one thing an order can do wrong, and for a long time the one thing this
   * list could not say: `orderedAt` sank a line to the bottom and painted it a
   * calm blue for ever, whether the box turned up or not. See `orderLateBy`.
   */
  orderLateDays: number;
  supplierName: string;
  /** Empty for a material nobody has said where to buy. */
  supplierId: string;
  /** Where the order actually goes. Empty when the supplier has no such column. */
  supplierPhone: string;
  supplierEmail: string;
};

export async function getReorderSuggestions(): Promise<ReorderLine[]> {
  const now = today();
  const since = addDays(now, -WINDOW_DAYS);

  const [items, used] = await Promise.all([
    prisma.stockItem.findMany({
      where: ACTIVE_STOCK,
      orderBy: { name: 'asc' },
      include: {
        supplier: { select: { name: true, phone: true, email: true } },
        // `usedQuantity` too — an emptied lot that has since passed its date is
        // not stock going to waste, and must not be deducted twice. See `remainingOf`.
        batches: { select: { expiryDate: true, quantity: true, usedQuantity: true } },
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

    const orderLateDays = orderLateBy(
      { orderedAt: item.orderedAt, expectedAt: item.expectedAt },
      now,
    );
    // An order whose promise has passed has stopped being an answer. It goes
    // back to counting as unanswered everywhere below — the urgency, the sort
    // and the badge — because the shelf is still empty and nobody is coming.
    const onOrder = item.orderedAt !== null && orderLateDays === 0;

    lines.push({
      id: item.id,
      name: item.name,
      quantity: onHand,
      minLimit: item.minLimit,
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
      orderLateDays,
      supplierName: item.supplier?.name ?? '',
      supplierId: item.supplierId ?? '',
      supplierPhone: item.supplier?.phone ?? '',
      supplierEmail: item.supplier?.email ?? '',
    });
  }

  // Most urgent first: soonest to run out, then biggest order. Anything already
  // ordered sinks below everything still needing a decision — unless the
  // promise has passed, in which case it needs a decision again.
  return lines.sort((a, b) => {
    const aOrdered = a.orderedAt !== null && a.orderLateDays === 0;
    const bOrdered = b.orderedAt !== null && b.orderLateDays === 0;
    if (aOrdered !== bOrdered) return aOrdered ? 1 : -1;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const aDays = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return aDays === bDays ? b.suggested - a.suggested : aDays - bDays;
  });
}

/**
 * How much to ask the supplier for — boxes, which is how it is ordered and how
 * it arrives.
 *
 * This used to multiply by a pack size and print "500 (5 boxes)", on the theory
 * that the supplier sells pieces. They do not sell pieces to a dental practice:
 * the order says five boxes, the delivery note says five boxes, and the pack
 * size behind that multiplication was a number nobody could keep true.
 *
 * The word is passed in rather than looked up here, because this text goes out
 * in the practice's own language and a lib has no translator.
 */
export function orderAmount(
  line: Pick<ReorderLine, 'suggested'>,
  boxes: (count: number) => string,
): string {
  return `${line.suggested} ${boxes(line.suggested)}`;
}

/** The order list as plain text, for pasting into a WhatsApp message to a supplier. */
export function reorderAsText(
  lines: ReorderLine[],
  heading: string,
  boxes: (count: number) => string,
): string {
  // What is already coming does not belong on an order form.
  const body = lines
    .filter((line) => line.suggested > 0 && line.orderedAt === null)
    .map((line) => `• ${line.name}: ${orderAmount(line, boxes)}`)
    .join('\n');

  return `${heading}\n${body}`;
}

export type SupplierOrder = {
  /** Empty for the group of materials with no supplier recorded. */
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  supplierEmail: string;
  lines: ReorderLine[];
  /** Ids of the lines that are actually being asked for — what "ordered" marks. */
  pendingIds: string[];
};

/**
 * The shopping list cut the way it is actually placed: one order per supplier.
 *
 * The panel listed twelve materials in urgency order and offered one WhatsApp
 * button carrying all twelve — which is not an order anybody can send, because
 * those twelve come from three different companies. So the real workflow was to
 * read the list, sort it in your head, write three messages by hand, and then
 * press "ordered" twelve times.
 *
 * Urgency still decides the order of the groups — the supplier holding the thing
 * that runs out on Tuesday comes first — and it still decides the order of the
 * lines inside each one, because `getReorderSuggestions` already sorted them and
 * grouping preserves it.
 */
export function bySupplier(lines: ReorderLine[]): SupplierOrder[] {
  const groups = new Map<string, SupplierOrder>();

  for (const line of lines) {
    const key = line.supplierId;
    const group = groups.get(key) ?? {
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      supplierPhone: line.supplierPhone,
      supplierEmail: line.supplierEmail,
      lines: [],
      pendingIds: [],
    };
    group.lines.push(line);
    if (line.suggested > 0 && line.orderedAt === null) group.pendingIds.push(line.id);
    groups.set(key, group);
  }

  // Materials nobody has said where to buy sink to the bottom: the group cannot
  // be sent anywhere, so it is a list of things to file rather than to order.
  return [...groups.values()].sort((a, b) => {
    if (!a.supplierId !== !b.supplierId) return a.supplierId ? -1 : 1;
    return 0;
  });
}
