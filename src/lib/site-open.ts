/**
 * Whether the practice's door is open at a given instant — worked out the same
 * way on the server and in the browser, because it is the same function.
 *
 * This exists to let the storefront be a **cached page with a live sentence in
 * it**. The page used to be `force-dynamic` for one reason: "Open now, until
 * 19:00" is only true if it is computed when somebody asks. That is a real
 * constraint, and paying for it with a database round trip on every visit was
 * the wrong way to meet it — a public front door should survive its own database
 * being down, and a page regenerated every five minutes does while a dynamic one
 * does not.
 *
 * So the page is rendered from cache with the answer that was true when it was
 * rendered, and `OpenStatus` calls this again on mount with the browser's clock.
 * One implementation, called twice: a second copy of "is it open" written in
 * client-side JavaScript is exactly how a page ends up saying two different
 * things about the same minute.
 *
 * **Everything here is pure and free of any server import**, which is what lets
 * a client component call it. That is a constraint to keep: `lib/queries.ts` is
 * where the rows are read, and this file must never learn how to read one.
 *
 * **The clinic's clock, never the visitor's.** `timeZone` is carried in the
 * payload rather than read from `process.env` because `CLINIC_TIME_ZONE` is not
 * a `NEXT_PUBLIC_` variable — in a browser bundle it inlines as `undefined` and
 * silently falls back to Europe/Tirane, so a practice that had overridden it
 * would have a server and a browser quietly disagreeing. And it is the clinic's
 * zone rather than the reader's on purpose: a patient in Milan asking whether
 * the practice is open means open in Vlorë, and answering on their own clock
 * would be an hour wrong for a good share of the people this page is written
 * for.
 */

import { describeRanges, type OpenRange } from '@/lib/clinic-hours';
import { minutesToTime } from '@/lib/dates';

/** One weekday's open stretches, as minutes since midnight. */
export type LiveDay = {
  /** 0 = Sunday … 6 = Saturday, as `ClinicHours` stores it. */
  weekday: number;
  ranges: OpenRange[];
};

export type LiveHours = {
  /** The practice's own IANA zone — see the note above on why it travels. */
  timeZone: string;
  week: LiveDay[];
  /**
   * `YYYY-MM-DD` → the reason the practice is shut that day, for the short
   * window a cached page could still be showing. An entry with an empty string
   * is a closure with no reason recorded; a date that is absent is a day with no
   * closure on it.
   */
  closures: Record<string, string>;
  /**
   * The last date `closures` can answer for. Past this the browser has no way to
   * know about a public holiday, so `openStateAt` returns null and the component
   * keeps whatever the server rendered rather than inventing a cheerful "open
   * now" over the top of a closed practice.
   */
  knownThrough: string;
};

export type OpenState = {
  /** 0 = Sunday … 6 = Saturday — which row of the week table to mark. */
  weekday: number;
  /** `open` while a stretch is being worked, `later` before one, `shut` after. */
  tone: 'open' | 'later' | 'shut';
  /**
   * The end of the stretch being worked now — `"13:00"` — and null otherwise.
   * The *current* stretch rather than the day: a practice that shuts for lunch
   * closes at one, and saying "until seven" would have somebody arrive to a
   * locked door at half past one.
   */
  closesAt: string | null;
  /** The next opening **today**, or null when there is not one. */
  opensAt: string | null;
  /** `"08:00 – 19:00"`, or empty on a day the practice is shut. */
  todayHours: string;
  /** Set only when a closure is the reason; the weekly pattern needs no excuse. */
  closureReason: string | null;
};

/**
 * The wall clock in a given zone, as plain numbers.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`, which is not the same thing:
 * several locales render midnight as "24" under `hour12: false`, and a page that
 * thinks the day is 1440 minutes old at one minute past twelve would report the
 * practice shut all night and all morning.
 *
 * The weekday comes from rebuilding the date at UTC midnight rather than from
 * asking `Intl` for a weekday name — a name would have to be parsed back, and it
 * would be parsed in whatever locale happened to be passed.
 */
function wallClock(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const year = read('year');
  const month = read('month');
  const day = read('day');

  return {
    dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutes: read('hour') * 60 + read('minute'),
  };
}

/**
 * What the practice's front page should say about right now, or **null** when
 * the payload cannot answer for the day the clock has reached.
 *
 * Null is the important return. It happens when a cached page has been sitting
 * long enough that the browser's "today" is past `knownThrough` — rare, but the
 * honest answer is that this function does not know whether a closure covers
 * that day, and the alternative is to guess. The whole storefront already
 * follows that rule: `SiteData.hours` is null rather than a default week,
 * because saying nothing about opening hours costs a visitor a telephone call
 * and saying the wrong thing costs them a journey.
 */
export function openStateAt(live: LiveHours, now: Date): OpenState | null {
  const clock = wallClock(live.timeZone, now);
  if (clock.dateKey > live.knownThrough) return null;

  const closureReason = Object.hasOwn(live.closures, clock.dateKey)
    ? live.closures[clock.dateKey] || null
    : undefined;

  // A closure shuts the day whatever the weekly pattern says, which is the point
  // of having closures at all.
  if (closureReason !== undefined) {
    return {
      weekday: clock.weekday,
      tone: 'shut',
      closesAt: null,
      opensAt: null,
      todayHours: '',
      closureReason,
    };
  }

  const ranges = live.week.find((day) => day.weekday === clock.weekday)?.ranges ?? [];
  const current = ranges.find((range) => clock.minutes >= range.start && clock.minutes < range.end);
  const next = ranges.find((range) => range.start > clock.minutes);

  return {
    weekday: clock.weekday,
    tone: current ? 'open' : next ? 'later' : 'shut',
    closesAt: current ? minutesToTime(current.end) : null,
    opensAt: current ? null : next ? minutesToTime(next.start) : null,
    todayHours: describeRanges(ranges),
    closureReason: null,
  };
}
