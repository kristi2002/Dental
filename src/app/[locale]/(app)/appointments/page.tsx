import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { DayView } from '@/components/appointments/DayView';
import { ListView } from '@/components/appointments/ListView';
import { MiniCalendar } from '@/components/appointments/MiniCalendar';
import { MonthView } from '@/components/appointments/MonthView';
import {
  CALENDAR_STATUSES,
  parseStatusFilter,
  StatusFilter,
  type CalendarStatus,
} from '@/components/appointments/StatusFilter';
import { WaitlistPanel } from '@/components/appointments/WaitlistPanel';
import { WeekView } from '@/components/appointments/WeekView';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { describeRanges } from '@/lib/clinic-hours';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  fromDateKey,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toDateKey,
  today,
  weekDays,
} from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import {
  getAppointmentCountsByDay,
  getAppointmentsBetween,
  getDaySchedule,
  getOperatoryOptions,
  getProviderOptions,
  getServiceOptions,
} from '@/lib/queries';
import { findFreeGaps } from '@/lib/scheduling';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Day, week and month are the same diary at three zooms; the list is the same
 * month written out in full, for the days when what is wanted is a readable
 * agenda rather than a grid.
 */
type CalendarView = 'day' | 'week' | 'month' | 'list';
const VIEWS: CalendarView[] = ['day', 'week', 'month', 'list'];

