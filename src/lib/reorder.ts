import { addDays, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';

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
  /** Units consumed per 30 days over the window. */
  monthlyUse: number;
  /** `null` when nothing is being used — stock that never moves never runs out. */
  daysLeft: number | null;
  /** How many units to buy to reach the target cover. */
  suggested: number;
  urgent: boolean;
};

export async function getReorderSuggestions(): Promise<ReorderLine[]> {
  const since = addDays(today(), -WINDOW_DAYS);

  const [items, used] = await Promise.all([
    prisma.stockItem.findMany({ orderBy: { name: 'asc' } }),
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
    const overWindow = consumption.get(item.id) ?? 0;
    const monthlyUse = (overWindow / WINDOW_DAYS) * 30;

    const dailyUse = overWindow / WINDOW_DAYS;
    const daysLeft = dailyUse > 0 ? Math.floor(item.quantity / dailyUse) : null;

    // Cover the next stretch and still land on the minimum level, then round up
    // to something a person would actually write on an order form.
    const target = Math.ceil(dailyUse * COVER_DAYS) + item.minLimit;
    const suggested = Math.max(0, target - item.quantity);

    const urgent =
      item.quantity <= item.minLimit || (daysLeft !== null && daysLeft <= URGENT_DAYS);

    // Nothing to say about an item that is neither low nor running down.
    if (suggested <= 0 && !urgent) continue;

    lines.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      minLimit: item.minLimit,
      monthlyUse: Math.round(monthlyUse * 10) / 10,
      daysLeft,
      suggested: Math.max(suggested, urgent && suggested === 0 ? item.minLimit : suggested),
      urgent,
    });
  }

  // Most urgent first: soonest to run out, then biggest order.
  return lines.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const aDays = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return aDays === bDays ? b.suggested - a.suggested : aDays - bDays;
  });
}

/** The order list as plain text, for pasting into a WhatsApp message to a supplier. */
export function reorderAsText(lines: ReorderLine[], heading: string): string {
  const body = lines
    .filter((line) => line.suggested > 0)
    .map((line) => `• ${line.name}: ${line.suggested} ${line.unit}`)
    .join('\n');

  return `${heading}\n${body}`;
}
