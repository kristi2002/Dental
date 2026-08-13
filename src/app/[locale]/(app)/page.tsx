import {
  BellRing,
  CalendarClock,
  CalendarDays,
  ListChecks,
  NotebookPen,
  Package,
  ShieldAlert,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { AppointmentRow } from '@/components/appointments/AppointmentRow';
import { FreeTimeCard } from '@/components/appointments/FreeTimeCard';
import { PatientFormDialog } from '@/components/patients/PatientFormDialog';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Link } from '@/i18n/navigation';
import { AlertSeverity, AppointmentStatus } from '@/generated/prisma/enums';
import { requireUser } from '@/lib/auth/guard';
import { endOfWeek, startOfWeek, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import {
  countOpenPastAppointments,
  getAppointmentsBetween,
  getLowStockItems,
  getOpenPastAppointments,
  getOpenWaitlist,
  getOperatoryOptions,
  getProviderOptions,
  getServiceOptions,
  getUnrecordedToday,
  getUnremindedTomorrow as getUnreminded,
} from '@/lib/queries';
import { getRecalls } from '@/lib/recalls';
import { findFreeGaps, nextSlotTime, type FreeGap } from '@/lib/scheduling';
import { VisitFormDialog } from '@/components/patients/VisitFormDialog';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const canAddPatient = user.permissions.includes('patient.edit');
  const canAddAppointment = user.permissions.includes('appointment.edit');
  const canEditMedical = user.permissions.includes('patient.medical.edit');
  const canSeeRecalls = user.permissions.includes('recall.view');
  const canSeeMedical = user.permissions.includes('patient.medical.view');
  const canSeeWaitlist = user.permissions.includes('waitlist.view');

  const t = await getTranslations('dashboard');
  const ta = await getTranslations('appointments');
  const ts = await getTranslations('stock');
  const talerts = await getTranslations('alerts');
  const tw = await getTranslations('waitlist');
  const format = await getFormatter();

  const day = today();
  const dayKey = toDateKey(day);

  const [
    todayAppointments,
    weekCount,
    patientCount,
    lowStock,
    services,
    staff,
    operatories,
    recalls,
    freeGaps,
    toRemind,
    openPast,
    openPastTotal,
    todaysAlerts,
    expiredCount,
    unrecorded,
    waiting,
  ] = await Promise.all([
      getAppointmentsBetween(day, day),
      prisma.appointment.count({
        where: { date: { gte: startOfWeek(day), lte: endOfWeek(day) } },
      }),
      prisma.patient.count(),
      getLowStockItems(),
      getServiceOptions(),
      getProviderOptions(),
      getOperatoryOptions(),
      canSeeRecalls ? getRecalls() : Promise.resolve([]),
      // Only what is still ahead: free time that has already passed is not an
      // opportunity, it is a regret.
      findFreeGaps({ date: day, after: nextSlotTime() }),
      canAddAppointment ? getUnreminded() : Promise.resolve([]),
      // Yesterday's loose ends. Nothing else in the app ever looks backwards, so
      // an appointment nobody closed simply ages out of sight — taking the
      // no-show score and the completion rate with it.
      canAddAppointment ? getOpenPastAppointments() : Promise.resolve([]),
      canAddAppointment ? countOpenPastAppointments() : Promise.resolve(0),
      // What must not be missed today. The printed day sheet has carried these
      // since it existed; the screen everybody actually reads did not, so an
      // anticoagulant was visible only to whoever walked past the printer.
      canSeeMedical
        ? prisma.patientAlert.findMany({
            where: {
              severity: { in: [AlertSeverity.CRITICAL, AlertSeverity.IMPORTANT] },
              patient: {
                appointments: {
                  some: {
                    date: day,
                    status: {
                      in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED],
                    },
                  },
                },
              },
            },
            include: { patient: { select: { id: true, firstName: true, lastName: true } } },
          })
        : Promise.resolve([]),
      // A second, independent way for the cupboard to be wrong: an expired box
      // counts as stock in every other check on this page.
      prisma.stockItem.count({
        where: { archivedAt: null, batches: { some: { expiryDate: { lt: day } } } },
      }),
      // Treated but not written up. Asked here because the end of the day is
      // exactly when nobody goes looking for it.
      canEditMedical ? getUnrecordedToday() : Promise.resolve([]),
      // Who would take a slot if one came free — which is what a cancellation
      // just did, and what nothing outside the calendar page ever said.
      canSeeWaitlist ? getOpenWaitlist() : Promise.resolve([]),
    ]);

  // Who the rest of today can actually hold. The matching is the useful part: a
  // 60-minute root canal is not a candidate for a 20-minute hole, and offering
  // it as one wastes a phone call.
  const fitsToday = waiting
    .map((entry) => ({
      entry,
      gap: freeGaps.find((candidate) => candidate.minutes >= entry.durationMin),
    }))
    .filter((row): row is { entry: (typeof waiting)[number]; gap: FreeGap } => row.gap !== undefined)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={format.dateTime(day, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('statToday')} value={todayAppointments.length} Icon={CalendarDays} href="/appointments" />
        <StatCard label={t('statWeek')} value={weekCount} Icon={CalendarDays} href="/appointments?view=week" />
        {canSeeRecalls ? (
          <StatCard
            label={t('statRecalls')}
            value={recalls.length}
            Icon={BellRing}
            href="/recalls"
            tone={recalls.length > 0 ? 'warn' : 'neutral'}
          />
        ) : (
          <StatCard label={t('statPatients')} value={patientCount} Icon={Users} href="/patients" />
        )}
        <StatCard
          label={t('statLowStock')}
          value={lowStock.length}
          Icon={Package}
          href="/stock?filter=low"
          tone={lowStock.length > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {canAddPatient || canAddAppointment ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {canAddPatient ? (
            <PatientFormDialog
              canEditMedical={canEditMedical}
              triggerClassName="btn btn-primary btn-lg w-full"
            />
          ) : null}
          {canAddAppointment ? (
            <AppointmentFormDialog
              services={services}
              staff={staff}
              operatories={operatories}
              defaultDate={dayKey}
              canCreatePatient={canAddPatient}
              triggerClassName="btn btn-primary btn-lg w-full"
            />
          ) : null}
        </div>
      ) : null}

      {/* Before anything else on the page, because it is the only thing here
          that changes what happens in the chair. One line per person, loudest
          severity first, and gone entirely on a day with nothing to flag. */}
      {todaysAlerts.length > 0 ? (
        <Card className="mb-6 border-danger">
          <CardHeader
            title={ta('todaysAlertsTitle')}
            subtitle={ta('todaysAlertsSubtitle')}
            icon={<ShieldAlert size={22} aria-hidden className="text-danger" />}
          />
          <ul className="divide-y divide-line">
            {[...todaysAlerts]
              .sort((a, b) =>
                a.severity === b.severity ? 0 : a.severity === 'CRITICAL' ? -1 : 1,
              )
              .map((alert) => (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3"
                >
                  <Link
                    href={`/patients/${alert.patient.id}`}
                    className="text-[1.05rem] font-bold text-ink"
                  >
                    {alert.patient.lastName} {alert.patient.firstName}
                  </Link>
                  <Badge tone={alert.severity === 'CRITICAL' ? 'alert' : 'warn'}>
                    <TriangleAlert size={15} aria-hidden />
                    {talerts(`kind_${alert.kind}`)}
                    {alert.substance ? `: ${alert.substance}` : ''}
                  </Badge>
                  {alert.notes ? (
                    <span className="text-[0.93rem] text-ink-soft">{alert.notes}</span>
                  ) : null}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* The main column reads as "today, then the days that were never
            closed off" — both are the appointment list, so they belong in the
            same column rather than pushing today's schedule down the page. */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={t('todaySchedule')}
              icon={<CalendarDays size={22} aria-hidden />}
              action={
                <Link href="/appointments" className="btn btn-secondary btn-sm">
                  {t('openCalendar')}
                </Link>
              }
            />
            {todayAppointments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={40} aria-hidden />}
                title={t('noAppointmentsToday')}
              />
            ) : (
              <div className="space-y-3 p-3">
                {todayAppointments.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    services={services}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* The only panel on this page about work that has already gone wrong
              rather than work still to do. It disappears the moment the last
              one is answered, so a practice that closes its days never sees
              it. */}
          {openPast.length > 0 ? (
            <Card className="border-warn">
              <CardHeader
                title={ta('openPastTitle')}
                subtitle={ta('openPastSubtitle', { count: openPastTotal })}
                icon={<TriangleAlert size={22} aria-hidden className="text-warn" />}
              />
              <div className="space-y-3 p-3">
                {openPast.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    services={services}
                    showDate
                  />
                ))}
                {openPastTotal > openPast.length ? (
                  <p className="px-1 pb-1 text-[0.92rem] text-ink-soft">
                    {ta('openPastMore', { shown: openPast.length, total: openPastTotal })}
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>

        {/* The side column reads top-down as "what could still be filled, and
            what could still run out" — the two things worth acting on today. */}
        <div className="space-y-6">
          <FreeTimeCard
            gaps={freeGaps}
            date={dayKey}
            services={services}
            canBook={canAddAppointment}
            canCreatePatient={canAddPatient}
          />

          {/* Somebody who would take a slot, and a slot going spare. The
              calendar page has always matched the two; the dashboard is where
              anybody looks after a cancellation, and it said nothing. */}
          {canSeeWaitlist && fitsToday.length > 0 ? (
            <Card>
              <CardHeader
                title={tw('title')}
                subtitle={tw('fitsTodayCount', { count: fitsToday.length })}
                icon={<ListChecks size={22} aria-hidden />}
                action={
                  <Link href="/appointments" className="btn btn-secondary btn-sm">
                    {t('openCalendar')}
                  </Link>
                }
              />
              <ul className="divide-y divide-line">
                {fitsToday.map(({ entry, gap }) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/patients/${entry.patient.id}`}
                        className="text-[1.03rem] font-bold text-ink"
                      >
                        {entry.patient.lastName} {entry.patient.firstName}
                      </Link>
                      <span className="block text-[0.9rem] text-ink-soft">
                        {entry.serviceName ? `${entry.serviceName} · ` : ''}
                        {tw('fitsAt', { time: gap.startTime })}
                      </span>
                    </span>
                    {entry.urgent ? <Badge tone="danger">{tw('urgent')}</Badge> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Treated, but the note is still in somebody's head. */}
          {canEditMedical && unrecorded.length > 0 ? (
            <Card className="border-warn">
              <CardHeader
                title={ta('unrecordedTitle')}
                subtitle={ta('unrecordedSubtitle', { count: unrecorded.length })}
                icon={<NotebookPen size={22} aria-hidden />}
              />
              <ul className="divide-y divide-line">
                {unrecorded.map((appointment) => (
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/patients/${appointment.patient.id}?tab=history`}
                        className="text-[1.03rem] font-bold text-ink"
                      >
                        {appointment.patient.lastName} {appointment.patient.firstName}
                      </Link>
                      <span className="block text-[0.9rem] text-ink-soft tabular-nums">
                        {appointment.startTime}
                        {appointment.serviceName ? ` · ${appointment.serviceName}` : ''}
                      </span>
                    </span>
                    <VisitFormDialog
                      patientId={appointment.patient.id}
                      services={services}
                      staff={staff}
                      currentUserId={user.id}
                      today={dayKey}
                      triggerClassName="btn btn-secondary btn-sm"
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Reminding used to happen only when somebody thought to work down
              the calendar. The contact log makes "who has not been told"
              answerable, so the dashboard asks instead of waiting to be asked. */}
          {canAddAppointment && toRemind.length > 0 ? (
            <Card>
              <CardHeader
                title={t('toRemindTitle')}
                subtitle={t('toRemindSubtitle', { count: toRemind.length })}
                icon={<BellRing size={22} aria-hidden />}
              />
              <div className="space-y-3 p-3">
                {toRemind.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    services={services}
                    showDate
                  />
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={t('stockAlerts')}
              icon={<TriangleAlert size={22} aria-hidden />}
              action={
                <Link href="/stock" className="btn btn-secondary btn-sm">
                  {t('openStock')}
                </Link>
              }
            />
            {/* Expiry is the other way for the cupboard to be wrong, and the
                one the low-stock check cannot see: an expired box counts as
                stock everywhere else. */}
            {expiredCount > 0 ? (
              <p className="flex items-center gap-2 border-b border-line px-5 py-3 font-bold text-danger">
                <CalendarClock size={18} aria-hidden />
                {ts('expiredAlert', { count: expiredCount })}
              </p>
            ) : null}

            {lowStock.length === 0 ? (
              expiredCount > 0 ? null : (
                <EmptyState icon={<Package size={40} aria-hidden />} title={t('stockAllGood')} />
              )
            ) : (
              <ul>
                {lowStock.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[1.05rem] font-bold text-ink">
                        {item.name}
                      </span>
                      <span className="block text-[0.9rem] text-ink-soft">
                        {ts('inStock', { qty: item.quantity, unit: item.unit })} ·{' '}
                        {ts('minShort', { min: item.minLimit })}
                      </span>
                    </span>
                    <Badge tone={item.quantity === 0 ? 'danger' : 'warn'}>
                      {item.quantity === 0 ? ts('out') : ts('low')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
