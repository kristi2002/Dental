import type { Prisma } from '@/generated/prisma/client';
import { allocateOldestFirst, type Allocation } from '@/lib/batch-allocation';

/**
 * Write the ledger side of a consumption that has already been taken off the
 * counter: which lots it came out of, and one movement per lot.
 *
 * Shared by the manual take-out box and the scanner, because a lot has to be
 * drawn down the same way whichever one did it. When they differed, using a
 * material by hand left every lot untouched, so the oldest-first allocation and
 * the recall trace only worked for one path.
 *
 * The caller has already decremented `StockItem.quantity` — the shelf is the
 * authority, and this is the trace over it.
 */
export async function recordConsumption(
  tx: Prisma.TransactionClient,
  {
    itemId,
    quantity,
    reason,
    staffUserId,
    visitRecordId = null,
    preferBatchId = null,
  }: {
    itemId: string;
    quantity: number;
    reason: string;
    staffUserId: string;
    visitRecordId?: string | null;
    /**
     * The lot the scanner read off the box in somebody's hand.
     *
     * Honoured ahead of the oldest-first rule, and honoured even when that lot
     * has expired. Oldest-first is a *guess* at which lot was used, made because
     * nothing better was available; a scanned lot number is the answer. Quietly
     * attributing a scanned expired box to a different, healthier lot would put
     * a lot number on a patient's record that never went near them — which is
     * the one question these rows exist to answer. The console warns before the
     * commit instead.
     */
    preferBatchId?: string | null;
  },
): Promise<void> {
  if (quantity <= 0) return;

  const batches = await tx.stockBatch.findMany({
    where: { itemId },
    select: { id: true, expiryDate: true, quantity: true, usedQuantity: true },
  });

  const allocations: Allocation[] = [];
  let left = quantity;

  const preferred = preferBatchId ? batches.find((batch) => batch.id === preferBatchId) : undefined;
  if (preferred) {
    const take = Math.min(left, preferred.quantity - preferred.usedQuantity);
    if (take > 0) {
      allocations.push({ batchId: preferred.id, quantity: take });
      left -= take;
    }
  }

  if (left > 0) {
    allocations.push(
      ...allocateOldestFirst(
        batches.filter((batch) => batch.id !== preferred?.id),
        left,
      ),
    );
  }

  for (const allocation of allocations) {
    await tx.stockBatch.update({
      where: { id: allocation.batchId },
      data: { usedQuantity: { increment: allocation.quantity } },
    });
  }

  // An item with no lots — or lots that do not cover the amount — still gets its
  // movement, with no batch attached, rather than losing the consumption.
  const allocated = allocations.reduce((sum, a) => sum + a.quantity, 0);
  const lines = [
    ...allocations.map((a) => ({ delta: -a.quantity, batchId: a.batchId })),
    ...(quantity > allocated ? [{ delta: -(quantity - allocated), batchId: null }] : []),
  ];

  for (const movement of lines) {
    await tx.stockMovement.create({
      data: {
        itemId,
        delta: movement.delta,
        reason,
        staffUserId,
        visitRecordId,
        batchId: movement.batchId,
      },
    });
  }
}

/**
 * Take units off the counter, never below zero. Returns how many actually moved.
 *
 * The floor is enforced **inside the write**, not by a figure read beforehand.
 * Clamping against a stale count lets two people scanning the same cupboard at
 * the same moment both pass the check for the last two syringes and both
 * decrement, landing at -2 — the exact state the guard is there to prevent.
 *
 * Split out from `takeFromShelf` because reversing a delivery needs this exact
 * guarantee and none of the ledger that goes with a consumption: a lot removed
 * because it was typed in wrongly was never used, and writing it up as usage
 * would feed waste into the burn rate.
 */
export async function decrementShelf(
  tx: Prisma.TransactionClient,
  itemId: string,
  quantity: number,
): Promise<number> {
  if (quantity <= 0) return 0;

  // One statement, so no other transaction can slip between the check and the
  // decrement.
  const taken = await tx.stockItem.updateMany({
    where: { id: itemId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (taken.count > 0) return quantity;

  // Not enough on hand. Read inside the transaction, and still write it as a
  // guarded decrement so a concurrent scan cannot push it under zero.
  const current = await tx.stockItem.findUnique({
    where: { id: itemId },
    select: { quantity: true },
  });
  const applied = Math.min(quantity, current?.quantity ?? 0);
  if (applied <= 0) return 0;

  const clamped = await tx.stockItem.updateMany({
    where: { id: itemId, quantity: { gte: applied } },
    data: { quantity: { decrement: applied } },
  });
  return clamped.count > 0 ? applied : 0;
}

/**
 * Take a stated number off the shelf, and write the ledger that explains it.
 *
 * Short stock is taken as far as it goes rather than refused. A material that
 * has physically been used has been used, and refusing to record it because the
 * count had drifted would leave the ledger *further* from the shelf, not closer.
 * The caller is told how many actually moved so the screen can say so.
 */
export async function takeFromShelf(
  tx: Prisma.TransactionClient,
  {
    itemId,
    quantity,
    reason,
    staffUserId,
    visitRecordId = null,
    preferBatchId = null,
  }: {
    itemId: string;
    quantity: number;
    reason: string;
    staffUserId: string;
    visitRecordId?: string | null;
    preferBatchId?: string | null;
  },
): Promise<number> {
  const applied = await decrementShelf(tx, itemId, quantity);
  if (applied <= 0) return 0;

  await recordConsumption(tx, {
    itemId,
    quantity: applied,
    reason,
    staffUserId,
    visitRecordId,
    preferBatchId,
  });

  return applied;
}
