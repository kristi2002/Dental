import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Orders, and what is still owed against them.
 *
 * The half of purchasing `StockItem.orderedAt` could not hold. That flag says
 * "on its way" and nothing else, so the first box through the scanner cleared
 * it — and an order of ten answered by a delivery of six left four boxes that no
 * screen in the app was still waiting for. See `PurchaseOrder` in the schema.
 *
 * Reading and allocating live here rather than in the actions file because
 * receiving happens on three different paths — the scanner, the lot form, and
 * the plain restock — and each of them has to draw an order down the same way.
 * When they differ, the outstanding figure becomes a fourth opinion about
 * something that already has three.
 */

/** A line with something still owed on it, oldest order first. */
export type OpenLine = {
  id: string;
  orderId: string;
  quantity: number;
  receivedQuantity: number;
};

/**
 * Which lines a delivery answers, with the writes left to the caller.
 *
 * Split out and kept pure for the reason `planConsumption` is: this is the part
 * that is easy to get subtly wrong and impossible to check inside a
 * transaction. Three rules, and all three have a failure behind them —
 *
 *  - lines already filled are skipped, so a closed line cannot be filled twice;
 *  - no line takes more than it is owed, so twelve boxes against an order of ten
 *    close the line at ten and the two extra go on the shelf without the order
 *    pretending to have asked for them;
 *  - oldest order first, because two open orders for one material are two orders
 *    the supplier owes and the box that arrives answers the one that has been
 *    waiting longest. The caller supplies that order; this does not re-sort.
 *
 * Returns what to add to each line and how much of the delivery it could not
 * place — which is a delivery larger than everything outstanding, not an error.
 */
export function planReceipt(
  lines: readonly OpenLine[],
  quantity: number,
): { allocations: Array<{ lineId: string; orderId: string; quantity: number }>; leftover: number } {
  const allocations: Array<{ lineId: string; orderId: string; quantity: number }> = [];
  let left = Math.max(0, quantity);

  for (const line of lines) {
    if (left <= 0) break;

    const owed = line.quantity - line.receivedQuantity;
    if (owed <= 0) continue;

    const take = Math.min(left, owed);
    allocations.push({ lineId: line.id, orderId: line.orderId, quantity: take });
    left -= take;
  }

  return { allocations, leftover: left };
}

/**
 * Book arriving boxes against whatever is outstanding for that material.
 *
 * Oldest order first, which is the only defensible rule: two open orders for the
 * same material are two orders the supplier owes, and a box that arrives answers
 * the one that has been waiting longest. Nothing on the delivery says which
 * order it belongs to — no supplier prints our order number on their carton —
 * so this is an attribution rather than a fact, and it is the same attribution a
 * person makes looking at the two.
 *
 * Never books more than a line asked for. A supplier sending twelve against an
 * order of ten has closed that line and delivered two extra: the shelf records
 * all twelve, because twelve boxes are physically there, and the order does not
 * pretend to have asked for them.
 *
 * Returns what it could place and whether the material still has anything
 * outstanding — which is what tells the caller whether the item's own "on order"
 * flag may be cleared. Clearing it while four boxes are still owed is the exact
 * bug this table exists to fix.
 */
export async function receiveAgainstOrders(
  tx: Prisma.TransactionClient,
  itemId: string,
  quantity: number,
): Promise<{ applied: number; stillOutstanding: boolean }> {
  if (quantity <= 0) return { applied: 0, stillOutstanding: false };

  const lines = await tx.purchaseOrderLine.findMany({
    where: { itemId, order: { closedAt: null } },
    orderBy: { order: { placedAt: 'asc' } },
    select: { id: true, orderId: true, quantity: true, receivedQuantity: true },
  });

  // Prisma cannot compare two columns of the same row in a `where`, so the
  // "still owed something" filter is applied by `planReceipt`. The set is one
  // material's open lines — a handful of rows, not a scan.
  const { allocations, leftover } = planReceipt(lines, quantity);
  if (allocations.length === 0) return { applied: 0, stillOutstanding: false };

  for (const allocation of allocations) {
    await tx.purchaseOrderLine.update({
      where: { id: allocation.lineId },
      data: { receivedQuantity: { increment: allocation.quantity } },
    });
  }

  await closeSettledOrders(tx, [...new Set(allocations.map((a) => a.orderId))]);

  // Asked rather than worked out. Re-deriving what is left from the numbers this
  // function already has means repeating an allocation that has just been
  // written down, and a subtly different answer here is exactly how the order
  // and the item's own flag start disagreeing. One small query inside the same
  // transaction cannot drift from what was written.
  return { applied: quantity - leftover, stillOutstanding: await hasOutstanding(tx, itemId) };
}

