'use client';

import { TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from 'react';
import { useDateNames } from '@/components/shared/DateNamesProvider';
import { Link, useRouter } from '@/i18n/navigation';
import { moveAppointment } from '@/lib/actions/appointments';
import { gridHoursFor, type DaySchedule } from '@/lib/clinic-hours';
import { minutesToTime, timeToMinutes, toDateKey, weekDays } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { AppointmentDetailsDialog } from './AppointmentDetailsDialog';
import {
  AppointmentFormDialog,
  type OperatoryOption,
  type ServiceOption,
  type StaffOption,
} from './AppointmentFormDialog';
import { blockStyle } from './status-styles';
import type { AppointmentView } from './types';

/**
 * The ruler is cut into half hours, and everything on the grid is measured
 * against them.
 *
 * It used to be cut into tens — the granularity the diary is *kept* at, on the
 * reasoning that a slot should be a place on the grid you can point at. What it
 * actually bought was fifteen rem of ruler per hour: an ordinary open day ran to
 * some three thousand pixels, five of every six lines said nothing anybody
 * needed to read, and the week never fitted on a screen. The half hour is the
 * unit a week is *read* at. A ten-minute check still lands where it belongs —
 * the block is positioned by the minute, not by the row — it simply no longer
 * costs three lines of ruler to draw the ones either side of it.
 */
const SLOT_MIN = 30;
const SLOT_REM = 2.5;

/** Below this a block has no room for its own text, so short bookings are drawn taller. */
const MIN_BLOCK_REM = 1.4;

/** How far the pointer has to travel before a press stops being a click. */
const DRAG_THRESHOLD_PX = 5;

type Block = {
  appointment: AppointmentView;
  /** Minutes since midnight. */
  start: number;
  end: number;
  /** Which of `columns` side-by-side lanes this block sits in. */
  column: number;
  columns: number;
};

/** A drop the grid is waiting on, or being asked to insist about. */
type Move = { id: string; date: string; startTime: string };

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
 * The week as a time grid: seven day columns across, half-hour rows down.
 *
 * The columns are the same grid the day view draws, seven abreast — so "when is
 * this week free" is answered by looking at the white space rather than by
 * opening seven days one after another. Closed rows stay on the grid, shaded,
 * because a clinic needs to see that Saturday afternoon exists and is shut.
 *
 * It is a client component because the two things a diary is for — moving a
 * booking and making one — are gestures, not journeys to another page: a block
 * is dragged to its new slot, and empty time is double-clicked to fill it.
 */
export function WeekView({
  anchor,
  appointments,
  schedules,
  dayHrefs,
  todayKey,
  nowMinutes,
  services = [],
  staff = [],
  operatories = [],
  defaultStaffUserId,
  canEdit = false,
  canDelete = false,
  canCreatePatient = false,
}: {
  /** Any date inside the week to render. */
  anchor: Date;
  appointments: AppointmentView[];
  /** One schedule per day, Monday-first — the same order as `weekDays(anchor)`. */
  schedules: DaySchedule[];
  /**
   * `YYYY-MM-DD` → link to that single day, with the page's own filters kept.
   *
   * A map rather than the function this used to take: functions do not cross
   * into a client component, and seven days is the whole domain anyway.
   */
  dayHrefs: Record<string, string>;
  /**
   * The clinic's today, and how far into it we are. Both are read from the
   * clinic's own timezone (see `dates.ts`), which the browser does not know —
   * so they are settled on the server and the grid is told, rather than each
   * side computing its own answer and disagreeing at hydration.
   */
  todayKey: string;
  nowMinutes: number;
  /** Everything the dialog a double-click summons needs. */
  services?: ServiceOption[];
  staff?: StaffOption[];
  operatories?: OperatoryOption[];
  defaultStaffUserId?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  canCreatePatient?: boolean;
}) {
  const t = useTranslations('appointments');
  const tc = useTranslations('common');
  const format = useFormatter();
  // Weekday names come from the server, not from the browser's locale data —
  // Chrome has none for Albanian. `format` still handles the numeric day below,
  // which reads the same in every language this ships. See `lib/date-names.ts`.
  const dates = useDateNames();
  const router = useRouter();
  const [saving, startTransition] = useTransition();

  const days = weekDays(anchor);

  // Where a dropped block is drawn while the server catches up. Cleared the
  // moment fresh appointments arrive — a new array from the server render is
  // exactly the news that the optimistic copy is no longer needed.
  const [moved, setMoved] = useState<Record<string, { date: string; startTime: string }>>({});
  const [lastAppointments, setLastAppointments] = useState(appointments);
  if (lastAppointments !== appointments) {
    setLastAppointments(appointments);
    if (Object.keys(moved).length > 0) setMoved({});
  }

  // The drag in flight: which block, and where it currently reads as landing.
  const [drag, setDrag] = useState<{
    id: string;
    dayIndex: number;
    start: number;
    duration: number;
  } | null>(null);

  // A refused drop, with the drop kept so "do it anyway" has something to repeat.
  const [refused, setRefused] = useState<{ message: string; retry: Move | null } | null>(null);

  // The slot a double-click asked to book. `nonce` remounts the dialog, so the
  // same empty half hour can be double-clicked twice running.
  const [booking, setBooking] = useState<{
    date: string;
    startTime: string;
    nonce: number;
  } | null>(null);

  // The block whose details are open, and the one being edited — by id rather
  // than by value, so a dialog left open across a `router.refresh()` reads the
  // row the server just sent rather than the copy it was handed on click. A
  // booking deleted from under it resolves to nothing and the dialog closes.
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const placed = appointments.map((appointment) => {
    const override = moved[appointment.id];
    return override ? { ...appointment, ...override } : appointment;
  });

  const opened = placed.find((appointment) => appointment.id === openId) ?? null;
  const editing = placed.find((appointment) => appointment.id === editingId) ?? null;

  const byDay = days.map((day) => {
    const key = toDateKey(day);
    return placed.filter((appointment) => appointment.date === key);
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
  const endMinute = startMinute + slots.length * SLOT_MIN;

  /** Where a moment sits on the ruler, in rem from the top of the grid. */
  const offsetRem = (minute: number) => ((minute - startMinute) / SLOT_MIN) * SLOT_REM;

  // The "you are here" line, drawn only on today and only while the clock is
  // inside the hours on screen.
  const todayIndex = days.findIndex((day) => toDateKey(day) === todayKey);
  const nowRem = offsetRem(nowMinutes);
  const showNowLine = todayIndex >= 0 && nowRem >= 0 && nowRem <= gridRem;

  // The seven day columns, measured live rather than remembered: the grid
  // scrolls in both directions underneath a drag, so a rectangle taken when the
  // block was picked up would be pointing at the wrong half hour by the time it
  // was put down.
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const session = useRef<
    | ({
        pointerId: number;
        /** Where inside the block it was picked up, in px from the block's top. */
        grabY: number;
        originX: number;
        originY: number;
        duration: number;
        dragging: boolean;
        landing: { dayIndex: number; start: number } | null;
      } & Move)
    | null
  >(null);
  /** Swallows exactly one click: the one the browser fires after a drag. */
  const swallowClick = useRef(false);

  /** Which day column the pointer is over, held to the ends of the week. */
  const columnAt = (clientX: number): number | null => {
    const seen: { index: number; rect: DOMRect }[] = [];
    columnRefs.current.forEach((node, index) => {
      if (node) seen.push({ index, rect: node.getBoundingClientRect() });
    });
    if (seen.length === 0) return null;

    const over = seen.find(({ rect }) => clientX >= rect.left && clientX < rect.right);
    if (over) return over.index;
    // Dragged off the side: keep hold of the nearest column rather than
    // dropping the booking into nowhere.
    return clientX < seen[0].rect.left ? seen[0].index : seen[seen.length - 1].index;
  };

  /** The half hour the pointer is holding the block against. */
  const minuteAt = (dayIndex: number, clientY: number, grabY: number): number | null => {
    const column = columnRefs.current[dayIndex];
    if (!column) return null;

    const rect = column.getBoundingClientRect();
    const slotPx = rect.height / slots.length;
    if (slotPx <= 0) return null;

    const raw = startMinute + ((clientY - grabY - rect.top) / slotPx) * SLOT_MIN;
    const snapped = Math.round(raw / SLOT_MIN) * SLOT_MIN;
    // On the grid, and starting on it: the last row is the latest start.
    return Math.min(endMinute - SLOT_MIN, Math.max(startMinute, snapped));
  };

  const commit = (move: Move, force = false) => {
    setRefused(null);
    setMoved((prev) => ({ ...prev, [move.id]: { date: move.date, startTime: move.startTime } }));

    startTransition(async () => {
      const result = await moveAppointment({ ...move, force });

      if (result.status === 'error') {
        // Put it back where it was and say why — with the drop kept when the
        // answer was "that clashes", which is the one refusal a practice
        // overrules on purpose.
        setMoved((prev) => {
          const next = { ...prev };
          delete next[move.id];
          return next;
        });
        setRefused({ message: result.message, retry: result.code === 'overlap' ? move : null });
        return;
      }

      router.refresh();
    });
  };

  const onPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    appointment: AppointmentView,
  ) => {
    swallowClick.current = false;
    // Touch keeps its scroll. A finger dragged down a calendar means "show me
    // later", and stealing that gesture to move a booking would make the week
    // unusable on a phone — where the edit dialog is the way to move one.
    if (!canEdit || event.pointerType === 'touch' || event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    session.current = {
      pointerId: event.pointerId,
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      duration: Math.max(5, appointment.durationMin),
      grabY: event.clientY - rect.top,
      originX: event.clientX,
      originY: event.clientY,
      dragging: false,
      landing: null,
    };

    // Capture is what lets a block be carried across into another day: without
    // it the moves stop arriving the moment the cursor leaves the element.
    // Guarded because a pointer can be gone by the time we ask for it, and a
    // throw here would take the whole grid down over a lost mouse button.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* No capture: the drag simply stays inside the block it started in. */
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const live = session.current;
    if (!live || live.pointerId !== event.pointerId) return;

    if (!live.dragging) {
      // Under the threshold this is still a click on its way to happening.
      if (
        Math.abs(event.clientX - live.originX) < DRAG_THRESHOLD_PX &&
        Math.abs(event.clientY - live.originY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      live.dragging = true;
    }

    const dayIndex = columnAt(event.clientX);
    if (dayIndex === null) return;
    const start = minuteAt(dayIndex, event.clientY, live.grabY);
    if (start === null) return;

    // Re-rendering the whole grid for every pixel would be seven columns of
    // wasted work; it only changes when the block changes half hour.
    if (live.landing?.dayIndex === dayIndex && live.landing.start === start) return;
    live.landing = { dayIndex, start };
    setDrag({ id: live.id, dayIndex, start, duration: live.duration });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>, drop: boolean) => {
    const live = session.current;
    if (!live || live.pointerId !== event.pointerId) return;

    session.current = null;
    setDrag(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* Already released — the browser does this itself on pointercancel. */
    }

    // A press that never travelled is a click, and a click opens the booking.
    if (!live.dragging) return;
    swallowClick.current = true;
    if (!drop || !live.landing) return;

    const date = toDateKey(days[live.landing.dayIndex]);
    const startTime = minutesToTime(live.landing.start);
    if (date === live.date && startTime === live.startTime) return;

    commit({ id: live.id, date, startTime });
  };

  const columns =
    'grid grid-cols-[4.25rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[5rem_repeat(7,minmax(0,1fr))]';

  return (
    <>
      {refused ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-line bg-warn-soft px-4 py-2.5 font-semibold text-warn"
        >
          <TriangleAlert size={18} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">{refused.message}</span>
          {refused.retry ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => refused.retry && commit(refused.retry, true)}
            >
              {t('bookAnyway')}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefused(null)}>
            {tc('close')}
          </button>
        </div>
      ) : null}

      {/* Its own scroll frame, in both directions: seven columns are wider than
          a phone and a full day is taller than most screens. Bounded rather
          than free-running so the day header has something to pin against. */}
      <div
        aria-busy={saving || undefined}
        className="max-h-[calc(100vh-13rem)] min-h-[30rem] overflow-auto overscroll-contain"
      >
        <div className="min-w-[54rem]">
          <div className={cn(columns, 'sticky top-0 z-20 border-b border-line-strong bg-surface')}>
            <div className="sticky left-0 z-10 border-r border-line bg-surface" />
            {days.map((day, index) => {
              const key = toDateKey(day);
              const isToday = key === todayKey;

              return (
                <Link
                  key={key}
                  href={dayHrefs[key] ?? '#'}
                  aria-current={isToday ? 'date' : undefined}
                  className={cn(
                    'border-r border-line px-2 py-2 text-center no-underline transition-colors last:border-r-0 hover:bg-brand-soft',
                    isToday && 'bg-brand-dark text-white hover:bg-brand-dark',
                  )}
                >
                  <span
                    className={cn(
                      'block text-caption font-bold tracking-wide uppercase',
                      isToday ? 'text-white' : 'text-ink-faint',
                    )}
                  >
                    {dates.date(day, 'weekdayShort')}
                  </span>
                  <span className="block text-lead font-bold tabular-nums">
                    {format.dateTime(day, { day: 'numeric' })}
                  </span>
                  {schedules[index].closed ? (
                    <span
                      className={cn(
                        'block text-micro font-semibold',
                        isToday ? 'text-white' : 'text-ink-faint',
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
            {/* The ruler. Both halves of the hour are written out, but only the
                hour is inked: the half past is there to be measured against,
                not read one after another. */}
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
                        ? 'text-body font-bold text-ink'
                        : 'text-caption font-semibold text-ink-faint',
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
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  ref={(node) => {
                    columnRefs.current[index] = node;
                  }}
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
                        // Free time books itself. The grid drew the week and
                        // then refused to be used: the only way to take
                        // Thursday at half nine was to press the button at the
                        // top of the page and type back the day and the time
                        // the eye was already resting on.
                        onDoubleClick={
                          canEdit
                            ? () =>
                                setBooking((prev) => ({
                                  date: key,
                                  startTime: minutesToTime(minute),
                                  nonce: (prev?.nonce ?? 0) + 1,
                                }))
                            : undefined
                        }
                        style={{ height: `${SLOT_REM}rem` }}
                        className={cn(
                          'border-b last:border-b-0',
                          (minute + SLOT_MIN) % 60 === 0 ? 'border-line-strong' : 'border-line',
                          // Shut slots are shaded rather than dropped: the front
                          // desk can still see that four o'clock exists.
                          !open && 'bg-paper',
                          canEdit && 'cursor-cell',
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
                    const lifted = drag?.id === appointment.id;

                    return (
                      /* A button, not a link to the day.
                         Clicking a booking used to answer with the whole of
                         Thursday — which is the wrong answer to a question
                         about one patient, and costs you the seven days you
                         were reading to get it. It opens the booking instead.
                         The day is still one click away in the column header. */
                      <button
                        key={appointment.id}
                        type="button"
                        onPointerDown={(event) => onPointerDown(event, appointment)}
                        onPointerMove={onPointerMove}
                        onPointerUp={(event) => endDrag(event, true)}
                        onPointerCancel={(event) => endDrag(event, false)}
                        // The browser fires a click after every drag. Left
                        // alone, dropping a block would open the block.
                        onClick={() => {
                          if (swallowClick.current) {
                            swallowClick.current = false;
                            return;
                          }
                          setOpenId(appointment.id);
                        }}
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
                          'absolute overflow-hidden rounded-md border border-l-4 border-line px-1.5 py-0.5 text-left leading-tight transition-shadow select-none hover:shadow-card',
                          blockStyle(appointment.status),
                          canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                          // The block stays where it was while it is being
                          // carried, faded, so the ghost is the only thing
                          // claiming to be the answer.
                          lifted && 'opacity-40',
                        )}
                      >
                        {/* Two stacked lines need 2.3rem to render without
                            being cut off — which every booking of half an hour
                            or more now has. Below that the name leads on one
                            line: the block's position on the ruler already
                            says when. */}
                        {height < 2.3 ? (
                          <span className="block truncate text-caption font-semibold">
                            <span className="tabular-nums">{appointment.startTime}</span>{' '}
                            {appointment.patient.lastName}
                          </span>
                        ) : (
                          <>
                            <span className="block truncate text-meta font-bold">{name}</span>
                            <span className="block truncate text-caption font-semibold tabular-nums">
                              {appointment.startTime} – {endTime}
                            </span>
                            {height >= 3.4 && appointment.serviceName ? (
                              <span className="block truncate text-caption">
                                {appointment.serviceName}
                              </span>
                            ) : null}
                          </>
                        )}
                      </button>
                    );
                  })}

                  {/* Where it would land, drawn on the grid rather than under
                      the cursor: the question a drag asks is "which slot", and
                      a rectangle floating between two of them does not answer
                      it. */}
                  {drag && drag.dayIndex === index ? (
                    <div
                      aria-hidden
                      style={{
                        top: `${offsetRem(drag.start)}rem`,
                        height: `${Math.min(
                          gridRem - offsetRem(drag.start),
                          Math.max(MIN_BLOCK_REM, (drag.duration / SLOT_MIN) * SLOT_REM),
                        )}rem`,
                      }}
                      className="pointer-events-none absolute inset-x-[0.15rem] z-10 overflow-hidden rounded-md border-2 border-dashed border-brand-dark bg-brand-soft/90 px-1.5 py-0.5 text-caption font-bold tabular-nums text-brand-deep shadow-card"
                    >
                      {minutesToTime(drag.start)} – {minutesToTime(drag.start + drag.duration)}
                    </div>
                  ) : null}

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

      {/* Said once, quietly, under the grid: neither gesture announces itself,
          and a calendar nobody knows can be dragged is a calendar nobody drags.
          Not on a phone, where the finger is scrolling the grid and neither
          gesture is offered — an instruction you cannot follow is worse than
          none. */}
      {canEdit ? (
        <p
          className="hidden border-t border-line px-4 py-2 text-meta text-ink-faint sm:block"
          data-print-hide
        >
          {t('gridHint')}
        </p>
      ) : null}

      {booking ? (
        <AppointmentFormDialog
          key={`${booking.date}-${booking.startTime}-${booking.nonce}`}
          openOnMount
          onClosed={() => setBooking(null)}
          services={services}
          staff={staff}
          operatories={operatories}
          defaultDate={booking.date}
          defaultStartTime={booking.startTime}
          defaultStaffUserId={defaultStaffUserId}
          canCreatePatient={canCreatePatient}
        />
      ) : null}

      {opened ? (
        <AppointmentDetailsDialog
          key={opened.id}
          appointment={opened}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setOpenId(null)}
          // Handed over rather than stacked: the edit form is a second modal,
          // and two of them in the top layer is a stack the reader has to
          // unwind twice to get back to the week.
          onEdit={() => {
            setOpenId(null);
            setEditingId(opened.id);
          }}
        />
      ) : null}

      {editing ? (
        <AppointmentFormDialog
          key={`edit-${editing.id}`}
          openOnMount
          onClosed={() => setEditingId(null)}
          services={services}
          staff={staff}
          operatories={operatories}
          appointment={{
            id: editing.id,
            patientId: editing.patient.id,
            date: editing.date,
            startTime: editing.startTime,
            durationMin: editing.durationMin,
            status: editing.status,
            serviceName: editing.serviceName,
            serviceId: editing.serviceId,
            notes: editing.notes,
            staffUserId: editing.staffUserId,
            operatoryId: editing.operatoryId,
          }}
        />
      ) : null}
    </>
  );
}
