import { toDay, today } from '@/lib/dates';

/**
 * How long somebody has been on the list, in whole days.
 *
 * The date was always stored and always used — it is half the sort order — but
 * never shown, and an entry nobody resolves stays open for ever. A list where
 * March and this morning look identical is one nobody prunes, because nobody
 * can tell which lines are still real. The number is the whole fix.
 */
export function daysWaiting(createdAt: Date, on: Date = today()): number {
  const diff = toDay(on).getTime() - toDay(createdAt).getTime();
  return diff > 0 ? Math.round(diff / 86_400_000) : 0;
}
