import { BellRing, CalendarDays, Package, TriangleAlert, Users } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { AppointmentRow } from '@/components/appointments/AppointmentRow';
import { PatientFormDialog } from '@/components/patients/PatientFormDialog';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/guard';
import { endOfWeek, startOfWeek, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import {
  getAppointmentsBetween,
  getLowStockItems,
  getPatientOptions,
  getServiceOptions,
} from '@/lib/queries';
import { getRecalls } from '@/lib/recalls';

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

  const t = await getTranslations('dashboard');
  const ts = await getTranslations('stock');
  const format = await getFormatter();

  const day = today();
  const dayKey = toDateKey(day);

  const [todayAppointments, weekCount, patientCount, lowStock, patients, services, recalls] =
    await Promise.all([
      getAppointmentsBetween(day, day),
      prisma.appointment.count({
        where: { date: { gte: startOfWeek(day), lte: endOfWeek(day) } },
      }),
      prisma.patient.count(),
      getLowStockItems(),
      getPatientOptions(),
      getServiceOptions(),
      canSeeRecalls ? getRecalls() : Promise.resolve([]),
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
              defaultDate={dayKey}
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
    </>
  );
}
