import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import {
  describeRanges,
  rangesFor,
  scheduleFor,
  WEEKDAY_ORDER,
  type ClosureRange,
  type DayHours,
  type OpenRange,
} from '@/lib/clinic-hours';
import { addDays, CLINIC_TIME_ZONE, fromDateKey, toDateKey, today } from '@/lib/dates';
import { telLink, whatsappChatLink } from '@/lib/reminders';
import { openStateAt, type LiveHours, type OpenState } from '@/lib/site-open';
import {
  clinicDisplayName,
  getClinicProfile,
  getClinicWeek,
  getClosures,
} from '@/lib/queries';

/**
 * Everything the practice's public page says about itself, read from the same
 * rows the practice is run from.
 *
 * The point of this module is that there is **no second copy**. The opening
 * hours a stranger reads on the storefront are the rows the free-slot search
 * offers appointments out of, and the telephone number under them is the one
 * printed on the prescription pad. A marketing page with its own hard-coded
 * hours drifts the first Saturday the practice decides to close early, and the
 * person who finds out is the one standing outside the door.
 *
 * Four fields of `ClinicProfile` and the seven `ClinicHours` rows are all this
 * file ever reads. That is a deliberate ceiling rather than an accident: this is
 * the one module in the app whose output is served to anybody who asks, and the
 * shortest way to keep patient data off a public page is to give the public page
 * no way to reach any.
 *
 * Editorial copy — headlines, treatment blurbs, what the practice says about
 * itself — is **not** here. That lives in `messages/*.json` under `site`, where
 * it can be translated into all three languages by somebody who is not editing a
 * database row.
 */

export type SiteContact = {
  /** Settings first, `NEXT_PUBLIC_CLINIC_NAME` behind it — as everywhere else. */
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /**
   * The same details as links that actually go somewhere. Null wherever the
   * detail behind them is blank, so a caller renders the row or drops it rather
   * than offering a `tel:` to nothing.
   */
  telHref: string | null;
  whatsappHref: string | null;
  mailtoHref: string | null;
};

export type SiteDay = {
  /** 0 = Sunday … 6 = Saturday, as `ClinicHours` stores it. */
  weekday: number;
  open: boolean;
  /** `"08:00 – 19:00"`, or empty on a day the practice is shut. */
  hours: string;
};

export type SiteHours = {
  /** Monday first — `WEEKDAY_ORDER` — because that is how a week is read. */
  week: SiteDay[];
  /**
   * What was true at the moment this page was rendered.
   *
   * "At the moment it was rendered" rather than "now", and the difference is the
   * whole reason `live` exists below: the page is cached, so on a quiet
   * afternoon the HTML a visitor receives can be a few minutes old. Everything
   * here is still worth rendering — it is what a reader with no JavaScript sees,
   * and it is what stops the status rail arriving empty and filling in — but the
   * browser is what makes it current.
   */
  now: OpenState;
  /**
   * Enough for the browser to work the same answer out again on the clinic's
   * clock, without a request. See `lib/site-open.ts`.
   */
  live: LiveHours;
};

/**
 * One day of the booking calendar.
 *
 * Plain JSON and nothing but — no `Date` anywhere. This crosses two boundaries
 * that both flatten one: `unstable_cache` serializes what it stores, and the
 * calendar itself is a client component, so every field here rides the RSC
 * payload into the browser. A date is a `YYYY-MM-DD` key on both sides, which
 * is also what the form posts and what the action parses back.
 */
export type SiteBookingDay = {
  /** `YYYY-MM-DD`, at UTC midnight like every calendar day in this app. */
  date: string;
  /** Whether the practice is open at all — the only thing the grid greys out. */
  open: boolean;
  /** `"08:00 – 13:00, 14:00 – 19:00"`, empty on a day it is shut. */
  hours: string;
  /**
   * Named only when a *closure* is the reason.
   *
   * The weekly pattern needs no excuse — nobody expects a note explaining
   * Sunday — but "Easter Monday" is worth printing, because a visitor looking at
   * a greyed-out Tuesday in April otherwise assumes the site is broken.
   */
  closure: string | null;
  /**
   * The open stretches, in minutes since midnight. What the half-day chips are
   * derived from: a day that shuts at one o'clock offers no afternoon.
   */
  ranges: OpenRange[];
};