const VIEW_LABEL: Record<CalendarView, string> = {
  day: 'viewDay',
  week: 'viewWeek',
  month: 'viewMonth',
  list: 'viewList',
};

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; date?: string; staff?: string; status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('appointment.view');
  const canEdit = user.permissions.includes('appointment.edit');
  const canSeeWaitlist = user.permissions.includes('waitlist.view');

  const t = await getTranslations('appointments');
  const format = await getFormatter();

  const {
    view: rawView,
    date: rawDate,
    staff: rawStaff,
    status: rawStatus,
  } = await searchParams;
  const view: CalendarView = VIEWS.includes(rawView as CalendarView)
    ? (rawView as CalendarView)
    : 'day';
  const anchor = fromDateKey(rawDate);
  const statusFilter = parseStatusFilter(rawStatus);
  const allStatuses = statusFilter.length === CALENDAR_STATUSES.length;

  // The provider filter is only meaningful once the practice has more than one
  // dentist; an unknown id is dropped rather than shown as an empty calendar.
  const providers = await getProviderOptions();
  const staffFilter = providers.some((person) => person.id === rawStaff) ? rawStaff! : '';

  // The month rail always draws whole weeks, so it needs the days either side
  // of the month as well. The month grid draws the same 42 cells.
  const grid = monthGrid(anchor);

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
    operatories,
    waitlist,
    freeGaps,
    schedule,
    weekSchedules,
    monthSchedules,
    dayCounts,
  ] = await Promise.all([
      getAppointmentsBetween(range.from, range.to, staffFilter),
      getServiceOptions(),
      getOperatoryOptions(),
      canSeeWaitlist
        ? prisma.waitlistEntry.findMany({
            where: { resolvedAt: null },
            // Urgent first, then oldest request — the fairest order to work down.
            orderBy: [{ urgent: 'desc' }, { createdAt: 'asc' }],
            include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
          })
        : Promise.resolve([]),
      // Gaps are computed for the anchored day whichever view is open, so the
      // waitlist always has a concrete day to offer people.
      canSeeWaitlist ? findFreeGaps({ date: anchor, staffUserId: staffFilter }) : [],
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
      getAppointmentCountsByDay(
        grid[0],
        grid[grid.length - 1],
        staffFilter,
        allStatuses ? undefined : statusFilter,
      ),
    ]);

  // The status filter is applied here rather than in SQL: the same rows feed
  // every view, and five statuses over one week is not a query worth splitting.
  const appointments = allStatuses
    ? allAppointments
    : allAppointments.filter((appointment) =>
        statusFilter.includes(appointment.status as CalendarStatus),
      );

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
  ) => {
    const query = new URLSearchParams({ view: nextView, date: toDateKey(date) });
    if (nextStaff) query.set('staff', nextStaff);
    // "Everything" is the default, so it is left out of the URL entirely.
    if (nextStatuses.length < CALENDAR_STATUSES.length) {
      query.set('status', nextStatuses.join(','));
    }
    return `/appointments?${query.toString()}`;
  };

  const label =
    view === 'day'
      ? format.dateTime(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${format.dateTime(range.from, { day: 'numeric', month: 'short' })} – ${format.dateTime(
            range.to,
            { day: 'numeric', month: 'short', year: 'numeric' },
          )}`
        : format.dateTime(anchor, { month: 'long', year: 'numeric' });

  return (
    <>
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
                defaultDate={toDateKey(view === 'day' ? anchor : today())}
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

      {/* The month rail sits beside the schedule from `xl` up and under it
          below, where the day being read matters more than paging around it.
          The rail costs 284px with its gap, and it used to start taking them
          at `lg` — which left a 1024px window a 384px calendar, some 55px per
          day across a week. It sits on the RIGHT: the left of the window is
          the navigation rail, and two columns of chrome down the same edge
          would have pushed the week grid 500px off the side of the screen. The
          split is honest as well as tidy — left takes you to another screen,
          right changes what this one is showing. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="min-w-0">
          {/* The diary's own two controls: move through time on the left,
              change the zoom on the right. One row where the window can hold
              both, otherwise the switcher drops to a second row — `ml-auto`
              keeps it flush with the calendar's right edge either way, rather
              than letting a fixed three-column grid push it under the rail. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1">
              <Link
                href={hrefFor(step(-1))}
                className="btn btn-ghost min-h-11 shrink-0 px-2"
                aria-label={t('prev')}
              >
                <ChevronLeft size={22} aria-hidden />
              </Link>

              {/* Date and opening hours as one centred block, so the chevrons
                  flank the pair rather than the date alone. The floor width
                  stops a shorter month name from dragging the next arrow
                  leftwards under the reading eye — but only from `xl`, where
                  the column is narrow enough to need it and wide enough to
                  spend it; below that the date may take a second line rather
                  than push the arrows out past the calendar. */}
              <div className="min-w-0 px-1 text-center xl:min-w-[15rem]">
                <p className="text-[1.15rem] font-semibold leading-tight text-ink">{label}</p>
                {view === 'day' ? (
                  <p className="text-[0.9rem] leading-tight text-ink-soft tabular-nums">
                    {schedule.closed
                      ? (schedule.closureReason ?? t('closedDay'))
                      : describeRanges(schedule.ranges)}
                  </p>
                ) : null}
              </div>

              <Link
                href={hrefFor(step(1))}
                className="btn btn-ghost min-h-11 shrink-0 px-2"
                aria-label={t('next')}
              >
                <ChevronRight size={22} aria-hidden />
              </Link>
              <Link href={hrefFor(today())} className="btn btn-secondary btn-sm ml-1 shrink-0">
                {t('today')}
              </Link>
            </div>

            <div
              role="group"
              aria-label={t('title')}
              className="ml-auto flex w-full gap-1 rounded-lg border border-line-strong p-1 sm:w-auto"
            >
              {VIEWS.map((option) => (
                <Link
                  key={option}
                  href={hrefFor(anchor, option)}
                  aria-current={option === view ? 'true' : undefined}
                  className={cn(
                    'min-h-10 flex-1 rounded-md px-3.5 py-1.5 text-center font-bold no-underline transition-colors sm:flex-none',
                    option === view
                      ? 'bg-brand-dark text-white'
                      : 'text-ink-soft hover:bg-paper hover:text-ink',
                  )}
                >
                  {t(VIEW_LABEL[option])}
                </Link>
              ))}
            </div>
          </div>

          {/* One row of names, not a dropdown: with two or three dentists the whole
              filter is visible at a glance, and each is one tap away. */}
          {providers.length > 1 ? (
            <nav aria-label={t('provider')} className="mb-4 flex flex-wrap gap-2">
              <Link
                href={hrefFor(anchor, view, '')}
                aria-current={staffFilter ? undefined : 'true'}
                className={cn('btn btn-sm', staffFilter ? 'btn-secondary' : 'btn-primary')}
              >
                {t('allProviders')}
              </Link>
              {providers.map((person) => (
                <Link
                  key={person.id}
                  href={hrefFor(anchor, view, person.id)}
                  aria-current={staffFilter === person.id ? 'true' : undefined}
                  className={cn(
                    'btn btn-sm',
                    staffFilter === person.id ? 'btn-primary' : 'btn-secondary',
                  )}
                >
                  {person.name}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* Clipped, because every grid inside draws hairlines all the way to
              its own edge and would otherwise square off the card's corners. */}
          <Card className="overflow-hidden">
            {view === 'day' ? (
              <DayView
                appointments={appointments}
                services={services}
                schedule={schedule}
              />
            ) : view === 'week' ? (
              <WeekView
                anchor={anchor}
                appointments={appointments}
                schedules={weekSchedules}
                dayHref={(dateKey) => hrefFor(fromDateKey(dateKey), 'day')}
              />
            ) : view === 'month' ? (
              <MonthView
                anchor={anchor}
                appointments={appointments}
                closedDays={closedDays}
                dayHref={(dateKey) => hrefFor(fromDateKey(dateKey), 'day')}
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
                  durationMin: entry.durationMin,
                  note: entry.note ?? '',
                  urgent: entry.urgent,
                }))}
                freeGaps={freeGaps}
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

        {/* Stacked under the schedule below `xl`, the two panels sit side by
            side rather than each stretching the full width — a month drawn
            across 900px is mostly the whitespace between its days. */}
        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MiniCalendar
            anchor={anchor}
            counts={dayCounts}
            picks={view === 'week' ? 'week' : 'day'}
            hrefFor={(date) => hrefFor(date)}
          />
          <StatusFilter
            active={statusFilter}
            hrefFor={(statuses) => hrefFor(anchor, view, staffFilter, statuses)}
          />
        </aside>
      </div>
    </>
  );
}
