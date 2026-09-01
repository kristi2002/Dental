import { ChevronLeft, ChevronRight, MapPin, Printer, Users } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { DayView } from '@/components/appointments/DayView';
import { ListView } from '@/components/appointments/ListView';
import { MonthView } from '@/components/appointments/MonthView';
import {
  CALENDAR_STATUSES,
  parseStatusFilter,
  StatusFilter,
  type CalendarStatus,
} from '@/components/appointments/StatusFilter';
import { WaitlistPanel, type OfferGap } from '@/components/appointments/WaitlistPanel';
import { WeekView } from '@/components/appointments/WeekView';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { describeRanges } from '@/lib/clinic-hours';
import {
  addDays,
  addMonths,
  clinicMinutesNow,
  endOfMonth,
  endOfWeek,
  fromDateKey,
  isSameDay,
  isSameMonth,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toDateKey,
  today,
  weekDays,
} from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import {
  getAppointmentsBetween,
  getDaySchedule,
  getOperatoryOptions,
  getProviderOptions,
  getServiceOptions,
} from '@/lib/queries';
import { findNextGaps, nextSlotTime, SLOT_STEP_MINUTES } from '@/lib/scheduling';
import { cn } from '@/lib/utils';
import { daysWaiting } from '@/lib/waitlist';

export const dynamic = 'force-dynamic';

/**
 * Day, week and month are the same diary at three zooms; the list is the same
 * month written out in full, for the days when what is wanted is a readable
 * agenda rather than a grid.
 */
type CalendarView = 'day' | 'week' | 'month' | 'list';
const VIEWS: CalendarView[] = ['day', 'week', 'month', 'list'];

/**
 * What the calendar opens on.
 *
 * The week, not the day. A practice does not plan one day at a time: the
 * question at the front desk is almost always "when can you come in", and a
 * single column cannot answer it — it took two taps on the view switcher before
 * the screen showed anything worth looking at.
 */
const DEFAULT_VIEW: CalendarView = 'week';

/**
 * How far the waiting list looks for somewhere to put people.
 *
 * A fortnight, because the list is not a question about one day: somebody who
 * has waited three months is not helped by "no gap this day", and the answer the
 * front desk actually needs — the first time the practice can take them — is
 * usually next week rather than this afternoon. Far enough to be useful, near
 * enough that it is still worth a phone call.
 */
const WAITLIST_DAYS = 14;

/** Enough stretches to seat everybody waiting; the horizon is the real bound. */
const WAITLIST_GAP_LIMIT = 200;

const VIEW_LABEL: Record<CalendarView, string> = {
  day: 'viewDay',
  week: 'viewWeek',
  month: 'viewMonth',
  list: 'viewList',
};

/**
 * The chevrons and `today`, which share the date's box but are not segments —
 * they move the calendar rather than staying pressed. Sized to match `.segment`
 * so the three toolbar groups come out the same height.
 */
