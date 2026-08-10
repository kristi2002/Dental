/**
 * Appointment days are stored as UTC midnight so a calendar day is a single,
 * unambiguous value. Everything is formatted with `timeZone: 'UTC'` (see
 * `src/i18n/request.ts`), which keeps server and client rendering identical.
 */

/** The clinic's current day, normalised to UTC midnight. */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Strip the time part of any date, keeping the same calendar day. */
export function toDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** `YYYY-MM-DD` — the format used in URLs and `<input type="date">`. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse `YYYY-MM-DD` into a UTC-midnight date, falling back to today. */
export function fromDateKey(value: string | undefined | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? today() : parsed;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
}

/** Monday-first week start, matching Albanian and Italian calendar convention. */
export function startOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday
  return addDays(toDay(date), day === 0 ? -6 : 1 - day);
}

export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** `YYYY-MM` — the bucket key used by the statistics page. */
export function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** The last `count` months, oldest first, as UTC month starts. */
export function lastMonths(count: number, from: Date = today()): Date[] {
  const base = startOfMonth(from);
  return Array.from({ length: count }, (_, i) => addMonths(base, i - (count - 1)));
}

/** Whole years between `dateOfBirth` and today. */
export function age(dateOfBirth: Date): number {
  const now = today();
  let years = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

/** `"09:30"` → minutes since midnight. Invalid input sorts to the start of the day. */
export function timeToMinutes(startTime: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Clinic opening hours used to lay out the day and week grids. */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;
