import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isSameDay, isSameMonth, monthGrid, toDateKey, today, weekDays } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { blockStyle } from './status-styles';
import type { AppointmentView } from './types';

/** How many bookings a cell shows before it collapses into "+n more". */
const MAX_PER_DAY = 3;

/**
 * The month as a wall planner: six rows of seven days, each holding the first
 * few bookings on it.
 *
 * It answers a different question from the day and week grids. Those are about
 * the shape of a day — where the gaps are, what runs long. This one is about
 * the shape of a month: which weeks are full, which Thursday is still empty,
 * how far ahead the diary actually reaches. Time is not to scale here, because
 * at this zoom a scale grid would render every booking as a hairline.
 *
 * Every cell links into the day view, so the month is a way in rather than a
 * dead end.
 */
export function MonthView({
  anchor,
  appointments,
  closedDays,
  dayHref,
}: {
  /** Any date inside the month to draw. */
  anchor: Date;
  /** Everything in the 42-cell grid, including the days either side of the month. */
  appointments: AppointmentView[];
  /** `YYYY-MM-DD` of every day the practice is shut, for the shading. */
  closedDays: ReadonlySet<string>;
  /** Link to a single day, with the page's own filters kept. */
  dayHref: (dateKey: string) => string;
}) {
  const t = useTranslations('appointments');
  const format = useFormatter();
  const now = today();
  const days = monthGrid(anchor);

  // One pass over the range rather than a filter per cell — a busy month is a
  // few hundred rows, and 42 filters over it is 42 full scans.
  const byDay = new Map<string, AppointmentView[]>();
  for (const appointment of appointments) {
    const bucket = byDay.get(appointment.date);
    if (bucket) bucket.push(appointment);
    else byDay.set(appointment.date, [appointment]);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[48rem]">
        <div className="grid grid-cols-7 border-b border-line">
          {weekDays(anchor).map((day, index) => (
            <abbr
              key={toDateKey(day)}
              title={format.dateTime(day, { weekday: 'long' })}
              className={cn(
                'border-r border-line py-2 text-center text-[0.78rem] font-bold tracking-wide uppercase no-underline last:border-r-0',
                // Saturday and Sunday in red, the way a paper calendar prints them.
                index > 4 ? 'text-danger' : 'text-ink-faint',
              )}
            >
              {format.dateTime(day, { weekday: 'short' })}
            </abbr>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const key = toDateKey(day);
            const isToday = isSameDay(day, now);
            const outside = !isSameMonth(day, anchor);
            const weekend = index % 7 > 4;
            const closed = closedDays.has(key);
            const booked = byDay.get(key) ?? [];
            const shown = booked.slice(0, MAX_PER_DAY);
            const hidden = booked.length - shown.length;

            return (
              <div
                key={key}
                className={cn(
                  'min-h-[7.5rem] border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0',
                  // Two kinds of grey, and they mean different things: a day
                  // outside the month is context, a closed day is information.
                  outside && 'bg-surface-soft',
                  closed && !outside && 'bg-paper',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <Link
                    href={dayHref(key)}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-[0.98rem] font-bold tabular-nums no-underline transition-colors',
                      isToday
                        ? 'bg-brand-dark text-white'
                        : cn(
                            'hover:bg-brand-soft',
                            outside
                              ? 'text-ink-faint/60'
                              : weekend
                                ? 'text-danger'
                                : 'text-ink',
                          ),
                    )}
                  >
                    {format.dateTime(day, { day: 'numeric' })}
                  </Link>

                  {booked.length > 0 ? (
                    <span className="text-[0.75rem] font-semibold tabular-nums text-ink-faint">
                      <span aria-hidden>{booked.length}</span>
                      <span className="sr-only">{t('dayCount', { count: booked.length })}</span>
                    </span>
                  ) : null}
                </div>

                <ul className="space-y-1">
                  {shown.map((appointment) => (
                    <li key={appointment.id}>
                      <Link
                        href={dayHref(appointment.date)}
                        title={`${appointment.startTime} · ${appointment.patient.firstName} ${appointment.patient.lastName}${
                          appointment.serviceName ? ` · ${appointment.serviceName}` : ''
                        }`}
                        className={cn(
                          'flex items-baseline gap-1.5 overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-[0.8rem] leading-snug no-underline',
                          blockStyle(appointment.status),
                        )}
                      >
                        <span className="shrink-0 font-bold tabular-nums">
                          {appointment.startTime}
                        </span>
                        <span className="truncate font-semibold">
                          {appointment.patient.lastName}
                        </span>
                      </Link>
                    </li>
                  ))}

                  {hidden > 0 ? (
                    <li>
                      <Link
                        href={dayHref(key)}
                        className="block px-1.5 text-[0.78rem] font-semibold text-brand-deep"
                      >
                        {t('moreCount', { count: hidden })}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
