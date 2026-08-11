import { BellRing, CalendarDays, Package, TriangleAlert, Users } from 'lucide-react';
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
import { LabCaseStatus } from '@/generated/prisma/enums';
import { requireUser } from '@/lib/auth/guard';
import { endOfWeek, startOfWeek, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import {
  getAppointmentsBetween,
  getLowStockItems,
  getOperatoryOptions,
  getPatientOptions,
  getProviderOptions,
  getServiceOptions,
  getUnremindedTomorrow as getUnreminded,
} from '@/lib/queries';
import { LabCaseList } from '@/components/lab/LabCaseList';
import { getRecalls } from '@/lib/recalls';
import { findFreeGaps, nextSlotTime } from '@/lib/scheduling';

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
  const canSeePlans = user.permissions.includes('plan.view');

  const t = await getTranslations('dashboard');
  const ts = await getTranslations('stock');
  const tlab = await getTranslations('lab');
  const format = await getFormatter();

  const day = today();
  const dayKey = toDateKey(day);

  const [
    todayAppointments,
    weekCount,
    patientCount,
    lowStock,
    patients,
    services,
    staff,
    operatories,
    recalls,
    freeGaps,
    labCases,
    toRemind,
  ] = await Promise.all([
      getAppointmentsBetween(day, day),
      prisma.appointment.count({
        where: { date: { gte: startOfWeek(day), lte: endOfWeek(day) } },
      }),
      prisma.patient.count(),
      getLowStockItems(),
      getPatientOptions(),
      getServiceOptions(),
      getProviderOptions(),
      getOperatoryOptions(),
      canSeeRecalls ? getRecalls() : Promise.resolve([]),
      // Only what is still ahead: free time that has already passed is not an
      // opportunity, it is a regret.
      findFreeGaps({ date: day, after: nextSlotTime() }),
      // Cases still at the lab, soonest promised first. The thing a whiteboard
      // was doing until now, and the reason a fitting gets booked too early.
      canSeePlans
        ? prisma.labCase.findMany({
            where: { status: LabCaseStatus.SENT },
            orderBy: [{ dueAt: 'asc' }, { sentAt: 'asc' }],
            take: 8,
            include: { patient: { select: { id: true, firstName: true, lastName: true } } },
          })
        : Promise.resolve([]),
      canAddAppointment ? getUnreminded() : Promise.resolve([]),
    ]);

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
              patients={patients}
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

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
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
            <div>
              {todayAppointments.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  patients={patients}
                  services={services}
                />
              ))}
            </div>
          )}
        </Card>

        {/* The side column reads top-down as "what could still be filled, and
            what could still run out" — the two things worth acting on today. */}
        <div className="space-y-6">
          <FreeTimeCard
            gaps={freeGaps}
            date={dayKey}
            patients={patients}
            services={services}
            canBook={canAddAppointment}
            canCreatePatient={canAddPatient}
          />

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
              <div>
                {toRemind.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    patients={patients}
                    services={services}
                    showDate
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {/* Cases still out. Sits above stock because a crown that has not come
              back blocks an appointment; a low box of gloves blocks nothing. */}
          {canSeePlans && labCases.length > 0 ? (
            <Card>
              <CardHeader title={tlab('waitingTitle')} subtitle={tlab('waitingSubtitle')} />
              <LabCaseList
                cases={labCases.map((labCase) => ({
                  id: labCase.id,
                  labName: labCase.labName,
                  kind: labCase.kind,
                  teeth: labCase.teeth ?? '',
                  status: labCase.status,
                  sentAt: toDateKey(labCase.sentAt),
                  dueAt: labCase.dueAt ? toDateKey(labCase.dueAt) : '',
                  receivedAt: '',
                  notes: '',
                  patientId: labCase.patient.id,
                  patientName: `${labCase.patient.lastName} ${labCase.patient.firstName}`,
                }))}
                labNames={[]}
                canEdit={user.permissions.includes('plan.edit')}
                canDelete={false}
              />
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
            {lowStock.length === 0 ? (
              <EmptyState icon={<Package size={40} aria-hidden />} title={t('stockAllGood')} />
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
