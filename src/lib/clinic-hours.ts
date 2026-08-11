import { minutesToTime, timeToMinutes, toDay } from '@/lib/dates';

/**
 * When the practice is open.
 *
 * Two things decide it, and they answer different questions. `ClinicHours` is
 * the weekly pattern — "we shut at one on Saturdays". `Closure` is an exception
 * to it — "we are shut the second week of August". Both have to be consulted
 * before any screen offers a time, which is why they are combined here once
 * rather than in each caller.
 *
 * Deliberately free of any database import: the settings form is a client
 * component and needs these types and defaults, and dragging `prisma` into the
 * browser bundle to get them would not end well. The reads live in
 * `queries.ts`.
 */

export type DayHours = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  open: boolean;
  openTime: string;
  closeTime: string;
  breakStart: string | null;
  breakEnd: string | null;
};

/** An open stretch, in minutes since midnight on the clinic's own clock. */
export type OpenRange = { start: number; end: number };

export type DaySchedule = {
  /** Nothing is bookable: either the weekday is shut or a closure covers it. */
  closed: boolean;
  /** Set only when a closure is the reason — the weekly pattern needs no excuse. */
  closureReason: string | null;
  /** The stretches actually open. Empty when `closed`. */
  ranges: OpenRange[];
  hours: DayHours;
};

/**
 * What a practice looks like before anyone configures it. Deliberately a real
 * week rather than 08:00–20:00 every day, so the free-slot search stops
 * offering Sunday morning the moment this ships — a clinic that genuinely opens
 * on Sundays will say so, but no clinic wants the default to be wrong seven
 * days out of seven.
 */
export const DEFAULT_WEEK: readonly DayHours[] = [
  { weekday: 0, open: false, openTime: '09:00', closeTime: '13:00', breakStart: null, breakEnd: null },
  { weekday: 1, open: true, openTime: '08:00', closeTime: '20:00', breakStart: null, breakEnd: null },
  { weekday: 2, open: true, openTime: '08:00', closeTime: '20:00', breakStart: null, breakEnd: null },
  { weekday: 3, open: true, openTime: '08:00', closeTime: '20:00', breakStart: null, breakEnd: null },
  { weekday: 4, open: true, openTime: '08:00', closeTime: '20:00', breakStart: null, breakEnd: null },
  { weekday: 5, open: true, openTime: '08:00', closeTime: '20:00', breakStart: null, breakEnd: null },
  { weekday: 6, open: true, openTime: '09:00', closeTime: '14:00', breakStart: null, breakEnd: null },
];

export const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * The open stretches of one weekday. A break splits the day in two; a break
 * that has drifted outside opening hours, or been half-filled, is ignored
 * rather than allowed to produce a negative range.
 */
export function rangesFor(hours: DayHours): OpenRange[] {
  if (!hours.open) return [];

  const open = timeToMinutes(hours.openTime);
  const close = timeToMinutes(hours.closeTime);
  if (close <= open) return [];

  if (!hours.breakStart || !hours.breakEnd) return [{ start: open, end: close }];

  const breakStart = Math.max(open, timeToMinutes(hours.breakStart));
  const breakEnd = Math.min(close, timeToMinutes(hours.breakEnd));
  if (breakEnd <= breakStart) return [{ start: open, end: close }];

  return [
    { start: open, end: breakStart },
    { start: breakEnd, end: close },
  ].filter((range) => range.end > range.start);
}

export type ClosureRange = {
  from: Date;
  to: Date;
  reason: string;
  /** Null closes the practice; set, it is one person's leave. */
  staffUserId?: string | null;
};

/**
 * The schedule for one calendar day. Pure, so the interesting cases — a closure
 * that starts mid-week, a break wider than the day — are testable without a
 * database.
 *
 * `staffUserId` asks the question on one person's behalf: their own leave counts
 * against them, a colleague's does not. Asked for nobody in particular, only
 * practice-wide closures apply — the building is open even if one dentist is
 * away.
 */
export function scheduleFor(
  date: Date,
  week: readonly DayHours[],
  closures: readonly ClosureRange[],
  staffUserId?: string | null,
): DaySchedule {
  const day = toDay(date);
  const hours =
    week.find((entry) => entry.weekday === day.getUTCDay()) ??
    DEFAULT_WEEK[day.getUTCDay()];

  const closure = closures.find(
    (entry) =>
      (!entry.staffUserId || entry.staffUserId === staffUserId) &&
      toDay(entry.from) <= day &&
      day <= toDay(entry.to),
  );
  if (closure) {
    return { closed: true, closureReason: closure.reason, ranges: [], hours };
  }

  const ranges = rangesFor(hours);
  return { closed: ranges.length === 0, closureReason: null, ranges, hours };
}

/**
 * The hours a day grid should draw: the open window rounded outwards, widened
 * to include anything already booked outside it. An emergency seen at seven in
 * the morning has to appear on the grid, not in a footnote.
 */
export function gridHoursFor(
  schedule: DaySchedule,
  bookedMinutes: readonly number[] = [],
): { startHour: number; endHour: number } {
  const starts = schedule.ranges.map((range) => range.start);
  const ends = schedule.ranges.map((range) => range.end);

  const openStart = starts.length > 0 ? Math.min(...starts) : timeToMinutes(schedule.hours.openTime);
  const openEnd = ends.length > 0 ? Math.max(...ends) : timeToMinutes(schedule.hours.closeTime);

  const lowest = Math.min(openStart, ...bookedMinutes);
  const highest = Math.max(openEnd, ...bookedMinutes.map((minute) => minute + 1));

  return {
    startHour: Math.max(0, Math.floor(lowest / 60)),
    endHour: Math.min(24, Math.ceil(highest / 60)),
  };
}

/** `"08:00 – 13:00, 14:00 – 20:00"` — the open window, for a subtitle. */
export function describeRanges(ranges: readonly OpenRange[]): string {
  return ranges
    .map((range) => `${minutesToTime(range.start)} – ${minutesToTime(range.end)}`)
    .join(', ');
}
