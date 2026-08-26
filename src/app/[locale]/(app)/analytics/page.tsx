import {
  CalendarCheck,
  ChartColumn,
  Clock,
  Package,
  Share2,
  Stethoscope,
  TrendingUp,
  UserX,
  Users,
} from 'lucide-react';
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
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/ui/StatCard';
import { requirePermission } from '@/lib/auth/guard';
import {
  addMonths,
  fromDateKey,
  lastMonths,
  startOfMonth,
  toMonthKey,
  today,
} from '@/lib/dates';
import { ACTIVE_PATIENTS } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import { getProviderOptions } from '@/lib/queries';
import { getProviderNoShows, getUtilisation, overallUtilisation } from '@/lib/utilisation';

export const dynamic = 'force-dynamic';

/**
 * The windows this page can be read over, in months.
 *
 * It had one, `MONTHS_TRACKED = 6`, as a module constant — on the single screen
 * in the app that exists to be read by the owner rather than worked by the desk,
 * and the only list that never grew a filter bar. Six months answers "how are we
 * doing" and cannot answer "how does this year compare with last", which is the
 * other half of why anybody opens it.
 *
 * Twelve is the default rather than six: a dental practice is seasonal — August
 * is quiet in Albania and every check-up recall lands on its own anniversary —
 * so a half-year window shows a slope that a full year shows as a cycle.
 */
const WINDOWS = [3, 6, 12, 24] as const;
const DEFAULT_MONTHS = 12;

