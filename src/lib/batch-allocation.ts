/**
 * Deciding which lot a consumption comes out of.
 *
 * `StockBatch` recorded what arrived and nothing ever drew it down, so the two
 * questions the lots exist to answer — what is going off, and which lot number
 * went into this patient — could only be answered for the first one. Pure, so
 * the interesting cases (a consumption spanning three lots, an item with no lots
 * at all, an expired lot that must be skipped) are testable without a database.
 */

export type AllocatableBatch = {
  id: string;
  expiryDate: Date | null;
  /** What arrived. */
  quantity: number;
  /** What has already gone. */
  usedQuantity: number;
};

export type Allocation = { batchId: string; quantity: number };

/**
 * Take `wanted` units, oldest expiry first.
 *
 * Oldest-first is both the right shelf discipline and the only order that makes
 * the expiry warnings mean anything: consuming the newest lot while an older one
 * turns is how stock expires in a cupboard that is never empty.
 *
 * An expired lot is skipped rather than consumed — it should not have been used,
 * and recording that it was would put a wrong lot number on a patient's record.
 * A lot with no expiry date sorts last, because a lot that *will* turn is more
 * urgent than one that never does.
 *
 * Returns what could be allocated. The caller is responsible for the remainder:
 * an item whose lots do not cover the amount is still consumed against the
 * item's own counter, because the shelf is the authority and lots are a trace.
 */
export function allocateOldestFirst(
  batches: readonly AllocatableBatch[],
  wanted: number,
  now: Date = new Date(),
): Allocation[] {
  if (wanted <= 0) return [];

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const usable = batches
    .filter((batch) => {
      if (batch.quantity - batch.usedQuantity <= 0) return false;
      if (!batch.expiryDate) return true;
      const day = new Date(
        Date.UTC(
          batch.expiryDate.getUTCFullYear(),
          batch.expiryDate.getUTCMonth(),
          batch.expiryDate.getUTCDate(),
        ),
      );
      return day >= today;
    })
    .sort((a, b) => {
      if (!a.expiryDate) return b.expiryDate ? 1 : 0;
      if (!b.expiryDate) return -1;
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });

  const out: Allocation[] = [];
  let left = wanted;

  for (const batch of usable) {
    if (left <= 0) break;
    const take = Math.min(left, batch.quantity - batch.usedQuantity);
    if (take <= 0) continue;
    out.push({ batchId: batch.id, quantity: take });
    left -= take;
  }

  return out;
}
