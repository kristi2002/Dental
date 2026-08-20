'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  fromDateKey,
  isSameDay,
  isSameMonth,
  monthGrid,
  startOfMonth,
  toDateKey,
  today,
  weekDays,
} from '@/lib/dates';
import { cn } from '@/lib/utils';

/** How many years one page of the year view holds — four rows of three. */
const YEARS_PER_PAGE = 12;

type View = 'days' | 'months' | 'years';

/** ISO day keys sort lexically, so a range test is a pair of string compares. */
function inRange(key: string, min?: string, max?: string): boolean {
  if (min && key < min) return false;
  if (max && key > max) return false;
  return true;
}

/** The nearest day the bounds allow — where the grid opens when today is not one. */
function intoRange(date: Date, min?: string, max?: string): Date {
  const key = toDateKey(date);
  if (min && key < min) return fromDateKey(min);
  if (max && key > max) return fromDateKey(max);
  return date;
}

/** Whether any day of the month `date` sits in is still reachable. */
function monthInRange(date: Date, min?: string, max?: string): boolean {
  return (
    (!min || toDateKey(endOfMonth(date)) >= min) &&
    (!max || toDateKey(startOfMonth(date)) <= max)
  );
}

/** Every cell in every view: one box, one set of states, different contents. */
function cellClass(state: {
  cursor: boolean;
  chosen: boolean;
  isToday: boolean;
  muted?: boolean;
  weekend?: boolean;
  disabled: boolean;
}) {
  return cn(
    'relative flex w-full items-center justify-center rounded-lg text-[0.95rem]',
    'font-semibold tabular-nums transition-colors',
    state.disabled
      ? 'cursor-not-allowed text-ink-faint/45'
      : state.chosen
        ? 'bg-brand-dark text-white hover:bg-brand-deep'
        : cn(
            'cursor-pointer hover:bg-brand-soft hover:text-brand-deep',
            state.muted
              ? 'text-ink-faint/70'
              : state.isToday
                ? 'text-brand-deep'
                : state.weekend
                  ? 'text-danger'
                  : 'text-ink',
          ),
    // Today wears a dot rather than a ring: a ring at this size is hard to
    // tell from the focus outline, and the two answer different questions.
    state.isToday &&
      !state.disabled &&
      'after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-brand',
    state.isToday && state.chosen && 'after:bg-white',
    // Where the keyboard is, drawn even before the cell has focus, so a panel
    // opened with the mouse still says where Enter would land.
    state.cursor && !state.chosen && !state.disabled && 'ring-1 ring-line-strong ring-inset',
  );
}

/**
 * The calendar itself: a month of days, and the two coarser grids it zooms out
 * to.
 *
 * Split from the field that opens it because the two have nothing to say to
 * each other beyond one date — this half knows about months and keyboards, the
 * other half knows about forms and where a popover is allowed to go.
 *
 * Zooming out is not a flourish. Half the dates in this app are dates of birth,
 * and a grid that only pages a month at a time asks somebody born in 1957 to
 * press the same arrow eight hundred times. The caption is a button for that
 * reason: days out to months, months out to years, and back down again as each
 * choice narrows the question.
 */