const NUDGE =
  'flex min-h-11 shrink-0 items-center justify-center rounded-md text-ink-soft no-underline transition-colors hover:bg-paper hover:text-ink';

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    view?: string;
    date?: string;
    staff?: string;
    status?: string;
    operatory?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('appointment.view');
  const canEdit = user.permissions.includes('appointment.edit');
  const canDelete = user.permissions.includes('appointment.delete');
  const canSeeWaitlist = user.permissions.includes('waitlist.view');

  const t = await getTranslations('appointments');
  const format = await getFormatter();

  const {
    view: rawView,
    date: rawDate,
    staff: rawStaff,
    status: rawStatus,
    operatory: rawOperatory,
  } = await searchParams;
  const view: CalendarView = VIEWS.includes(rawView as CalendarView)
    ? (rawView as CalendarView)
    : DEFAULT_VIEW;
  const anchor = fromDateKey(rawDate);
  const statusFilter = parseStatusFilter(rawStatus);
  const allStatuses = statusFilter.length === CALENDAR_STATUSES.length;

  // The provider filter is only meaningful once the practice has more than one
  // dentist; an unknown id is dropped rather than shown as an empty calendar.
  const providers = await getProviderOptions();
  const staffFilter = providers.some((person) => person.id === rawStaff) ? rawStaff! : '';

  // And the same for the chair.
  //
  // `Operatory` has existed, `Appointment.operatoryId` has been written, the
  // booking dialog has offered it once there was more than one, and `collides()`
  // has treated a shared chair as a clash — so the app could answer "how full is
  // Thursday for Dr B" and not "what is chair 2 doing", which is the question a
  // two-chair practice asks when deciding whether it can take a walk-in.
  const operatories = await getOperatoryOptions();
  const operatoryFilter = operatories.some((room) => room.id === rawOperatory)
    ? rawOperatory!
    : '';

  // The month grid draws whole weeks, so it reaches into the days either side
  // of the month: 42 cells, always six rows.
  const grid = monthGrid(anchor);

  // Where the waiting list starts looking. The anchored day, except when the
  // calendar is parked in the past — last Tuesday's free time is nobody's
  // opening, and offering it would put a date already gone into a message.
  const waitlistFrom = anchor.getTime() < today().getTime() ? today() : anchor;

  const range =
    view === 'day'
      ? { from: anchor, to: anchor }
      : view === 'week'
        ? { from: startOfWeek(anchor), to: endOfWeek(anchor) }
        : view === 'month'
          ? { from: grid[0], to: grid[grid.length - 1] }
          : { from: startOfMonth(anchor), to: endOfMonth(anchor) };

  const [
    allAppointments,
    services,
    waitlist,
    waitlistGaps,
    schedule,
    weekSchedules,
    monthSchedules,
  ] = await Promise.all([
      getAppointmentsBetween(range.from, range.to, staffFilter, operatoryFilter),
      getServiceOptions(),
      canSeeWaitlist
        ? prisma.waitlistEntry.findMany({
            where: { resolvedAt: null },
            // Urgent first, then oldest request — the fairest order to work down.
            orderBy: [{ urgent: 'desc' }, { createdAt: 'asc' }],
            include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
          })
        : Promise.resolve([]),
      // A fortnight of free time rather than one day's, so a person the anchored
      // day cannot hold is told when the practice can rather than just "no".
      // On today that means the time still ahead, as the dashboard has always
      // taken it: nine o'clock is not an opening to offer anybody at four, and
      // `Offer the slot` would have written that hour into the message.
      canSeeWaitlist
        ? findNextGaps({
            from: waitlistFrom,
            minutes: SLOT_STEP_MINUTES,
            days: WAITLIST_DAYS,
            limit: WAITLIST_GAP_LIMIT,
            staffUserId: staffFilter,
            // Deliberately not narrowed by the chair. The chair filter is a
            // view — it decides what the grid shows — and the waiting list is
            // about whether the practice can take somebody at all, which is
            // answered by any free chair. Narrowing it would turn "we have a
            // Tuesday" into "chair 2 has a Tuesday", which is not the offer
            // anybody makes on the telephone.
            after: isSameDay(waitlistFrom, today()) ? nextSlotTime() : undefined,
          })
        : [],
      getDaySchedule(anchor, staffFilter),
      // Seven schedules for seven columns. `getClinicWeek` and `getClosures` are
      // request-cached, so this is still two queries however many days ask.
      view === 'week'
        ? Promise.all(weekDays(anchor).map((day) => getDaySchedule(day, staffFilter)))
        : Promise.resolve([]),
      // Forty-two schedules for forty-two cells, on the same two cached reads.
      view === 'month'
        ? Promise.all(grid.map((day) => getDaySchedule(day, staffFilter)))
        : Promise.resolve([]),
    ]);

  // The status filter is applied here rather than in SQL: the same rows feed
  // every view, and five statuses over one week is not a query worth splitting.
  const appointments = allStatuses
    ? allAppointments
    : allAppointments.filter((appointment) =>
        statusFilter.includes(appointment.status as CalendarStatus),
      );

  // Each free stretch carries the name of its day, written once per day rather
  // than once per stretch: a fortnight holds fourteen days and many more gaps
  // than that. The label is read twice — on the row, and inside the WhatsApp
  // message — and this is the one place holding the locale's formatter.
  const dayNames = new Map<string, string>();
  const offerGaps: OfferGap[] = [];
  for (const gap of waitlistGaps) {
    let dayLabel = dayNames.get(gap.date);
    if (!dayLabel) {
      dayLabel = format.dateTime(fromDateKey(gap.date), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      dayNames.set(gap.date, dayLabel);
    }
    offerGaps.push({ ...gap, dayLabel });
  }

  // Shut days are shaded on the month grid rather than left blank, so a bank
  // holiday reads as "closed" instead of "nobody booked anything".
  const closedDays = new Set(
    grid.filter((_, index) => monthSchedules[index]?.closed).map(toDateKey),
  );

  const step = (direction: -1 | 1) =>
    view === 'day'
      ? addDays(anchor, direction)
      : view === 'week'
        ? addDays(anchor, direction * 7)
        : addMonths(anchor, direction);

  // Every calendar link keeps the provider and status filters — stepping to
  // tomorrow while looking at one dentist's list should not silently show
  // everyone's, and paging the month should not quietly re-tick a status.
  const hrefFor = (
    date: Date,
    nextView: CalendarView = view,
    nextStaff = staffFilter,
    nextStatuses: CalendarStatus[] = statusFilter,
    nextOperatory = operatoryFilter,
  ) => {
    const query = new URLSearchParams({ view: nextView, date: toDateKey(date) });
    if (nextStaff) query.set('staff', nextStaff);
    if (nextOperatory) query.set('operatory', nextOperatory);
    // "Everything" is the default, so it is left out of the URL entirely.
    if (nextStatuses.length < CALENDAR_STATUSES.length) {
      query.set('status', nextStatuses.join(','));
    }
    return `/appointments?${query.toString()}`;
  };

  // Whether the dates on screen include today. The date reads "10 gush – 16
  // gush" either way, and nothing else on the toolbar said whether that was
  // this week or one paged to by accident — so `today` marks itself as current
  // instead of sitting there looking equally pressable.
  const now = today();
  const showingNow =
    view === 'day'
      ? isSameDay(anchor, now)
      : view === 'week'
        ? now >= startOfWeek(anchor) && now <= endOfWeek(anchor)
        : isSameMonth(anchor, now);

  /**
   * What the toolbar says it is showing.
   *
   * Two things are left out rather than written, both of them noise the reader
   * already knows: the current year, and — for a week that does not cross into
   * the next month — the month said twice. "10 gush – 16 gush 2026" becomes
   * "10 – 16 gush", which is how anybody would say it out loud, and which gives
   * the toolbar back the ninety pixels the fourth control needs to sit on the
   * same line. Page into another year and the year comes back.
   */
  const showYear =
    range.from.getUTCFullYear() !== now.getUTCFullYear() ||
    range.to.getUTCFullYear() !== now.getUTCFullYear();
  const year = showYear ? { year: 'numeric' as const } : {};

  const label =
    view === 'day'
      ? format.dateTime(anchor, { weekday: 'long', day: 'numeric', month: 'long', ...year })
      : view === 'week'
        ? isSameMonth(range.from, range.to)
          ? `${format.dateTime(range.from, { day: 'numeric' })} – ${format.dateTime(range.to, {
              day: 'numeric',
              month: 'long',
              ...year,
            })}`
          : `${format.dateTime(range.from, { day: 'numeric', month: 'short' })} – ${format.dateTime(
              range.to,
              { day: 'numeric', month: 'short', ...year },
            )}`
        : format.dateTime(anchor, { month: 'long', year: 'numeric' });

  return (
    // The diary is one of the three screens that is a grid rather than
    // prose, so it takes the whole monitor. See `.app-measure`.
    <div data-measure="wide">
      {/* Booking sits beside the title, where every other screen keeps its
          primary action. It used to share a row with the date and the view
          switcher, which asked one 620px column to hold 900px of controls. */}
      <PageHeader
        title={t('title')}
        trail={[{ label: t('title') }]}
        actions={
          <>
            {canEdit ? (
              <AppointmentFormDialog
                services={services}
                staff={providers}
                operatories={operatories}
                defaultDate={toDateKey(view === 'day' ? anchor : now)}
                defaultStaffUserId={staffFilter}
                canCreatePatient={user.permissions.includes('patient.edit')}
                triggerClassName="btn btn-primary w-full whitespace-nowrap sm:w-auto"
              />
            ) : null}

            {/* The list that goes on the wall. Only offered for a single day —
                a week on one sheet is not a thing anybody ticks off. */}
            {view === 'day' ? (
              <Link
                href={`/day-sheet?date=${toDateKey(anchor)}${staffFilter ? `&staff=${staffFilter}` : ''}`}
                className="btn btn-secondary w-full whitespace-nowrap sm:w-auto"
              >
                <Printer size={18} aria-hidden />
                {t('daySheet')}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="min-w-0">
        {/* The diary's three controls on one line: when, who, and at what zoom.
            They used to take two rows with the middle of the first one empty —
            the dentists sat on a row of their own directly under a toolbar that
            had room to spare, pushing the grid a further 52px down the page.

            `ml-auto` keeps the zoom flush with the calendar's right edge however
            the row wraps, rather than letting a fixed grid push it under the
            rail; everything before it wraps left, in reading order. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
          {/* `min-w-0`, so on a phone the date wraps to a second line inside the
              group rather than carrying the chevrons off the side of the screen.
              With `flex-wrap` on the row, nothing else is squeezed by it: a
              group that does not fit moves down instead of narrowing. */}
          <div className="segmented min-w-0 max-w-full flex-nowrap">
            <Link
              href={hrefFor(step(-1))}
              className={cn(NUDGE, 'w-10')}
              aria-label={t('prev')}
            >
              <ChevronLeft size={22} aria-hidden />
            </Link>

            {/* Date and opening hours as one centred block, so the chevrons
                flank the pair rather than the date alone. The floor width
                stops a shorter month name from dragging the next arrow
                leftwards under the reading eye — but only once there is width
                to spend on it; on a phone the date may take a second line
                rather than push the arrows out past the calendar. */}
            <div className="min-w-0 px-1 text-center sm:min-w-[9rem] xl:min-w-[9.5rem]">
              <p className="text-lead font-semibold leading-tight text-ink">{label}</p>
              {view === 'day' ? (
                <p className="text-meta leading-tight text-ink-soft tabular-nums">
                  {schedule.closed
                    ? (schedule.closureReason ?? t('closedDay'))
                    : describeRanges(schedule.ranges)}
                </p>
              ) : null}
            </div>

            <Link href={hrefFor(step(1))} className={cn(NUDGE, 'w-10')} aria-label={t('next')}>
              <ChevronRight size={22} aria-hidden />
            </Link>

            <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-line" />

            {/* Tinted rather than filled when the dates on screen already include
                today — enough to answer "is this the current week?", not so much
                that it reads as a chosen segment, which it is not: press it from
                the current week and nothing moves. */}
            <Link
              href={hrefFor(now)}
              aria-current={showingNow ? 'date' : undefined}
              className={cn(
                NUDGE,
                'px-3 text-body font-semibold',
                showingNow && 'bg-brand-soft text-brand-deep hover:bg-brand-soft hover:text-brand-deep',
              )}
            >
              {t('today')}
            </Link>
          </div>

          {/* Names, not a dropdown: with two or three dentists the whole filter
              is visible at a glance, and each is one tap away.

              An icon rather than the word "Dentisti", which is what stood here
              first. Three bare names beside a date and four view names gave no
              clue they were people, but the word cost seventy pixels off a row
              that now has four controls on it — and this row is the one place
              in the app where a person icon is unambiguous. The word is still
              the nav's accessible name. */}
          {providers.length > 1 ? (
            <nav aria-label={t('provider')} className="segmented min-w-0">
              <span aria-hidden className="px-1.5 text-ink-faint">
                <Users size={19} />
              </span>
              <Link
                  href={hrefFor(anchor, view, '')}
                  aria-current={staffFilter ? undefined : 'true'}
                  className="segment"
                >
                  {t('allProviders')}
                </Link>
              {providers.map((person) => (
                <Link
                  key={person.id}
                  href={hrefFor(anchor, view, person.id)}
                  aria-current={staffFilter === person.id ? 'true' : undefined}
                  className="segment"
                >
                  {person.name}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* The chair, on the same row and by the same rule as the dentist
              beside it: offered only once there is more than one, because a
              single-chair practice being asked which chair is a control that
              can only ever have one answer. */}
          {operatories.length > 1 ? (
            <nav aria-label={t('operatory')} className="segmented min-w-0">
              <span aria-hidden className="px-1.5 text-ink-faint">
                <MapPin size={19} />
              </span>
              <Link
                href={hrefFor(anchor, view, staffFilter, statusFilter, '')}
                aria-current={operatoryFilter ? undefined : 'true'}
                className="segment"
              >
                {t('allOperatories')}
              </Link>
              {operatories.map((room) => (
                <Link
                  key={room.id}
                  href={hrefFor(anchor, view, staffFilter, statusFilter, room.id)}
                  aria-current={operatoryFilter === room.id ? 'true' : undefined}
                  className="segment"
                >
                  {room.name}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* Beside the dentist filter, because the two are the same kind of
              question — who, then in what state. Folded shut because four of
              its five boxes are ticked almost all the time; it says so on the
              trigger when they are not. */}
          <StatusFilter
            active={statusFilter}
            hrefFor={(statuses) => hrefFor(anchor, view, staffFilter, statuses)}
          />

          {/* `flex-nowrap`: four zooms are one control, and on a phone they
              share the width rather than folding the last one onto a line of
              its own. */}
          <div
            role="group"
            aria-label={t('title')}
            className="segmented ml-auto w-full flex-nowrap sm:w-auto"
          >
            {VIEWS.map((option) => (
              <Link
                key={option}
                href={hrefFor(anchor, option)}
                aria-current={option === view ? 'true' : undefined}
                className="segment flex-1 sm:flex-none"
              >
                {t(VIEW_LABEL[option])}
              </Link>
            ))}
          </div>
        </div>

        {/* Clipped, because every grid inside draws hairlines all the way to
            its own edge and would otherwise square off the card's corners. */}
        <Card className="overflow-hidden">
          {view === 'day' ? (
            <DayView
              appointments={appointments}
              services={services}
              schedule={schedule}
              date={toDateKey(anchor)}
              staff={providers}
              operatories={operatories}
              defaultStaffUserId={staffFilter}
              canEdit={canEdit}
              canCreatePatient={user.permissions.includes('patient.edit')}
            />
          ) : view === 'week' ? (
            <WeekView
              anchor={anchor}
              appointments={appointments}
              schedules={weekSchedules}
              // A map rather than a function: the week grid is a client
              // component now — it has to be, to be dragged on — and seven
              // days is the whole domain the function ever had.
              dayHrefs={Object.fromEntries(
                weekDays(anchor).map((day) => [toDateKey(day), hrefFor(day, 'day')]),
              )}
              todayKey={toDateKey(now)}
              nowMinutes={clinicMinutesNow()}
              services={services}
              staff={providers}
              operatories={operatories}
              defaultStaffUserId={staffFilter}
              canEdit={canEdit}
              canDelete={canDelete}
              canCreatePatient={user.permissions.includes('patient.edit')}
            />
          ) : view === 'month' ? (
            <MonthView
              anchor={anchor}
              appointments={appointments}
              closedDays={closedDays}
              dayHrefs={Object.fromEntries(
                grid.map((day) => [toDateKey(day), hrefFor(day, 'day')]),
              )}
              services={services}
              staff={providers}
              operatories={operatories}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ) : (
            <ListView appointments={appointments} services={services} />
          )}
        </Card>

        {canSeeWaitlist ? (
          <div className="mt-6">
            <WaitlistPanel
              entries={waitlist.map((entry) => ({
                id: entry.id,
                patientId: entry.patientId,
                patientName: `${entry.patient.lastName} ${entry.patient.firstName}`,
                phone: entry.patient.phone,
                serviceName: entry.serviceName ?? '',
                serviceId: entry.serviceId ?? '',
                durationMin: entry.durationMin,
                note: entry.note ?? '',
                urgent: entry.urgent,
                waitingDays: daysWaiting(entry.createdAt),
              }))}
              gaps={offerGaps}
              anchorDate={toDateKey(anchor)}
              windowDays={WAITLIST_DAYS}
              dayLabel={format.dateTime(anchor, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              services={services}
              canEdit={user.permissions.includes('waitlist.edit')}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
