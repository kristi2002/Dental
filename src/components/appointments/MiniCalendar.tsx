import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  addMonths,
  endOfWeek,
  isSameDay,
  isSameMonth,
  monthGrid,
  startOfWeek,
  toDateKey,
  today,
  weekDays,
} from '@/lib/dates';
import { cn } from '@/lib/utils';

/**
 * The month rail beside the calendar.
 *
 * It answers two questions the big grid cannot: where the open week sits in the
 * month, and which other days are busy. The whole week under the cursor is
 * banded rather than just the chosen day, because the grid to its right is
 * showing that week — the highlight and the schedule have to agree about what
 * is on screen.
 *
 * Every cell is a link that keeps the current view, so a front desk in week
 * view stays in week view and simply lands on a different week.
 */
export function MiniCalendar({
  anchor,
  counts,
  picks = 'day',
  hrefFor,
}: {
  /** The day the calendar is anchored on — its month is drawn, its week banded. */
  anchor: Date;
  /** `YYYY-MM-DD` → number of appointments, for the density dots. */
  counts: Record<string, number>;
  /**
   * What clicking actually changes on the grid beside it. In week view any day
   * lands on the same week, so the rail lights the whole row under the cursor
   * rather than one cell — the hover has to promise what the click delivers.
   */
  picks?: 'day' | 'week';
  hrefFor: (date: Date) => string;
}) {
  const t = useTranslations('appointments');
  const format = useFormatter();
  const now = today();

  const days = monthGrid(anchor);
  // Six rows of seven rather than 42 loose cells, so a week is a thing the
  // markup has — and therefore a thing that can be banded and hovered.
  const weeks = Array.from({ length: 6 }, (_, row) => days.slice(row * 7, row * 7 + 7));
  const bandFrom = startOfWeek(anchor);
  const bandTo = endOfWeek(anchor);

  return (
    <nav aria-label={t('monthCalendar')} className="card overflow-hidden" data-print-hide>
      <header className="flex items-center justify-between gap-1 bg-brand-dark px-2 py-2 text-white">
        <Link
          href={hrefFor(addMonths(anchor, -1))}
          aria-label={t('prevMonth')}
          className="on-brand-control flex min-h-10 min-w-10 items-center justify-center rounded-lg"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>

        <p className="text-center leading-tight">
          <span className="block text-[1.02rem] font-bold tracking-wide uppercase">
            {format.dateTime(anchor, { month: 'long' })}
          </span>
          <span className="block text-[0.85rem] tabular-nums text-white/85">
            {format.dateTime(anchor, { year: 'numeric' })}
          </span>
        </p>

        <Link
          href={hrefFor(addMonths(anchor, 1))}
          aria-label={t('nextMonth')}
          className="on-brand-control flex min-h-10 min-w-10 items-center justify-center rounded-lg"
        >
          <ChevronRight size={20} aria-hidden />
        </Link>
      </header>

      <div className="grid grid-cols-7 px-1.5 pt-2 text-center">
        {weekDays(anchor).map((day, index) => (
          <abbr
            key={toDateKey(day)}
            title={format.dateTime(day, { weekday: 'long' })}
            className={cn(
              'py-1 text-[0.72rem] font-bold tracking-wide uppercase no-underline',
              // Saturday and Sunday in red, the way a paper calendar prints them.
              index > 4 ? 'text-danger' : 'text-ink-faint',
            )}
          >
            {format.dateTime(day, { weekday: 'short' })}
          </abbr>
        ))}
      </div>

      <div className="px-1.5 pb-2">
        {weeks.map((week) => {
          const inBand = week[0] >= bandFrom && week[0] <= bandTo;

          return (
            <div
              key={toDateKey(week[0])}
              className={cn(
                'grid grid-cols-7 rounded-lg py-0.5 transition-colors',
                // The banded week reads as one bar rather than seven chips.
                inBand && 'bg-paper',
                // In week view the row is the target, so the row is what lights.
                picks === 'week' && !inBand && 'hover:bg-brand-soft/70',
              )}
            >
              {week.map((day, index) => {
                const key = toDateKey(day);
                const selected = isSameDay(day, anchor);
                const isToday = isSameDay(day, now);
                const outside = !isSameMonth(day, anchor);
                const count = counts[key] ?? 0;
                const weekend = index > 4;

                return (
                  <Link
                    key={key}
                    href={hrefFor(day)}
                    aria-current={selected ? 'date' : undefined}
                    className={cn(
                      'relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-[0.95rem] tabular-nums no-underline transition-colors',
                      selected
                        ? 'bg-brand-dark font-bold text-white'
                        : cn(
                            // Kept even when the row lights too: it is the hint
                            // of exactly where the click landed.
                            'hover:bg-brand-soft',
                            isToday && 'font-bold ring-2 ring-brand ring-inset',
                            outside ? 'text-ink-faint/55' : weekend ? 'text-danger' : 'text-ink',
                          ),
                    )}
                  >
                    {format.dateTime(day, { day: 'numeric' })}
                    {count > 0 ? (
                      <>
                        <span
                          aria-hidden
                          className={cn(
                            'absolute bottom-1 h-1 w-1 rounded-full',
                            selected ? 'bg-white' : 'bg-brand',
                          )}
                        />
                        <span className="sr-only">{t('dayCount', { count })}</span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