export function Calendar({
  value,
  min,
  max,
  onPick,
  onClear,
  onDismiss,
  labelledBy,
  className,
}: {
  /** The chosen day as `YYYY-MM-DD`, or empty. */
  value: string;
  min?: string;
  max?: string;
  onPick: (value: string) => void;
  /** Left out on a required field, where a blank is not an answer. */
  onClear?: () => void;
  /** Escape, or a choice made — the field closes the panel and takes focus back. */
  onDismiss: () => void;
  /** The field's own label, so the grid is announced as belonging to it. */
  labelledBy?: string;
  className?: string;
}) {
  const t = useTranslations('calendar');
  const format = useFormatter();
  const now = today();
  const chosen = value ? fromDateKey(value) : null;

  const [view, setView] = useState<View>('days');

  /**
   * The cell the keyboard is on — and, in the coarser views, which page is
   * showing. One piece of state for both, because they are the same fact read
   * at different resolutions.
   */
  const [cursor, setCursor] = useState<Date>(() => intoRange(chosen ?? now, min, max));

  const grid = useRef<HTMLDivElement>(null);

  // Roving focus. The cursor cell is the only one in the tab order, so Tab
  // leaves the grid rather than walking forty-two days, and the arrow keys move
  // the cursor instead. Re-run on `view` too: each zoom level has its own cells,
  // and the one that has just appeared is where the keyboard now is.
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')?.focus();
  }, [cursor, view]);

  const days = monthGrid(cursor);
  const yearPageStart = Math.floor(cursor.getUTCFullYear() / YEARS_PER_PAGE) * YEARS_PER_PAGE;

  /** What the arrows step, at each zoom level. */
  const page = (direction: -1 | 1) => {
    const step = view === 'days' ? 1 : view === 'months' ? 12 : 12 * YEARS_PER_PAGE;
    setCursor(addMonths(cursor, direction * step));
  };

  const pageBlocked = (direction: -1 | 1) => {
    const step = view === 'days' ? 1 : view === 'months' ? 12 : 12 * YEARS_PER_PAGE;
    return !monthInRange(addMonths(cursor, direction * step), min, max);
  };

  const caption =
    view === 'days'
      ? format.dateTime(cursor, { month: 'long', year: 'numeric' })
      : view === 'months'
        ? format.dateTime(cursor, { year: 'numeric' })
        : `${yearPageStart}–${yearPageStart + YEARS_PER_PAGE - 1}`;

  function onGridKeyDown(event: KeyboardEvent<HTMLElement>) {
    /**
     * Every move is expressed as "from wherever the cursor now is", and handed
     * to the setter as a function rather than a value.
     *
     * Holding an arrow down is a burst of keydowns, and React batches whatever
     * arrives before it next commits. A handler that read `cursor` out of its
     * own render closure would have every press in the burst start from the
     * same day, so a held key would move exactly one square and stop.
     */
    const move = (step: (from: Date) => Date) => {
      event.preventDefault();
      setCursor((from) => intoRange(step(from), min, max));
    };
    // Monday-first, so Monday is 0 and Sunday is 6.
    const weekday = (date: Date) => (date.getUTCDay() + 6) % 7;
    const coarse = view === 'months' ? 1 : 12;

    switch (event.key) {
      case 'ArrowLeft':
        return move((from) =>
          view === 'days' ? addDays(from, -1) : addMonths(from, -coarse),
        );
      case 'ArrowRight':
        return move((from) => (view === 'days' ? addDays(from, 1) : addMonths(from, coarse)));
      case 'ArrowUp':
        return move((from) =>
          view === 'days' ? addDays(from, -7) : addMonths(from, -3 * coarse),
        );
      case 'ArrowDown':
        return move((from) =>
          view === 'days' ? addDays(from, 7) : addMonths(from, 3 * coarse),
        );
      case 'Home':
        return view === 'days' ? move((from) => addDays(from, -weekday(from))) : undefined;
      case 'End':
        return view === 'days' ? move((from) => addDays(from, 6 - weekday(from))) : undefined;
      case 'PageUp':
        return move((from) => addMonths(from, event.shiftKey ? -12 : -1));
      case 'PageDown':
        return move((from) => addMonths(from, event.shiftKey ? 12 : 1));
      default:
        return undefined;
    }
  }


  return (
    <div
      className={cn(
        'w-[19.5rem] overflow-hidden rounded-[var(--radius-card)] border border-line',
        'bg-surface shadow-pop',
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm min-h-9 px-2"
          aria-label={view === 'days' ? t('previousMonth') : t('previousPage')}
          disabled={pageBlocked(-1)}
          onClick={() => page(-1)}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>

        {/* The heading and the zoom control are one thing: the words already say
            where you are, so making them the way out saves a target and a
            second row of chrome. */}
        <button
          type="button"
          className={cn(
            'flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg px-2',
            'text-[1rem] font-bold text-ink transition-colors',
            'hover:bg-brand-soft hover:text-brand-deep',
          )}
          aria-label={t('changeView')}
          onClick={() =>
            setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days')
          }
        >
          {/* Polite rather than assertive: paging is the user's own doing, and
              the new month should be read out after the keypress, not over it. */}
          <span aria-live="polite" className="first-letter:uppercase">
            {caption}
          </span>
          <ChevronDown size={16} aria-hidden className={cn(view !== 'days' && 'rotate-180')} />
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm min-h-9 px-2"
          aria-label={view === 'days' ? t('nextMonth') : t('nextPage')}
          disabled={pageBlocked(1)}
          onClick={() => page(1)}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      {/* Divs carrying the grid roles rather than a `<table>`: the cells are
          buttons, so the table would have been scaffolding for an ARIA shape it
          then had to be told to drop anyway. */}
      {/* One height for all three views. Zooming out drops from six rows of
          days to four of months, and letting the box shrink by a third would
          slide the footer — and, in a popover placed above its field, the
          whole panel — out from under the pointer that was aiming at it. */}
      <div ref={grid} className="flex min-h-[17.95rem] flex-col justify-center p-2">
        {view === 'days' ? (
          <div role="grid" aria-labelledby={labelledBy}>
            <div role="row" className="grid grid-cols-7">
              {weekDays(cursor).map((day, index) => (
                <span
                  key={toDateKey(day)}
                  role="columnheader"
                  className="pb-1.5 text-center"
                >
                  <abbr
                    title={format.dateTime(day, { weekday: 'long' })}
                    className={cn(
                      'text-[0.72rem] font-bold tracking-wide uppercase no-underline',
                      // Saturday and Sunday in red, the way a paper calendar
                      // prints them — and the way the month view already does.
                      index > 4 ? 'text-danger' : 'text-ink-faint',
                    )}
                  >
                    {format.dateTime(day, { weekday: 'short' })}
                  </abbr>
                </span>
              ))}
            </div>

            {[0, 1, 2, 3, 4, 5].map((week) => (
              <div key={week} role="row" className="grid grid-cols-7">
                {days.slice(week * 7, week * 7 + 7).map((day, index) => {
                  const key = toDateKey(day);
                  const blocked = !inRange(key, min, max);
                  const isCursor = isSameDay(day, cursor);
                  const isChosen = chosen ? isSameDay(day, chosen) : false;

                  return (
                    <span key={key} role="gridcell" className="p-0.5">
                      <button
                        type="button"
                        data-cursor={isCursor}
                        onKeyDown={onGridKeyDown}
                        tabIndex={isCursor ? 0 : -1}
                        disabled={blocked}
                        aria-pressed={isChosen}
                        aria-current={isSameDay(day, now) ? 'date' : undefined}
                        // The whole date, because "14" on its own is not one —
                        // and the month it belongs to is exactly what the
                        // trailing and leading cells are ambiguous about.
                        aria-label={format.dateTime(day, { dateStyle: 'long' })}
                        className={cn(
                          'h-9',
                          cellClass({
                            cursor: isCursor,
                            chosen: isChosen,
                            isToday: isSameDay(day, now),
                            muted: !isSameMonth(day, cursor),
                            weekend: index > 4,
                            disabled: blocked,
                          }),
                        )}
                        onClick={() => onPick(key)}
                      >
                        {format.dateTime(day, { day: 'numeric' })}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {view === 'months' ? (
          <div role="group" aria-label={t('chooseMonth')} className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, month) => {
              const first = new Date(Date.UTC(cursor.getUTCFullYear(), month, 1));
              const blocked = !monthInRange(first, min, max);
              const isCursor = month === cursor.getUTCMonth();

              return (
                <button
                  key={month}
                  type="button"
                  data-cursor={isCursor}
                  onKeyDown={onGridKeyDown}
                  tabIndex={isCursor ? 0 : -1}
                  disabled={blocked}
                  aria-pressed={chosen ? isSameMonth(first, chosen) : false}
                  className={cn(
                    'h-11 first-letter:uppercase',
                    cellClass({
                      cursor: isCursor,
                      chosen: chosen ? isSameMonth(first, chosen) : false,
                      isToday: isSameMonth(first, now),
                      disabled: blocked,
                    }),
                  )}
                  onClick={() => {
                    // Keep the day of the month and drop back down a level: the
                    // question just answered was "which month", and the one
                    // after it is always "which day".
                    setCursor(
                      intoRange(
                        new Date(
                          Date.UTC(cursor.getUTCFullYear(), month, cursor.getUTCDate()),
                        ),
                        min,
                        max,
                      ),
                    );
                    setView('days');
                  }}
                >
                  {format.dateTime(first, { month: 'short' })}
                </button>
              );
            })}
          </div>
        ) : null}

        {view === 'years' ? (
          <div role="group" aria-label={t('chooseYear')} className="grid grid-cols-3 gap-1">
            {Array.from({ length: YEARS_PER_PAGE }, (_, index) => {
              const year = yearPageStart + index;
              // A year is out only when neither end of it is reachable.
              const blocked =
                !monthInRange(new Date(Date.UTC(year, 0, 1)), min, max) &&
                !monthInRange(new Date(Date.UTC(year, 11, 1)), min, max);
              const isCursor = year === cursor.getUTCFullYear();

              return (
                <button
                  key={year}
                  type="button"
                  data-cursor={isCursor}
                  onKeyDown={onGridKeyDown}
                  tabIndex={isCursor ? 0 : -1}
                  disabled={blocked}
                  aria-pressed={chosen ? year === chosen.getUTCFullYear() : false}
                  className={cn(
                    'h-11',
                    cellClass({
                      cursor: isCursor,
                      chosen: chosen ? year === chosen.getUTCFullYear() : false,
                      isToday: year === now.getUTCFullYear(),
                      disabled: blocked,
                    }),
                  )}
                  onClick={() => {
                    setCursor(
                      intoRange(
                        new Date(Date.UTC(year, cursor.getUTCMonth(), cursor.getUTCDate())),
                        min,
                        max,
                      ),
                    );
                    setView('months');
                  }}
                >
                  {year}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm font-semibold"
          disabled={!inRange(toDateKey(now), min, max)}
          onClick={() => onPick(toDateKey(now))}
        >
          {t('today')}
        </button>

        {/* Clear only where a blank is a legitimate answer. On a required field
            the button would be a way of putting the form back into the one
            state the server is certain to refuse. */}
        {onClear ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm font-semibold"
            disabled={!value}
            onClick={onClear}
          >
            {t('clear')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm font-semibold"
            onClick={onDismiss}
          >
            {t('close')}
          </button>
        )}
      </div>
    </div>
  );
}
