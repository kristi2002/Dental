import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { DayView } from '@/components/appointments/DayView';
import { ListView } from '@/components/appointments/ListView';
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
  startOfMonth,
  startOfWeek,
  toDateKey,
  today,
} from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import {
  getAppointmentsBetween,
  getDaySchedule,
  getOperatoryOptions,
  getPatientOptions,
  getProviderOptions,
  getServiceOptions,
} from '@/lib/queries';
import { findFreeGaps } from '@/lib/scheduling';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type CalendarView = 'day' | 'week' | 'list';
const VIEWS: CalendarView[] = ['day', 'week', 'list'];

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; date?: string; staff?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('appointment.view');
  const canEdit = user.permissions.includes('appointment.edit');
  const canSeeWaitlist = user.permissions.includes('waitlist.view');

  const t = await getTranslations('appointments');
  const format = await getFormatter();

  const { view: rawView, date: rawDate, staff: rawStaff } = await searchParams;
  const view: CalendarView = VIEWS.includes(rawView as CalendarView)
    ? (rawView as CalendarView)
    : 'day';
  const anchor = fromDateKey(rawDate);

  // The provider filter is only meaningful once the practice has more than one
  // dentist; an unknown id is dropped rather than shown as an empty calendar.
  const providers = await getProviderOptions();
  const staffFilter = providers.some((person) => person.id === rawStaff) ? rawStaff! : '';

  const range =
    view === 'day'
      ? { from: anchor, to: anchor }
      : view === 'week'
        ? { from: startOfWeek(anchor), to: endOfWeek(anchor) }
        : { from: startOfMonth(anchor), to: endOfMonth(anchor) };

  const [appointments, patients, services, operatories, waitlist, freeGaps, schedule] =
    await Promise.all([
      getAppointmentsBetween(range.from, range.to, staffFilter),
      getPatientOptions(),
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
    ]);

  const step = (direction: -1 | 1) =>
    view === 'day'
      ? addDays(anchor, direction)
      : view === 'week'
        ? addDays(anchor, direction * 7)
        : addMonths(anchor, direction);

  // Every calendar link keeps the provider filter — stepping to tomorrow while
  // looking at one dentist's list should not silently show everyone's.
  const hrefFor = (date: Date, nextView: CalendarView = view, nextStaff = staffFilter) =>
    `/appointments?view=${nextView}&date=${toDateKey(date)}${nextStaff ? `&staff=${nextStaff}` : ''}`;

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
      <PageHeader
        title={t('title')}
        actions={
          canEdit ? (
            <AppointmentFormDialog
              patients={patients}
              services={services}
              staff={providers}
              operatories={operatories}
              defaultDate={toDateKey(view === 'day' ? anchor : today())}
              defaultStaffUserId={staffFilter}
              canCreatePatient={user.permissions.includes('patient.edit')}
            />
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={hrefFor(step(-1))} className="btn btn-secondary" aria-label={t('prev')}>
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <Link href={hrefFor(today())} className="btn btn-secondary">
            {t('today')}
          </Link>
          <Link href={hrefFor(step(1))} className="btn btn-secondary" aria-label={t('next')}>
            <ChevronRight size={20} aria-hidden />
          </Link>
          <div className="ml-2">
            <p className="text-[1.15rem] font-bold text-ink">{label}</p>
            {view === 'day' ? (
              <p className="text-[0.92rem] text-ink-soft tabular-nums">
                {schedule.closed
                  ? (schedule.closureReason ?? t('closedDay'))
                  : describeRanges(schedule.ranges)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* The list that goes on the wall. Only offered for a single day —
              a week on one sheet is not a thing anybody ticks off. */}
          {view === 'day' ? (
            <Link
              href={`/day-sheet?date=${toDateKey(anchor)}${staffFilter ? `&staff=${staffFilter}` : ''}`}
              className="btn btn-secondary btn-sm"
            >
              <Printer size={18} aria-hidden />
              {t('daySheet')}
            </Link>
          ) : null}

          <div
            role="group"
            aria-label={t('title')}
            className="flex gap-1 rounded-lg border border-line-strong p-1"
          >
          {VIEWS.map((option) => (
            <Link
              key={option}
              href={hrefFor(anchor, option)}
              aria-current={option === view ? 'true' : undefined}
              className={cn(
                'min-h-10 rounded-md px-3.5 py-1.5 font-bold no-underline transition-colors',
                option === view
                  ? 'bg-brand-dark text-white'
                  : 'text-ink-soft hover:bg-paper hover:text-ink',
              )}
            >
              {t(option === 'day' ? 'viewDay' : option === 'week' ? 'viewWeek' : 'viewList')}
            </Link>
            ))}
          </div>
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

      <Card>
        {view === 'day' ? (
          <DayView
            appointments={appointments}
            patients={patients}
            services={services}
            schedule={schedule}
          />
        ) : view === 'week' ? (
          <WeekView anchor={anchor} appointments={appointments} />
        ) : (
          <ListView appointments={appointments} patients={patients} services={services} />
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
            patients={patients}
            services={services}
            canEdit={user.permissions.includes('waitlist.edit')}
          />
        </div>
      ) : null}
    </>
  );
}