export type SiteBookingWindow = {
  /** Today, on the clinic's clock. Nothing before it is offered. */
  from: string;
  /** The last day offered, inclusive. */
  to: string;
  /** Every day from `from` to `to`, in order, open and shut alike. */
  days: SiteBookingDay[];
};

export type SiteData = {
  contact: SiteContact;
  /**
   * Null when the database could not be reached.
   *
   * Not "fall back to the default week" — `DEFAULT_WEEK` is a sensible guess for
   * a practice that has not configured itself, and a **lie** on a public page.
   * Saying nothing about opening hours costs a visitor a telephone call; saying
   * the wrong thing costs them a journey.
   */
  hours: SiteHours | null;
};

/** `"08:00 – 19:00"` for one weekday of the pattern, empty when it is shut. */
function describeDay(day: DayHours): string {
  return day.open ? describeRanges(rangesFor(day)) : '';
}

/**
 * How long a public page may go on repeating what the database last said.
 *
 * The storefront is the one surface here that anybody can request, and until
 * this cache went in every one of those requests ran three queries — one of them
 * `getClinicProfile`, which is an **upsert**. A write transaction per anonymous
 * page view is wrong twice over: it is a database round trip on the critical
 * path of a page that changes about twice a year, and it is a write that a
 * stranger with a loop can issue as fast as the server will answer.
 *
 * Five minutes is chosen against the thing that actually changes — the practice
 * editing its own hours or telephone number in Settings, and then reloading the
 * front page to check. Five minutes is short enough that the check succeeds on
 * the second look and long enough that a busy afternoon is served from memory.
 * `SITE_CACHE_TAG` is what shortens that to nothing when Settings is saved.
 */
const SITE_REVALIDATE_SECONDS = 300;

/**
 * The tag both cached reads carry, so saving Settings can drop them at once
 * rather than leaving the practice waiting out the window above.
 */
export const SITE_CACHE_TAG = 'site-public';

/**
 * The rows behind the public page, cached across requests.
 *
 * Both of these return **plain JSON** — strings, numbers, and the minute offsets
 * `rangesFor` produces — and that is a requirement rather than a coincidence.
 * `unstable_cache` serializes what it stores, so a `Date` handed to it comes back
 * a string and any arithmetic downstream quietly stops working. The closure
 * rows are resolved to date keys *inside* the cached function for exactly that
 * reason; nothing with a `Date` in it crosses this boundary.
 *
 * Errors are deliberately not caught in here. A failed read must propagate so
 * nothing is stored, and so the next request tries again rather than serving a
 * cached failure for five minutes — the callers below are where a database that
 * is down turns into a page that simply says less.
 */
const readContact = unstable_cache(
  async () => {
    const profile = await getClinicProfile();
    return {
      name: clinicDisplayName(profile),
      phone: profile.phone?.trim() || null,
      email: profile.email?.trim() || null,
      address: profile.address?.trim() || null,
    };
  },
  ['site-contact'],
  { revalidate: SITE_REVALIDATE_SECONDS, tags: [SITE_CACHE_TAG] },
);

/**
 * The practice's own details, with every link pre-built.
 *
 * Guarded the same way `generateMetadata` and the web manifest are: a database
 * that is down must produce a page that says so, not a public front door that
 * throws a 500 at everybody who visits. The name survives a failure because
 * `NEXT_PUBLIC_CLINIC_NAME` is baked in at build time and needs no query.
 */
export const getSiteContact = cache(async (): Promise<SiteContact> => {
  const envName = process.env.NEXT_PUBLIC_CLINIC_NAME?.trim() || '';

  let name = envName;
  let phone: string | null = null;
  let email: string | null = null;
  let address: string | null = null;

  try {
    const profile = await readContact();
    name = profile.name || envName;
    phone = profile.phone;
    email = profile.email;
    address = profile.address;
  } catch {
    // The name stands on its own. Everything else stays null, and each block on
    // the page drops its row rather than offering a link to nowhere.
  }

  return {
    name,
    phone,
    email,
    address,
    telHref: phone ? telLink(phone) : null,
    whatsappHref: phone ? whatsappChatLink(phone) : null,
    // A bare `mailto:`, built here rather than through `lib/reminders`. That
    // helper always appends `?subject=&body=`, which is right for the app —
    // every mail it opens is a message somebody composed — and wrong here: this
    // is "write to us", and a visitor should get an empty message, not one with
    // two blank parameters trailing off the address.
    mailtoHref: email ? `mailto:${email}` : null,
  };
});

