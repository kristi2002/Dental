'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useDateNames } from '@/components/shared/DateNamesProvider';
import {
  addMonths,
  fromDateKey,
  isSameMonth,
  monthGrid,
  startOfMonth,
  toDateKey,
} from '@/lib/dates';
import type { SiteBookingDay } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * The month grid on the booking page — which days this practice is open.
 *
 * **It is drawn from the practice's own `ClinicHours` and `Closure` rows**, not
 * from a hard-coded week. A Saturday the practice has decided to close is grey
 * here the moment somebody saves the Settings screen, and the fortnight in
 * August the surgery is shut says so by name. That is the whole argument for
 * building a storefront inside the software rather than beside it: a separate
 * marketing site would still be offering appointments on a day the door is
 * locked. See `getBookingWindow`.
 *
 * **It is a preference, not a slot, and the design has to say so.** Nothing here
 * is reserved and no time is offered — the practice rings back and agrees the
 * hour, which is what the page says above the grid and again in the
 * confirmation. A public calendar that hands out 09:20 is making a promise
 * nobody has checked against the book, and the desk then has to ring and take it
 * away.
 *
 * **Real radios, not buttons with `aria-pressed`.** A month of days is exactly
 * what a radio group is: one choice out of many, in a named group, posted as an
 * ordinary form field. The browser gives roving focus, arrow keys, the group
 * announcement and "4 of 30" for nothing, and the value arrives in `FormData`
 * with no hidden input and no JavaScript on the submit path. The input is a real
 * focusable element behind the cell rather than a `display: none`, so a keyboard
 * ring lands on the face beside it — see `.day-face` in `globals.css`.
 *
 * **Days the practice is shut are drawn, not omitted.** A grid with holes where
 * the Sundays should be is not a calendar, and a reader looking at a greyed
 * Tuesday in April deserves the reason rather than the impression that the page
 * is broken — which is why the closures for the month on screen are printed
 * underneath it in words.
 *
 * **Paging is state, not navigation.** The whole eight-week window arrives in
 * the RSC payload — fifty-six small objects, a few kilobytes — so moving from
 * September to October is a re-render and not a round trip that would throw away
 * the name and number already typed into the column beside it. A reader with no
 * JavaScript gets the current month, server-rendered and fully working, and the
 * arrows do nothing; that is a fair degradation precisely because this field is
 * optional. A request with no day on it is exactly the request this form took
 * before it had a calendar.
 */
