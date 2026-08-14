import type { Prisma } from '@/generated/prisma/client';
import { allocateOldestFirst } from '@/lib/batch-allocation';
import { prisma } from '@/lib/prisma';

export type ConsumedLine = { itemId: string; name: string; quantity: number; unit: string };

/**
 * Write the ledger side of a consumption that has already been taken off the
 * counter: which lots it came out of, and one movement per lot.
 *
 * Shared by the visit path and the manual take-out box, because a lot has to be
 * drawn down the same way whichever one did it. When they differed, using a
 * material by hand left every lot untouched, so the oldest-first allocation and
 * the recall trace only worked for materials attached to a service.
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
  }: {
    itemId: string;
    quantity: number;
    reason: string;
    staffUserId: string;
    visitRecordId?: string | null;
  },
): Promise<void> {
  if (quantity <= 0) return;

  const batches = await tx.stockBatch.findMany({
    where: { itemId },
    select: { id: true, expiryDate: true, quantity: true, usedQuantity: true },
  });
  const allocations = allocateOldestFirst(batches, quantity);

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
 * Turn "this visit included a filling and a cleaning" into the stock movements
 * that actually happened.
 *
 * Two services that share a material are summed into a single movement, so the
 * log reads as one line per material per visit rather than a scatter of −1s.
 * Quantity is floored at zero: a cupboard cannot hold −3 gloves, and refusing to
 * record the treatment because the count drifted would be the wrong trade.
 *
 * The floor is enforced **inside the write**, not by a figure read beforehand.
 * Clamping against a stale `onHand` lets two visits recorded at the same moment
 * both pass the check for the last two syringes and both decrement, landing at
 * −2 — exactly the state this function's own comment says is impossible.
 */
export async function consumeMaterialsForServices(
  serviceIds: string[],
  staffUserId: string,
  /** The visit that caused it, so the ledger can explain itself later. */
  visitRecordId?: string | null,
): Promise<ConsumedLine[]> {
  if (serviceIds.length === 0) return [];

  const materials = await prisma.serviceMaterial.findMany({
    where: { serviceId: { in: serviceIds } },
    select: {
      quantity: true,
      item: { select: { id: true, name: true, unit: true } },
    },
  });
  if (materials.length === 0) return [];

  const totals = new Map<string, ConsumedLine>();
  for (const material of materials) {
    const existing = totals.get(material.item.id);
    if (existing) {
      existing.quantity += material.quantity;
    } else {
      totals.set(material.item.id, {
        itemId: material.item.id,
        name: material.item.name,
        quantity: material.quantity,
        unit: material.item.unit,
      });
    }
  }

  const consumed: ConsumedLine[] = [];

  await prisma.$transaction(async (tx) => {
    for (const line of totals.values()) {
      // Take the whole amount when the shelf holds it. One statement, so no
      // other transaction can slip between the check and the decrement.
      let applied = line.quantity;
      let taken = await tx.stockItem.updateMany({
        where: { id: line.itemId, quantity: { gte: line.quantity } },
        data: { quantity: { decrement: line.quantity } },
      });

      if (taken.count === 0) {
        // Not enough on hand: take what is there instead of refusing to record
        // the treatment. Read inside the transaction, and still write it as a
        // guarded decrement so a concurrent visit cannot push it under zero.
        const current = await tx.stockItem.findUnique({
          where: { id: line.itemId },
          select: { quantity: true },
        });
        applied = Math.min(line.quantity, current?.quantity ?? 0);
        if (applied <= 0) continue;

        taken = await tx.stockItem.updateMany({
          where: { id: line.itemId, quantity: { gte: applied } },
          data: { quantity: { decrement: applied } },
        });
        if (taken.count === 0) continue;
      }

      // Which lots it came out of, oldest expiry first. A consumption spanning
      // two lots writes one movement per lot, so a recall notice naming a lot
      // number can be traced to the exact visits it touched.
      //
      // `visitRecordId` is what makes the ledger explain itself: `reason` alone
      // is prose, and with the id "why did we burn 40 syringes in March?" is a
      // query rather than a guess.
      await recordConsumption(tx, {
        itemId: line.itemId,
        quantity: applied,
        reason: 'used in visit',
        staffUserId,
        visitRecordId: visitRecordId ?? null,
      });

      consumed.push({ ...line, quantity: applied });
    }
  });

  return consumed;
}
