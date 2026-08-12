import { addDays, toDay } from '@/lib/dates';

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

export type BatchLike = {
  expiryDate: Date | null;
  quantity: number;
};

/**
 * A lot with no expiry date is `OK`, not "unknown" — plenty of materials never
 * carry one, and treating a blank field as a warning would make the whole
 * signal noise.
 */
export function expiryLevel(expiryDate: Date | null, now: Date = new Date()): ExpiryLevel {
  if (!expiryDate) return 'OK';

  const day = toDay(expiryDate);
  const today = toDay(now);
  if (day < today) return 'EXPIRED';
  return day <= addDays(today, EXPIRY_SOON_DAYS) ? 'SOON' : 'OK';
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
  now: Date = new Date(),
): ExpirySummary {
  let expiredUnits = 0;
  let soonUnits = 0;
  let nextExpiry: Date | null = null;

  for (const batch of batches) {
    const level = expiryLevel(batch.expiryDate, now);
    if (level === 'EXPIRED') expiredUnits += batch.quantity;
    if (level === 'SOON') soonUnits += batch.quantity;

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
 * Returns the counter untouched when nothing has expired, which is the common
 * case and also the honest answer for an item that carries no lots at all.
 */
export function usableQuantity(
  quantity: number,
  batches: readonly BatchLike[],
  now: Date = new Date(),
): number {
  const expired = batches.reduce(
    (total, batch) => (expiryLevel(batch.expiryDate, now) === 'EXPIRED' ? total + batch.quantity : total),
    0,
  );
  return Math.max(0, quantity - expired);
}

/** Oldest date first — what to reach for, and what to use up before it turns. */
export function byExpiry<T extends BatchLike>(batches: readonly T[]): T[] {
  return [...batches].sort((a, b) => {
    if (!a.expiryDate) return b.expiryDate ? 1 : 0;
    if (!b.expiryDate) return -1;
    return a.expiryDate.getTime() - b.expiryDate.getTime();
  });
}
