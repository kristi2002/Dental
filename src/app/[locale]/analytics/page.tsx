import { CalendarCheck, ChartColumn, Package, Stethoscope, TrendingUp, Users } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import {
  HorizontalBars,
  MonthlyBars,
  MonthlyLine,
  StatusDonut,
  type Point,
} from '@/components/analytics/Charts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { addMonths, lastMonths, startOfMonth, toMonthKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { parseServiceList } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const MONTHS_TRACKED = 6;

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'var(--color-brand)',
  COMPLETED: 'var(--color-ok)',
  CANCELLED: 'var(--color-line-strong)',
  NO_SHOW: 'var(--color-warn)',
};

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('analytics');
  const ta = await getTranslations('appointments');
  const format = await getFormatter();

  const months = lastMonths(MONTHS_TRACKED);
  const windowStart = months[0];
  const windowEnd = addMonths(startOfMonth(today()), 1);

  const [visits, patients, movements, appointments, totalPatients, totalVisits] = await Promise.all(
    [
      prisma.visitRecord.findMany({
        where: { visitDate: { gte: windowStart, lt: windowEnd } },
        select: { visitDate: true, services: true },
      }),
      prisma.patient.findMany({
        where: { createdAt: { gte: windowStart, lt: windowEnd } },
        select: { createdAt: true },
      }),
      prisma.stockMovement.findMany({
        where: { createdAt: { gte: windowStart, lt: windowEnd }, delta: { lt: 0 } },
        select: { createdAt: true, delta: true },
      }),
      prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.patient.count(),
      prisma.visitRecord.count(),
    ],
  );

  /** Bucket timestamps into the tracked months, keeping empty months visible. */
  function bucket(entries: Array<{ date: Date; amount: number }>): Point[] {
    const totals = new Map(months.map((month) => [toMonthKey(month), 0]));
    for (const entry of entries) {
      const key = toMonthKey(entry.date);
      if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + entry.amount);
    }
    return months.map((month) => ({
      label: format.dateTime(month, { month: 'short' }),
      value: totals.get(toMonthKey(month)) ?? 0,
    }));
  }

  const visitPoints = bucket(visits.map((v) => ({ date: v.visitDate, amount: 1 })));
  const patientPoints = bucket(patients.map((p) => ({ date: p.createdAt, amount: 1 })));
  const usagePoints = bucket(
    movements.map((m) => ({ date: m.createdAt, amount: Math.abs(m.delta) })),
  );

  const serviceCounts = new Map<string, number>();
  for (const visit of visits) {
    for (const service of parseServiceList(visit.services)) {
      serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
    }
  }
  const topServices: Point[] = [...serviceCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .reverse(); // Recharts stacks a vertical layout bottom-up.

  const statusPoints = appointments.map((row) => ({
    label: ta(`status_${row.status}`),
    value: row._count._all,
    color: STATUS_COLOR[row.status] ?? 'var(--color-brand)',
  }));

  const appointmentTotal = statusPoints.reduce((sum, row) => sum + row.value, 0);
  const completed = appointments.find((row) => row.status === 'COMPLETED')?._count._all ?? 0;
  const completionRate =
    appointmentTotal > 0 ? Math.round((completed / appointmentTotal) * 100) : 0;
  const avgVisitsPerMonth =
    Math.round((visits.length / MONTHS_TRACKED) * 10) / 10;

  const hasVisits = visits.length > 0;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('totalPatients')} value={totalPatients} Icon={Users} />
        <StatCard label={t('totalVisits')} value={totalVisits} Icon={Stethoscope} />
        <StatCard label={t('avgPerMonth')} value={avgVisitsPerMonth} Icon={TrendingUp} />
        <StatCard label={t('completionRate')} value={`${completionRate}%`} Icon={CalendarCheck} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('visitsOverTime')} icon={<ChartColumn size={22} aria-hidden />} />
          <CardBody>
            <MonthlyBars data={visitPoints} name={t('visits')} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('patientGrowth')} icon={<Users size={22} aria-hidden />} />
          <CardBody>
            <MonthlyLine data={patientPoints} name={t('patients')} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('topServices')} icon={<Stethoscope size={22} aria-hidden />} />
          {hasVisits && topServices.length > 0 ? (
            <CardBody>
              <HorizontalBars data={topServices} name={t('visits')} />
            </CardBody>
          ) : (
            <EmptyState icon={<Stethoscope size={40} aria-hidden />} title={t('noData')} />
          )}
        </Card>

        <Card>
          <CardHeader title={t('stockUsage')} icon={<Package size={22} aria-hidden />} />
          <CardBody>
            <MonthlyBars data={usagePoints} name={t('used')} />
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title={t('appointmentStatus')} icon={<CalendarCheck size={22} aria-hidden />} />
          {appointmentTotal === 0 ? (
            <EmptyState icon={<CalendarCheck size={40} aria-hidden />} title={t('noData')} />
          ) : (
            <CardBody className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
              <StatusDonut data={statusPoints} />
              <ul className="space-y-2">
                {statusPoints.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-6">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <span
                        aria-hidden
                        className="h-4 w-4 rounded-sm border-2 border-line"
                        style={{ background: row.color }}
                      />
                      {row.label}
                    </span>
                    <Badge>{row.value}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