/** True while any open order still owes this material a box. */
export async function hasOutstanding(
  tx: Prisma.TransactionClient,
  itemId: string,
): Promise<boolean> {
  const lines = await tx.purchaseOrderLine.findMany({
    where: { itemId, order: { closedAt: null } },
    select: { quantity: true, receivedQuantity: true },
  });
  return lines.some((line) => line.receivedQuantity < line.quantity);
}

/**
 * Close every order in the list that has nothing left outstanding.
 *
 * Closed by arithmetic rather than by a press: an order whose last box has
 * arrived is finished, and asking somebody to confirm that is asking them to
 * restate what the shelf already proved.
 */
export async function closeSettledOrders(
  tx: Prisma.TransactionClient,
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return;

  const orders = await tx.purchaseOrder.findMany({
    where: { id: { in: orderIds }, closedAt: null },
    select: { id: true, lines: { select: { quantity: true, receivedQuantity: true } } },
  });

  const settled = orders
    .filter((order) => order.lines.every((line) => line.receivedQuantity >= line.quantity))
    .map((order) => order.id);

  if (settled.length > 0) {
    await tx.purchaseOrder.updateMany({
      where: { id: { in: settled } },
      data: { closedAt: new Date() },
    });
  }
}

export type OrderLineView = {
  id: string;
  itemId: string;
  /** The material's name now, falling back to what the order called it. */
  name: string;
  quantity: number;
  receivedQuantity: number;
  outstanding: number;
};

export type OrderView = {
  id: string;
  supplierId: string;
  supplierName: string;
  placedAt: Date;
  expectedAt: Date | null;
  closedAt: Date | null;
  cancelled: boolean;
  notes: string;
  lines: OrderLineView[];
  /** Boxes still owed across the whole order. Zero on a settled one. */
  outstanding: number;
  /** Whole days past the promised date, or 0. Same rule as `orderLateBy`. */
  lateDays: number;
};

/**
 * The orders screen's whole query.
 *
 * Open orders first and oldest first inside that, because an order screen is
 * read to answer "what are we still waiting for" and the answer is always the
 * one that has been waiting longest.
 */
export async function getPurchaseOrders({
  open = true,
  limit = 60,
  now = new Date(),
}: { open?: boolean; limit?: number; now?: Date } = {}): Promise<OrderView[]> {
  const orders = await prisma.purchaseOrder.findMany({
    where: open ? { closedAt: null } : { closedAt: { not: null } },
    orderBy: open ? { placedAt: 'asc' } : { closedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      supplierId: true,
      supplierName: true,
      placedAt: true,
      expectedAt: true,
      closedAt: true,
      cancelled: true,
      notes: true,
      supplier: { select: { name: true } },
      lines: {
        orderBy: { itemName: 'asc' },
        select: {
          id: true,
          itemId: true,
          itemName: true,
          quantity: true,
          receivedQuantity: true,
          item: { select: { name: true, variantName: true } },
        },
      },
    },
  });

  return orders.map((order) => {
    const lines = order.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      // The live name wins, so a material renamed since the order was placed is
      // recognisable on the shelf today. The snapshot is the fallback for a row
      // whose material has since been deleted outright.
      name: line.item
        ? line.item.variantName
          ? `${line.item.name} · ${line.item.variantName}`
          : line.item.name
        : line.itemName,
      quantity: line.quantity,
      receivedQuantity: line.receivedQuantity,
      outstanding: Math.max(0, line.quantity - line.receivedQuantity),
    }));

    const expected = order.expectedAt;
    const lateDays =
      expected && !order.closedAt && expected < now
        ? Math.floor((now.getTime() - expected.getTime()) / 86_400_000)
        : 0;

    return {
      id: order.id,
      supplierId: order.supplierId ?? '',
      supplierName: order.supplier?.name || order.supplierName,
      placedAt: order.placedAt,
      expectedAt: order.expectedAt,
      closedAt: order.closedAt,
      cancelled: order.cancelled,
      notes: order.notes ?? '',
      lines,
      outstanding: lines.reduce((sum, line) => sum + line.outstanding, 0),
      lateDays,
    };
  });
}

/** How many open orders there are, for the badge on the storage page. */
export async function countOpenOrders(): Promise<number> {
  return prisma.purchaseOrder.count({ where: { closedAt: null } });
}