/**
 * How many days ahead of today the closure window reaches.
 *
 * `OpenStatus` recomputes the open/closed sentence on the visitor's own machine
 * once a minute, and to do that honestly it has to know about a public holiday
 * it might land on. The case this window is sized for is a tab left open: a
 * phone put down on Monday evening and picked up on Tuesday morning is a browser
 * asking about a day the server never rendered. Two days covers that and the
 * short stretch either side of midnight where the cached rows above are a few
 * minutes old.
 *
 * Past the window `openStateAt` returns null and the browser leaves the server's
 * answer alone rather than guessing — which is the same rule `SiteData.hours`
 * follows, and for the same reason: saying nothing costs a telephone call, and
 * saying the wrong thing costs a journey.
 */
const CLOSURE_WINDOW_DAYS = 2;

/**
 * The week and the closure window, read once and held for five minutes.
 *
 * Everything time-dependent is deliberately left outside: this returns the
 * *pattern* and which nearby dates are shut, and the caller works out what that
 * means for the current minute. Caching the answer instead of the input is how a
 * cached page ends up telling somebody the practice is open an hour after it
 * closed.
 */
const readHours = unstable_cache(
  async () => {
    const [week, closures] = await Promise.all([getClinicWeek(), getClosures()]);

    const byWeekday = new Map(week.map((day) => [day.weekday, day]));
    const ordered: SiteDay[] = WEEKDAY_ORDER.map((weekday) => {
      const day = byWeekday.get(weekday);
      const hours = day ? describeDay(day) : '';
      // A day flagged open whose times do not make a range — 20:00 to 08:00,
      // say — is shut as far as a reader is concerned, and `describeDay` is what
      // knows that. Trusting `day.open` alone would print an empty time.
      return { weekday, open: hours !== '', hours };
    });

    // The days the browser could plausibly land on, resolved here where the
    // closure rows are. `scheduleFor` is what distinguishes a practice that is
    // shut because it is Sunday — no excuse needed — from one shut because
    // somebody entered a closure, which is the only case that gets a name on the
    // page.
    const from = today();
    const dates = Array.from(
      { length: CLOSURE_WINDOW_DAYS + 1 },
      (_, offset) => new Date(from.getTime() + offset * 24 * 60 * 60 * 1000),
    );

    const shut: Record<string, string> = {};
    for (const date of dates) {
      const reason = scheduleFor(date, week, closures).closureReason;
      if (reason !== null) shut[toDateKey(date)] = reason;
    }

    const live: LiveHours = {
      timeZone: CLINIC_TIME_ZONE,
      week: week.map((day) => ({ weekday: day.weekday, ranges: rangesFor(day) })),
      closures: shut,
      knownThrough: toDateKey(dates[dates.length - 1]),
    };

    return { ordered, live };
  },
  ['site-hours'],
  { revalidate: SITE_REVALIDATE_SECONDS, tags: [SITE_CACHE_TAG] },
);

/**
 * The week, and whether the door is open right now.
 *
 * The rows come from `readHours` and may be a few minutes old; **the answer does
 * not**. `openStateAt` runs on every request against the clock at that instant,
 * and it is the same function the browser calls a moment later — there is
 * deliberately no second implementation of "is it open" anywhere, because a
 * server saying "open until 19:00" while the browser says "closed" about the
 * same minute is the exact bug this arrangement exists to make impossible.
 */
export const getSiteHours = cache(async (): Promise<SiteHours | null> => {
  try {
    const { ordered, live } = await readHours();

    // Never null at render time: the window starts at today, so today is always
    // inside it. The fallback is there because the type says it can be, not
    // because this call can reach it.
    const now = openStateAt(live, new Date());
    if (!now) return null;

    return { week: ordered, now, live };
  } catch {
    return null;
  }
});

