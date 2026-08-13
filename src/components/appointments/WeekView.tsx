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
import { blockStyle } from './status-styles';
import type { AppointmentView } from './types';

/**
 * The ruler is cut into ten-minute rows, and everything on the grid is measured
 * against them.
 *
 * Ten is the granularity the diary is actually kept at: a check is ten minutes,
 * a filling three of them, and a hygienist's list is a column of tens. Drawing
 * the line at every ten rather than every hour means a slot is a place on the
 * grid you can point at, not a fraction of an hour somebody estimates by eye —
 * and a ten-minute booking gets a block tall enough to print a name in.
 *
 * The cost is height: an open day is a long column, so the grid scrolls inside
 * its own frame with the day header pinned, rather than making the whole page
 * three thousand pixels tall.
 */
const SLOT_MIN = 10;
const SLOT_REM = 2.5;

/** Below this a block has no room for its own text, so short bookings are drawn taller. */
const MIN_BLOCK_REM = 1.4;

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
 * The week as a time grid: seven day columns across, ten-minute rows down.
 *
 * The columns are the same grid the day view draws, seven abreast — so "when is
 * this week free" is answered by looking at the white space rather than by
 * opening seven days one after another. Closed rows stay on the grid, shaded,
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

  const startMinute = startHour * 60;
  const slots = Array.from(
    { length: ((endHour - startHour) * 60) / SLOT_MIN },
    (_, i) => startMinute + i * SLOT_MIN,
  );
  const gridRem = slots.length * SLOT_REM;

  /** Where a moment sits on the ruler, in rem from the top of the grid. */
  const offsetRem = (minute: number) => ((minute - startMinute) / SLOT_MIN) * SLOT_REM;

  // The "you are here" line, drawn only on today and only while the clock is
  // inside the hours on screen.
  const nowMinutes = clinicMinutesNow();
  const todayIndex = days.findIndex((day) => isSameDay(day, now));
  const nowRem = offsetRem(nowMinutes);
  const showNowLine = todayIndex >= 0 && nowRem >= 0 && nowRem <= gridRem;

  const columns =
    'grid grid-cols-[4.25rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[5rem_repeat(7,minmax(0,1fr))]';

  return (
    /* Its own scroll frame, in both directions: seven columns are wider than a
       phone and a full day of tens is taller than any screen. Bounded rather
       than free-running so the day header has something to pin against. */
    <div className="max-h-[calc(100vh-14rem)] min-h-[30rem] overflow-auto overscroll-contain">
      <div className="min-w-[54rem]">
        <div className={cn(columns, 'sticky top-0 z-20 border-b border-line-strong bg-surface')}>
          <div className="sticky left-0 z-10 border-r border-line bg-surface" />
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
          {/* The ruler. Every ten is written out, but only the hour is inked:
              the minutes in between are there to be measured against, not
              read one after another. */}
          <div className="sticky left-0 z-10 border-r border-line bg-surface">
            {slots.map((minute) => {
              const onTheHour = minute % 60 === 0;

              return (
                <div
                  key={minute}
                  style={{ height: `${SLOT_REM}rem` }}
                  className={cn(
                    'border-b pr-2 text-right tabular-nums last:border-b-0',
                    (minute + SLOT_MIN) % 60 === 0 ? 'border-line-strong' : 'border-line',
                    onTheHour
                      ? 'text-[0.95rem] font-bold text-ink'
                      : 'text-[0.82rem] font-semibold text-ink-faint',
                  )}
                >
                  {minutesToTime(minute)}
                </div>
              );
            })}
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
                {slots.map((minute) => {
                  const open = schedule.ranges.some(
                    (range) => range.start < minute + SLOT_MIN && range.end > minute,
                  );

                  return (
                    <div
                      key={minute}
                      style={{ height: `${SLOT_REM}rem` }}
                      className={cn(
                        'border-b last:border-b-0',
                        (minute + SLOT_MIN) % 60 === 0 ? 'border-line-strong' : 'border-line',
                        // Shut slots are shaded rather than dropped: the front
                        // desk can still see that four o'clock exists.
                        !open && 'bg-paper',
                      )}
                    />
                  );
                })}

                {layOutDay(byDay[index]).map((block) => {
                  const { appointment } = block;
                  const top = Math.max(0, offsetRem(block.start));
                  const height = Math.min(
                    gridRem - top,
                    Math.max(MIN_BLOCK_REM, offsetRem(block.end) - offsetRem(block.start)),
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
                        'absolute overflow-hidden rounded-md border border-l-4 border-line px-1.5 py-0.5 leading-tight no-underline transition-shadow hover:shadow-card',
                        blockStyle(appointment.status),
                      )}
                    >
                      {/* Two stacked lines need 2.3rem to render without being
                          cut off — which every booking of ten minutes or more
                          now has. Below that the name leads on one line: the
                          block's position on the ruler already says when. */}
                      {height < 2.3 ? (
                        <span className="block truncate text-[0.8rem] font-semibold">
                          <span className="tabular-nums">{appointment.startTime}</span>{' '}
                          {appointment.patient.lastName}
                        </span>
                      ) : (
                        <>
                          <span className="block truncate text-[0.88rem] font-bold">{name}</span>
                          <span className="block truncate text-[0.78rem] font-semibold tabular-nums opacity-85">
                            {appointment.startTime} – {endTime}
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
