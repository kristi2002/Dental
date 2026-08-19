import { addDays, toDay, today } from '@/lib/dates';

/**
 * Expiry, for materials that have one.
 *
 * `StockItem.quantity` says how much is on the shelf and nothing about whether
 * it can still be used. An expired box of anaesthetic counts exactly the same
 * as a fresh one in the low-stock check, which is the quiet failure this
 * replaces: the cupboard looks full right up to the moment somebody reaches for
 * something they cannot use.
 *
 * Kept free of any database import so the classification is testable on its own
 * and safe for a client component to reach for.
 */

/** Far enough ahead to order a replacement without rushing. */
export const EXPIRY_SOON_DAYS = 90;

export type ExpiryLevel = 'EXPIRED' | 'SOON' | 'OK';

/** All `byExpiry` asks of a lot: a date to sort it by. */
export type DatedBatch = {
  expiryDate: Date | null;
};

export type BatchLike = DatedBatch & {
  /** What arrived. `StockBatch.quantity` is documented never to change. */
  quantity: number;
  /**
   * What has since been used.
   *
   * Required rather than optional, and deliberately so. Everything below was
   * written before lots were drawn down at all, so it counted `quantity` — and a
   * lot that was bought, used up, and only *then* passed its date went on
   * subtracting its whole delivered amount from the shelf for the rest of time.
   * A fast-moving material with a couple of years of lots behind it read as
   * permanently empty, permanently urgent, and permanently expired.
   *
   * Mandatory is what stops the next query selecting its way back into that: the
   * two that fed this file did not ask for the column at all, and nothing said so.
   */
  usedQuantity: number;
};

/**
 * A lot with no expiry date is `OK`, not "unknown" — plenty of materials never
 * carry one, and treating a blank field as a warning would make the whole
 * signal noise.
 *
 * `now` is a *day* rather than an instant, and defaults to the clinic's calendar
 * day. It used to default to `new Date()`, off which `toDay` took the server's
 * UTC day — so whether a box may go near a patient was answered, for an hour or
 * two either side of midnight, by a clock in the wrong place. In a zone ahead of
 * UTC that failed in the direction that matters: a lot which expired yesterday
 * still read as usable. Passing an instant is still fine, because `toDay`
 * normalises whatever it is given.
 */
export function expiryLevel(expiryDate: Date | null, now: Date = today()): ExpiryLevel {
  if (!expiryDate) return 'OK';

  const day = toDay(expiryDate);
  // Not named `today`: that is the imported function this file now depends on,
  // and shadowing it here would leave the default above resolving through a
  // parameter-scope technicality rather than because it plainly reads right.
  const currentDay = toDay(now);
  if (day < currentDay) return 'EXPIRED';
  return day <= addDays(currentDay, EXPIRY_SOON_DAYS) ? 'SOON' : 'OK';
}

/**
 * What is still in the lot — the only quantity expiry has an opinion about.
 *
 * A lot drawn down to nothing is history. Its units left the shelf when they
 * were used, and subtracting them again because the date on the empty box has
 * since passed takes the same boxes off twice.
 */
export function remainingOf(batch: BatchLike): number {
  return Math.max(0, batch.quantity - batch.usedQuantity);
}

export type ExpirySummary = {
  /** Units already past their date. */
  expiredUnits: number;
  /** Units going off inside the window. */
  soonUnits: number;
  /** The nearest date still ahead, for "expires 12 March". */
  nextExpiry: Date | null;
  level: ExpiryLevel;
};

/** The worst news across an item's lots, which is what a shelf label would say. */
export function summariseBatches(
  batches: readonly BatchLike[],
  now: Date = today(),
): ExpirySummary {
  let expiredUnits = 0;
  let soonUnits = 0;
  let nextExpiry: Date | null = null;

  for (const batch of batches) {
    // An emptied lot is news of no kind: not a quantity to warn about, and not a
    // deadline to count down to. The lot-by-lot screen has always skipped these
    // for the same reason — telling somebody to throw away a box that is not
    // there is worse than saying nothing.
    const remaining = remainingOf(batch);
    if (remaining === 0) continue;

    const level = expiryLevel(batch.expiryDate, now);
    if (level === 'EXPIRED') expiredUnits += remaining;
    if (level === 'SOON') soonUnits += remaining;

    // Soonest date that has not already passed — an expired lot is a fact, not
    // a deadline, and putting it here would bury the one still worth acting on.
    if (batch.expiryDate && level !== 'EXPIRED') {
      if (!nextExpiry || batch.expiryDate < nextExpiry) nextExpiry = batch.expiryDate;
    }
  }

  return {
    expiredUnits,
    soonUnits,
    nextExpiry,
    level: expiredUnits > 0 ? 'EXPIRED' : soonUnits > 0 ? 'SOON' : 'OK',
  };
}

/**
 * How much of an item is actually usable.
 *
 * An expired box sits on the shelf and counts toward `StockItem.quantity` like
 * any other, so the low-stock badge, the reorder projection and the dashboard
 * all believed in stock that must not go near a patient. This is the number
 * those three should be reading.
 *
 * Only what is still *in* an expired lot is deducted — see `remainingOf`.
 *
 * Returns the counter untouched when nothing has expired, which is the common
 * case and also the honest answer for an item that carries no lots at all.
 */
export function usableQuantity(
  quantity: number,
  batches: readonly BatchLike[],
  now: Date = today(),
): number {
  const expired = batches.reduce(
    (total, batch) =>
      expiryLevel(batch.expiryDate, now) === 'EXPIRED' ? total + remainingOf(batch) : total,
    0,
  );
  return Math.max(0, quantity - expired);
}

/** Oldest date first — what to reach for, and what to use up before it turns. */
export function byExpiry<T extends DatedBatch>(batches: readonly T[]): T[] {
  return [...batches].sort((a, b) => {
    if (!a.expiryDate) return b.expiryDate ? 1 : 0;
    if (!b.expiryDate) return -1;
    return a.expiryDate.getTime() - b.expiryDate.getTime();
  });
}