export function BookingCalendar({
  days,
  name,
  value,
  onPick,
  labelledBy,
  className,
}: {
  /** The whole window, open days and shut ones alike, in order. */
  days: readonly SiteBookingDay[];
  /** The radio group's field name — what the action reads out of `FormData`. */
  name: string;
  /** The chosen day as `YYYY-MM-DD`, or empty for "no preference". */
  value: string;
  onPick: (date: string) => void;
  /** The heading this grid belongs to, for the group's own announcement. */
  labelledBy?: string;
  className?: string;
}) {
  const t = useTranslations('site');
  const format = useFormatter();
  // Month and weekday names come from the server. Chromium ships no Albanian
  // locale data, so a client component that asked `Intl` for "e enjte" would get
  // "Thu" and a hydration mismatch with it. See `lib/date-names.ts`.
  const dates = useDateNames();

  const byDate = useMemo(
    () => new Map(days.map((day) => [day.date, day])),
    [days],
  );

  const first = fromDateKey(days[0].date);
  const last = fromDateKey(days[days.length - 1].date);
  const firstMonth = startOfMonth(first);
  const lastMonth = startOfMonth(last);

  /**
   * Which month is on screen — and, with it, which way the last move went.
   *
   * The direction is only ever read by the stylesheet: the grid slides in from
   * the side it came from, so paging forward and paging back are visibly
   * different gestures rather than the same fade twice. It is state rather than
   * a class name computed at the call site because the animation has to restart
   * on every press, which is what the `key` below is for.
   */
  const [month, setMonth] = useState(() =>
    startOfMonth(value ? fromDateKey(value) : first),
  );
  const [direction, setDirection] = useState<'next' | 'previous'>('next');

  const page = (step: -1 | 1) => {
    setDirection(step === 1 ? 'next' : 'previous');
    setMonth((from) => addMonths(from, step));
  };

  const grid = monthGrid(month);

  /**
   * The closures falling inside the month on screen, each named once.
   *
   * A grey Tuesday in April is indistinguishable from a bug unless the page says
   * why, and the reason only exists on the day itself. Collapsed by reason
   * rather than listed per day: a fortnight shut for the same holiday is one
   * line, not fourteen.
   */
  const closures = useMemo(() => {
    const seen = new Set<string>();
    return grid
      .filter((day) => isSameMonth(day, month))
      .map((day) => byDate.get(toDateKey(day))?.closure)
      .filter((reason): reason is string => {
        if (!reason || seen.has(reason)) return false;
        seen.add(reason);
        return true;
      });
  }, [grid, month, byDate]);

  return (
    <div className={cn('book-plate relative overflow-clip rounded-2xl', className)}>
      {/* --- The month, and the two arrows ---------------------------------
       *
       * The caption is set in the display serif at a size nothing else in this
       * panel comes near. It is the one piece of orientation the grid has, and a
       * month name in the same weight as the numerals under it is a calendar a
       * reader has to work at.
       *
       * `aria-live="polite"` rather than assertive: paging is the reader's own
       * doing, so the new month should be read after the keypress and not over
       * it.
       */}
      <div className="flex items-center justify-between gap-3 border-b border-bone-deep/70 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={() => page(-1)}
          disabled={month <= firstMonth}
          aria-label={t('book.previousMonth')}
          className="book-step"
        >
          <ChevronLeft size={19} aria-hidden />
        </button>

        <p
          aria-live="polite"
          className="font-display text-[clamp(1.15rem,2.4vw,1.45rem)] leading-none text-bone-ink first-letter:uppercase"
        >
          {dates.date(month, 'monthYearLong')}
        </p>

        <button
          type="button"
          onClick={() => page(1)}
          disabled={month >= lastMonth}
          aria-label={t('book.nextMonth')}
          className="book-step"
        >
          <ChevronRight size={19} aria-hidden />
        </button>
      </div>

      {/*
       * A `fieldset` because that is what a group of radios is, and a visually
       * hidden `legend` because the panel already carries the question as a
       * heading — printing it twice would have a screen reader read the same
       * sentence in a row.
       *
       * `min-width: 0` on the fieldset: a `fieldset` has a shrink-to-fit default
       * that survives `display: grid` in a way a `div` does not, and without it
       * the seven columns push the whole two-column layout wider than the page
       * at the narrowest widths.
       */}
      <fieldset className="min-w-0 border-0 px-3 pt-4 pb-4 sm:px-4 sm:pb-5">
        <legend className="sr-only">{t('book.dayLegend')}</legend>

        {/* Monday first, which is how a week is read here — the same order
            `WEEKDAY_ORDER` puts the opening hours in. `abbr` carries the whole
            name, so a pointer and a screen reader both get "Wednesday" out of a
            two-letter head. */}
        <div aria-hidden className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {grid.slice(0, 7).map((day, index) => (
            <abbr
              key={toDateKey(day)}
              title={dates.date(day, 'weekdayLong')}
              className={cn(
                'pb-2 text-center text-micro font-bold tracking-[0.12em] uppercase no-underline',
                // The weekend in bronze rather than in red: this is a grid of
                // days a practice is open, not a wall calendar, and red here
                // would read as "unavailable" on a Saturday it works.
                index > 4 ? 'text-gilt-deep' : 'text-bone-ink-faint',
              )}
            >
              {dates.date(day, 'weekdayShort').slice(0, 2)}
            </abbr>
          ))}
        </div>

        {/*
         * Keyed on the month so the entrance animation restarts on every press.
         * Without the key React reuses the node, the animation has already run,
         * and paging becomes an instant swap — which reads as a glitch rather
         * than as a movement.
         */}
        <div
          key={toDateKey(month)}
          data-direction={direction}
          className="book-month grid grid-cols-7 gap-1 sm:gap-1.5"
        >
          {grid.map((day) => {
            const key = toDateKey(day);
            const entry = byDate.get(key);
            const numeral = format.dateTime(day, { day: 'numeric' });
            const outside = !isSameMonth(day, month);

            // Beyond the window, or in a month either side of the one on
            // screen. Drawn as a ghost rather than left blank: an empty cell
            // makes the grid look ragged at the corners, and the numeral is
            // what tells a reader the month runs on past the edge.
            if (!entry || outside) {
              return (
                <span key={key} aria-hidden className="day" data-state="outside">
                  <span className="day-face">{numeral}</span>
                </span>
              );
            }

            if (!entry.open) {
              return (
                <span
                  key={key}
                  className="day"
                  data-state="closed"
                  // Announced rather than merely grey. `aria-disabled` on a
                  // non-interactive element is the honest shape here: there is
                  // no control to disable, only a day that cannot be chosen.
                  aria-disabled="true"
                  title={entry.closure ?? t('book.closedDay')}
                >
                  <span className="day-face">{numeral}</span>
                </span>
              );
            }

            const chosen = value === entry.date;
            const isFirst = entry.date === days[0].date;

            return (
              <label
                key={key}
                className="day"
                data-state={chosen ? 'chosen' : 'open'}
                data-today={isFirst || undefined}
              >
                <input
                  type="radio"
                  name={name}
                  value={entry.date}
                  checked={chosen}
                  onChange={() => onPick(entry.date)}
                  className="day-input"
                  // The whole date and the hours behind it. "4" is not a date,
                  // and the one thing a reader of this grid wants to know before
                  // choosing is what time the practice is open that day.
                  aria-label={`${dates.date(day, 'weekdayLongDayMonthLongYear')} · ${entry.hours}`}
                />
                <span aria-hidden className="day-face">
                  {numeral}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Why a day in this month is grey, in words. Only the months that
          actually carry a closure get a line; a September with nothing but
          Sundays shut says nothing, because nobody needs Sunday explained. */}
      {closures.length > 0 ? (
        <p className="border-t border-bone-deep/70 px-4 py-3 text-meta leading-relaxed text-bone-ink-soft sm:px-5">
          <span className="font-semibold text-bone-ink">{t('book.closedNote')}</span>{' '}
          {closures.join(' · ')}
        </p>
      ) : null}

      {/* The grid is announced as a group belonging to the panel's own heading,
          which is what `labelledBy` carries. Rendered as a description rather
          than a label so it is read after the heading rather than instead of
          it. */}
      <p id={labelledBy ? `${labelledBy}-hint` : undefined} className="sr-only">
        {t('book.gridHint')}
      </p>
    </div>
  );
}
