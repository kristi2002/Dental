/**
 * Appointment days are stored as UTC midnight so a calendar day is a single,
 * unambiguous value. Everything is formatted with `timeZone: 'UTC'` (see
 * `src/i18n/request.ts`), which keeps server and client rendering identical.
 */

/**
 * The clinic's wall clock. Every "what day is it" and "what time is it" answer
 * in the app comes from here rather than from the server's own clock, because
 * the two are only the same on a machine that happens to sit in the practice.
 * A container defaulting to UTC would otherwise shift the working day by an
 * hour or two — silently, and only in summer.
 */
export const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE || 'Europe/Tirane';

const clinicClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function clinicWallClock(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts: Record<string, string> = {};
  for (const part of clinicClock.formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some runtimes render midnight as "24" under hour12: false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** The clinic's current day, normalised to UTC midnight. */
export function today(now: Date = new Date()): Date {
  const wall = clinicWallClock(now);
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
}

/** Minutes since midnight on the clinic's own clock — "how far into today". */
export function clinicMinutesNow(now: Date = new Date()): number {
  const wall = clinicWallClock(now);
  return wall.hour * 60 + wall.minute;
}

/** Strip the time part of any date, keeping the same calendar day. */
export function toDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** `YYYY-MM-DD` — the format used in URLs and `<input type="date">`. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `YYYY-MM-DD`, naming a day that actually exists.
 *
 * The shape test on its own is not enough, and the way it falls short is quiet.
 * `new Date('9999-99-99T…')` is an Invalid Date, which anything checking for
 * `NaN` catches — but `new Date('2026-02-30T…')` is not: JavaScript rolls it
 * forward to the 2nd of March and hands back a perfectly good date. So does the
 * 29th of February in a year that has no 29th. A form posting either used to
 * store a booking on a day nobody chose.
 *
 * Hence the round trip: a key that survives being parsed and reformatted is a
 * real day, and one that comes back different was rolled.
 */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}

/**
 * `H:MM` or `HH:MM` on a 24-hour clock.
 *
 * The shape alone accepts `99:99`, which `timeToMinutes` turns into 6039 —
 * minutes past the end of the day, so a booking carrying it sorts after
 * everything, renders as written, and sits outside every opening-hours window
 * the conflict check walks. `<input type="time">` cannot produce it; a posted
 * form can, and three write paths took the shape as the whole of the question.
 */
export function isTimeOfDay(value: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

/**
 * `YYYY-MM-DD` → UTC midnight, or `null` for anything that is not a real day.
 *
 * The honest half of the pair below. Several callers wrote this inline as
 * `raw && /shape/.test(raw) ? new Date(...) : null`, which returns `null` for a
 * blank field and an *Invalid Date* for a malformed one — two failures, one of
 * which then travels on into a query or a write.
 */
export function parseDateKey(value: string | undefined | null): Date | null {
  if (!value || !isDateKey(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

/** Parse `YYYY-MM-DD` into a UTC-midnight date, falling back to today. */
export function fromDateKey(value: string | undefined | null): Date {
  return parseDateKey(value) ?? today();
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

/**
 * The same day of the month, `amount` months away, clamped to a day that exists.
 *
 * `setUTCMonth` alone overflows: 31 January plus one month is 31 February,
 * which JavaScript silently rolls forward to 3 March. That skipped February
 * entirely when paging the month calendar from a date on the 29th–31st, and
 * pushed a recall due date past the month it belonged to.
 */
export function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  const dayOfMonth = next.getUTCDate();

  // Move to the first before changing month, so the intermediate value cannot
  // overflow on its own.
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + amount);

  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(dayOfMonth, lastDay));

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

/**
 * The 42 cells a month calendar draws: whole weeks, Monday-first, padded with
 * the tail of the previous month and the head of the next.
 *
 * Always six rows, never five — a grid that changes height as the months are
 * paged through makes everything under it jump, and the sidebar it sits in is
 * next to a calendar people are reading.
 */
export function monthGrid(date: Date): Date[] {
  const start = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
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

/**
 * Whole years between `dateOfBirth` and today.
 *
 * `on` is injectable for the same reason `today()` and `clinicMinutesNow()`
 * take one: half the clinical judgement in this app hangs off an age, and a
 * function that can only be asked about the current instant cannot be tested.
 */
export function age(dateOfBirth: Date, on: Date = today()): number {
  const now = toDay(on);
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

/**
 * A date formatter whose fields are padded to the width they were asked for.
 *
 * Asking ICU for two digits is only a request. Albanian's own pattern for a day
 * and a month is `d.M`, and it hands that back as written — so the fourth of
 * August arrives as `4.8` and the fourteenth as `14.8`, which in a column of a
 * register is a set of dates that do not line up and read like version numbers.
 *
 * Only the width is taken over. The order of the parts and the mark between them
 * stay the locale's business, which is why this counts parts rather than writing
 * a format of its own.
 *
 * UTC throughout, to match `format.dateTime` and because every day this app
 * stores is stored at UTC midnight.
 */
export function paddedDateFormat(
  locale: string,
  style: Intl.DateTimeFormatOptions,
): (value: Date) => string {
  const format = new Intl.DateTimeFormat(locale, { ...style, timeZone: 'UTC' });
  return (value) =>
    format
      .formatToParts(value)
      .map((part) => (part.type === 'literal' ? part.value : part.value.padStart(2, '0')))
      .join('');
}
