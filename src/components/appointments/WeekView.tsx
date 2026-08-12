import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { gridHoursFor, type DaySchedule } from '@/lib/clinic-hours';
import {
  clinicMinutesNow,
  isSameDay,
  minutesToTime,
  timeToMinutes,
  toDateKey,
  today,
  weekDays,
} from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { AppointmentView } from './types';

/**
 * One hour of grid, in rem. Every position on the week is derived from it, so
 * an appointment's height is its real length — a two-hour crown sits twice as
 * tall as the check-up after it, and the hole between them is the gap somebody
 * can be squeezed into.
 */
const HOUR_REM = 4;

/** Below this a block has no room for its own text, so short bookings are drawn taller. */
const MIN_BLOCK_REM = 1.35;

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'border-brand/45 bg-brand-soft text-ink',
  ARRIVED: 'border-accent bg-accent-soft text-ink',
  COMPLETED: 'border-ok/35 bg-ok-soft text-ink',
  CANCELLED: 'border-line-strong bg-paper text-ink-soft line-through',
  NO_SHOW: 'border-warn/35 bg-warn-soft text-ink',
};

type Block = {
  appointment: AppointmentView;
  /** Minutes since midnight. */
  start: number;
  end: number;
  /** Which of `columns` side-by-side lanes this block sits in. */
  column: number;
  columns: number;
};

/**
 * Place a day's appointments into side-by-side lanes.
 *
 * Two bookings at the same hour are a real thing in a practice with two chairs,
 * and hiding one behind the other is how a double booking goes unnoticed until
 * both patients are in the waiting room. Overlapping runs are split into as
 * many lanes as the busiest moment in the run needs, so nothing is ever covered.
 */