function monthsFrom(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return (WINDOWS as readonly number[]).includes(parsed) ? parsed : DEFAULT_MONTHS;
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'var(--color-brand)',
  COMPLETED: 'var(--color-ok)',
  CANCELLED: 'var(--color-line-strong)',
  NO_SHOW: 'var(--color-warn)',
};

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ months?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('analytics.view');

  const { months: rawMonths } = await searchParams;
  const MONTHS_TRACKED = monthsFrom(rawMonths);

  const t = await getTranslations('analytics');
  const ta = await getTranslations('appointments');
  const format = await getFormatter();

  const months = lastMonths(MONTHS_TRACKED);
  const windowStart = months[0];
  const windowEnd = addMonths(startOfMonth(today()), 1);

  const [
    visits,
    patients,
    movements,
    appointments,
    totalPatients,
    totalVisits,
    referrals,
    byProvider,
    providers,
    byService,
    serviceNames,
    freeTyped,
  ] = await Promise.all(
    [
      prisma.visitRecord.findMany({
        where: { visitDate: { gte: windowStart, lt: windowEnd } },
        select: { visitDate: true },
      }),
      prisma.patient.findMany({
        where: { createdAt: { gte: windowStart, lt: windowEnd } },
        select: { createdAt: true },
      }),
      prisma.stockMovement.findMany({
        where: { createdAt: { gte: windowStart, lt: windowEnd }, delta: { lt: 0 } },
        select: { createdAt: true, delta: true },
      }),
      // Windowed like everything else on this page. Grouping over all time put
      // a lifetime completion rate beside six months of visits and let a reader
      // compare two different periods without being told they were different.
      prisma.appointment.groupBy({
        by: ['status'],
        where: { date: { gte: windowStart, lt: windowEnd } },
        _count: { _all: true },
      }),
      // Active people only, matching every list in the app: an archived record
      // is out of the drawer, and a headline that counts it disagrees with the
      // screen the reader just came from.
      prisma.patient.count({ where: ACTIVE_PATIENTS }),
      prisma.visitRecord.count(),
      // "Where do patients come from" — the one CRM question an owner asks, and
      // the one this page could not answer at all even though the field for it
      // has been on the patient form the whole time. All time, deliberately:
      // a referral source is how somebody arrived, not something they do monthly.
      prisma.patient.groupBy({
        by: ['referralSource'],
        where: { referralSource: { not: null } },
        _count: { _all: true },
      }),
      // Appointments now carry a dentist, and nothing on this page split by one,
      // so "how full is Dr B" stayed unanswerable after the column existed.
      prisma.appointment.groupBy({
        by: ['staffUserId'],
        where: { date: { gte: windowStart, lt: windowEnd }, staffUserId: { not: null } },
        _count: { _all: true },
      }),
      getProviderOptions(),
      // Grouped by catalogue entry, not by typed text.
      //
      // This chart used to split `VisitRecord.services` on commas and tally the
      // pieces in memory, so one typo, one extra space, or one entry made before
      // a rename became its own bar — and a treatment whose name contains a
      // comma became two treatments that never existed.
      prisma.visitService.groupBy({
        by: ['serviceId'],
        where: { visit: { visitDate: { gte: windowStart, lt: windowEnd } } },
        _count: { _all: true },
      }),
      prisma.service.findMany({ select: { id: true, name: true } }),
      // Anything typed by hand has no catalogue entry to group by, so it is
      // counted by name and shown as itself rather than silently dropped.
      prisma.visitService.groupBy({
        by: ['name'],
        where: {
          serviceId: null,
          visit: { visitDate: { gte: windowStart, lt: windowEnd } },
        },
        _count: { _all: true },
      }),
    ],
  );

  // Asked after the providers are known, because the no-show table names them.
  //
  // These two are the questions an owner actually opens this page with, and
  // neither could be answered from it: how full the chairs were, and whose list
  // is leaking. Every input has been in the database for a while — opening
  // hours, closures, a duration on every booking, a dentist on every slot — and
  // nothing put them together.
  const providerName = new Map(providers.map((person) => [person.id, person.name]));
  // What the storage room is worth used to be a tile here. It is gone with every
  // other price on every stock screen — the owner's decision, and the reason
  // nothing in this app values the cupboard any more.
  const [utilisation, providerNoShows] = await Promise.all([
    getUtilisation({ from: windowStart, to: windowEnd }),
    getProviderNoShows({ from: windowStart, to: windowEnd, names: providerName }),
  ]);

  // Percentages against the same month labels the other charts use, so the
  // reader can lay one over another without checking the axis twice.
  const utilisationPoints: Point[] = utilisation.map((point) => ({
    label: format.dateTime(fromDateKey(`${point.month}-01`), { month: 'short' }),
    value: point.percent,
  }));

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

  // The catalogue's own current name, so a service renamed last month shows its
  // whole history under one label instead of splitting into before and after.
  const nameById = new Map(serviceNames.map((service) => [service.id, service.name]));

  const topServices: Point[] = [
    ...byService
      .filter((row) => row.serviceId !== null)
      .map((row) => ({
        label: nameById.get(row.serviceId!) ?? row.serviceId!,
        value: row._count._all,
      })),
    ...freeTyped.map((row) => ({ label: row.name, value: row._count._all })),
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .reverse(); // Recharts stacks a vertical layout bottom-up.

  const referralPoints: Point[] = referrals
    .map((row) => ({ label: row.referralSource!, value: row._count._all }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .reverse(); // Recharts stacks a vertical layout bottom-up.

  const providerPoints: Point[] = byProvider
    .map((row) => ({
      label: providerName.get(row.staffUserId!) ?? row.staffUserId!,
      value: row._count._all,
    }))
    .sort((a, b) => b.value - a.value)
    .reverse();

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
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ label: t('title') }]}
        actions={
          /* A segmented control rather than a filter bar: there is one thing to
             choose and four answers, and a form with a Filter button would be
             three presses to change a number. Plain links, so the window is in
             the address and a particular view can be sent to somebody. */
          <nav className="segmented" aria-label={t('windowLabel')}>
            {WINDOWS.map((window) => (
              <Link
                key={window}
                href={window === DEFAULT_MONTHS ? '/analytics' : `/analytics?months=${window}`}
                className="segment"
                aria-current={window === MONTHS_TRACKED ? 'page' : undefined}
              >
                {t('windowMonths', { months: window })}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('totalPatients')} value={totalPatients} Icon={Users} />
        <StatCard label={t('totalVisits')} value={totalVisits} Icon={Stethoscope} />
        <StatCard label={t('avgPerMonth')} value={avgVisitsPerMonth} Icon={TrendingUp} />
        <StatCard
          label={t('completionRate')}
          value={`${completionRate}%`}
          Icon={CalendarCheck}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {/* The number the question "how are we doing" is actually asking, and
            the one this page counted appointments instead of. Eight check-ups
            and three implants are the same count and nothing like the same day. */}
        <StatCard
          label={t('utilisation')}
          value={`${overallUtilisation(utilisation)}%`}
          Icon={Clock}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={t('utilisationOverTime')}
            subtitle={t('utilisationHint')}
            icon={<Clock size={22} aria-hidden />}
          />
          <CardBody>
            <MonthlyBars data={utilisationPoints} name={t('utilisation')} />
          </CardBody>
        </Card>

        {/* A table rather than a chart: three numbers per dentist, and the one
            that matters is a percentage nobody can read off a bar. */}
        <Card>
          <CardHeader
            title={t('noShowByProvider')}
            subtitle={t('noShowHint')}
            icon={<UserX size={22} aria-hidden />}
          />
          {providerNoShows.length > 0 ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                    {ta('provider')}
                  </th>
                  <th className="px-5 py-2 text-right text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                    {t('pastAppointments')}
                  </th>
                  <th className="px-5 py-2 text-right text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                    {ta('status_NO_SHOW')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {providerNoShows.map((row) => (
                  <tr key={row.staffUserId} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3 font-semibold text-ink">{row.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{row.past}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span
                        className={
                          row.noShowRate >= 15 ? 'font-bold text-warn' : 'font-semibold text-ink'
                        }
                      >
                        {row.noShows} · {row.noShowRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<UserX size={40} aria-hidden />} title={t('noData')} />
          )}
        </Card>

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

        <Card>
          <CardHeader title={t('referralSources')} icon={<Share2 size={22} aria-hidden />} />
          {referralPoints.length > 0 ? (
            <CardBody>
              <HorizontalBars data={referralPoints} name={t('patients')} />
            </CardBody>
          ) : (
            <EmptyState icon={<Share2 size={40} aria-hidden />} title={t('noReferralData')} />
          )}
        </Card>

        {/* Only worth a panel once there is more than one person to compare. */}
        {providerPoints.length > 1 ? (
          <Card>
            <CardHeader title={t('byProvider')} icon={<Stethoscope size={22} aria-hidden />} />
            <CardBody>
              <HorizontalBars data={providerPoints} name={t('appointments')} />
            </CardBody>
          </Card>
        ) : null}

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
                        className="h-4 w-4 rounded-sm border border-line"
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