/**
 * How far ahead the booking calendar lets somebody point.
 *
 * Eight weeks. Long enough for the half of this practice's patients who are
 * booking a flight or a ferry before they book a dentist, and short enough that
 * the answer stays honest: this is a *preference*, not a slot, and a form
 * offering a date five months out invites a certainty nobody has.
 *
 * It is also, deliberately, the size of the payload. Every day in the window
 * rides the RSC payload into the browser so the grid can page a month without a
 * round trip; fifty-six small objects is a few kilobytes, and a year of them
 * would be a page weight nobody agreed to.
 */
export const BOOKING_WINDOW_DAYS = 56;

/**
 * The two tables the calendar is drawn from, cached beside everything else the
 * public page reads.
 *
 * Closures come back as date **keys** rather than as `Date`s, for the reason
 * `readHours` gives above: `unstable_cache` serializes what it stores, so a
 * `Date` put in comes back a string and the arithmetic downstream quietly stops
 * working. They are rebuilt into real dates in `getBookingWindow`, which is
 * where a `Date` is wanted and where nothing is cached.
 *
 * Only practice-wide closures are kept. One dentist's leave is not a day the
 * door is shut, and a public calendar greying out a Tuesday because a
 * hygienist is in Greece would be both wrong and a small leak about who is
 * away.
 */
const readBookingSource = unstable_cache(
  async () => {
    const [week, closures] = await Promise.all([getClinicWeek(), getClosures()]);

    return {
      week,
      closures: closures
        .filter((closure) => !closure.staffUserId)
        .map((closure) => ({
          from: toDateKey(closure.from),
          to: toDateKey(closure.to),
          reason: closure.reason,
        })),
    };
  },
  ['site-booking'],
  { revalidate: SITE_REVALIDATE_SECONDS, tags: [SITE_CACHE_TAG] },
);

/**
 * The next eight weeks, each day marked open or shut.
 *
 * **The window is computed per request and only its inputs are cached**, which
 * is the same split `getSiteHours` makes and for a sharper reason here: a cached
 * *window* would still start at yesterday for up to five minutes after midnight,
 * and the one thing a booking calendar may not do is offer a day that has been
 * and gone.
 *
 * Every day goes through `scheduleFor` — the same function the free-slot search
 * and the day grid use. There is deliberately no second implementation of "is
 * the practice open on this date" anywhere in this codebase, because a public
 * page greying out a Saturday the staff screen offers appointments on is the
 * exact bug that arrangement exists to make impossible.
 *
 * Shut days are returned rather than filtered out. The grid draws a month, not a
 * list, and a calendar with holes in it where Sundays should be is not a
 * calendar — it also has to be able to say *why* a Tuesday in April is
 * unavailable, and that answer only exists on the day itself.
 *
 * Null when the database could not be reached, for the reason `SiteData.hours`
 * is: the page then asks for a telephone call rather than showing a grid of
 * guesses. `DEFAULT_WEEK` is a reasonable stand-in for an unconfigured practice
 * and a lie on a public page.
 */
export const getBookingWindow = cache(async (): Promise<SiteBookingWindow | null> => {
  try {
    const { week, closures } = await readBookingSource();

    // Back into `Date`s on this side of the cache, so `scheduleFor` can be the
    // one thing that decides what a closure covers.
    const ranges: ClosureRange[] = closures.map((closure) => ({
      from: fromDateKey(closure.from),
      to: fromDateKey(closure.to),
      reason: closure.reason,
      staffUserId: null,
    }));

    const from = today();
    const days: SiteBookingDay[] = Array.from({ length: BOOKING_WINDOW_DAYS }, (_, offset) => {
      const date = addDays(from, offset);
      const schedule = scheduleFor(date, week, ranges);

      return {
        date: toDateKey(date),
        open: !schedule.closed,
        hours: describeRanges(schedule.ranges),
        closure: schedule.closureReason,
        ranges: schedule.ranges,
      };
    });

    return { from: toDateKey(from), to: days[days.length - 1].date, days };
  } catch {
    return null;
  }
});

export async function getSiteData(): Promise<SiteData> {
  const [contact, hours] = await Promise.all([getSiteContact(), getSiteHours()]);
  return { contact, hours };
}