function layOutDay(dayAppointments: AppointmentView[]): Block[] {
  const items = dayAppointments
    .map((appointment) => {
      const start = timeToMinutes(appointment.startTime);
      // A zero-length booking would never overlap anything, including itself.
      return { appointment, start, end: start + Math.max(5, appointment.durationMin) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const blocks: Block[] = [];
  let run: Block[] = [];
  let laneEnds: number[] = [];

  const closeRun = () => {
    for (const block of run) block.columns = laneEnds.length;
    run = [];
    laneEnds = [];
  };

  for (const item of items) {
    // Nothing in the current run reaches this one: it starts a run of its own.
    if (laneEnds.length > 0 && item.start >= Math.max(...laneEnds)) closeRun();

    let column = laneEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[column] = item.end;
    }

    const block: Block = { ...item, column, columns: 1 };
    run.push(block);
    blocks.push(block);
  }
  closeRun();

  return blocks;
}

/**
 * The week as a time grid: seven day columns over a shared hour ruler.
 *
 * The columns are the same grid the day view draws, seven abreast — so "when is
 * this week free" is answered by looking at the white space rather than by
 * opening seven days one after another. Closed hours stay on the grid, shaded,
 * because a clinic needs to see that Saturday afternoon exists and is shut.
 */
export function WeekView({
  anchor,
  appointments,
  schedules,
  dayHref,
}: {
  /** Any date inside the week to render. */
  anchor: Date;
  appointments: AppointmentView[];
  /** One schedule per day, Monday-first — the same order as `weekDays(anchor)`. */
  schedules: DaySchedule[];
  /** Link to a single day, with the page's own filters kept. */
  dayHref: (dateKey: string) => string;
}) {
  const t = useTranslations('appointments');
  const format = useFormatter();
  const now = today();
  const days = weekDays(anchor);

  const byDay = days.map((day) => {
    const key = toDateKey(day);
    return appointments.filter((appointment) => appointment.date === key);
  });

  // The grid has to cover the widest open window in the week, plus anything
  // booked outside it on any day — one ruler for all seven columns.
  const bounds = days.map((_, index) =>
    gridHoursFor(
      schedules[index],
      byDay[index].map((appointment) => timeToMinutes(appointment.startTime)),
    ),
  );
  const startHour = Math.min(...bounds.map((bound) => bound.startHour));
  const endHour = Math.max(startHour + 1, ...bounds.map((bound) => bound.endHour));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const startMinute = startHour * 60;
  const gridRem = hours.length * HOUR_REM;

  // The "you are here" line, drawn only on today and only while the clock is
  // inside the hours on screen.
  const nowMinutes = clinicMinutesNow();
  const todayIndex = days.findIndex((day) => isSameDay(day, now));
  const nowRem = ((nowMinutes - startMinute) / 60) * HOUR_REM;
  const showNowLine = todayIndex >= 0 && nowRem >= 0 && nowRem <= gridRem;

  const columns = 'grid grid-cols-[3.75rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[4.5rem_repeat(7,minmax(0,1fr))]';

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[54rem]">
        <div className={cn(columns, 'border-b border-line')}>
          <div className="border-r border-line" />
          {days.map((day, index) => {
            const key = toDateKey(day);
            const isToday = isSameDay(day, now);

            return (
              <Link
                key={key}
                href={dayHref(key)}
                aria-current={isToday ? 'date' : undefined}
                className={cn(
                  'border-r border-line px-2 py-2 text-center no-underline transition-colors last:border-r-0 hover:bg-brand-soft',
                  isToday && 'bg-brand-dark text-white hover:bg-brand-dark',
                )}
              >
                <span
                  className={cn(
                    'block text-[0.78rem] font-bold tracking-wide uppercase',
                    isToday ? 'text-white/85' : 'text-ink-faint',
                  )}
                >
                  {format.dateTime(day, { weekday: 'short' })}
                </span>
                <span className="block text-[1.15rem] font-bold tabular-nums">
                  {format.dateTime(day, { day: 'numeric' })}
                </span>
                {schedules[index].closed ? (
                  <span
                    className={cn(
                      'block text-[0.72rem] font-semibold',
                      isToday ? 'text-white/85' : 'text-ink-faint',
                    )}
                  >
                    {t('closedHour')}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className={columns}>
          <div className="border-r border-line">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_REM}rem` }}
                className="border-b border-line pt-1 pr-2 text-right text-[0.85rem] font-semibold tabular-nums text-ink-faint last:border-b-0"
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {days.map((day, index) => {
            const key = toDateKey(day);
            const schedule = schedules[index];
            const isToday = isSameDay(day, now);

            return (
              <div
                key={key}
                className={cn(
                  'relative border-r border-line last:border-r-0',
                  isToday && 'bg-brand-soft/30',
                )}
              >
                {hours.map((hour) => {
                  const open = schedule.ranges.some(
                    (range) => range.start < (hour + 1) * 60 && range.end > hour * 60,
                  );

                  return (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_REM}rem` }}
                      className={cn(
                        'border-b border-line last:border-b-0',
                        // Shut hours are shaded rather than dropped: the front
                        // desk can still see that four o'clock exists.
                        !open && 'bg-paper',
                      )}
                    />
                  );
                })}

                {layOutDay(byDay[index]).map((block) => {
                  const { appointment } = block;
                  const top = Math.max(0, ((block.start - startMinute) / 60) * HOUR_REM);
                  const height = Math.min(
                    gridRem - top,
                    Math.max(MIN_BLOCK_REM, ((block.end - block.start) / 60) * HOUR_REM),
                  );
                  const lane = 100 / block.columns;
                  const name = `${appointment.patient.firstName} ${appointment.patient.lastName}`;
                  const endTime = minutesToTime(block.end);

                  return (
                    <Link
                      key={appointment.id}
                      href={dayHref(appointment.date)}
                      title={`${appointment.startTime}–${endTime} · ${name}${
                        appointment.serviceName ? ` · ${appointment.serviceName}` : ''
                      }`}
                      style={{
                        top: `${top}rem`,
                        height: `${height}rem`,
                        left: `calc(${block.column * lane}% + 0.15rem)`,
                        width: `calc(${lane}% - 0.3rem)`,
                      }}
                      className={cn(
                        'absolute overflow-hidden rounded-md border px-1.5 py-0.5 leading-tight no-underline',
                        STATUS_STYLE[appointment.status] ?? STATUS_STYLE.SCHEDULED,
                      )}
                    >
                      {/* Two stacked lines need 2.3rem to render without being
                          cut off, which a half-hour booking does not have — it
                          gets the clock time and a surname on one line instead. */}
                      {height < 2.3 ? (
                        <span className="block truncate text-[0.8rem] font-semibold">
                          <span className="tabular-nums">{appointment.startTime}</span>{' '}
                          {appointment.patient.lastName}
                        </span>
                      ) : (
                        <>
                          <span className="block truncate text-[0.78rem] font-bold tabular-nums">
                            {appointment.startTime}–{endTime}
                          </span>
                          <span className="block truncate text-[0.85rem] font-semibold">
                            {name}
                          </span>
                          {height >= 3.4 && appointment.serviceName ? (
                            <span className="block truncate text-[0.78rem] opacity-80">
                              {appointment.serviceName}
                            </span>
                          ) : null}
                        </>
                      )}
                    </Link>
                  );
                })}

                {showNowLine && index === todayIndex ? (
                  <div
                    aria-hidden
                    style={{ top: `${nowRem}rem` }}
                    className="pointer-events-none absolute inset-x-0 border-t-2 border-danger"
                  >
                    <span className="absolute -top-[3px] left-0 h-1.5 w-1.5 rounded-full bg-danger" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
