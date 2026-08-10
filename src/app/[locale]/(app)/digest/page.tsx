import {
  BellRing,
  CalendarDays,
  CircleHelp,
  Clock,
  Package,
  ShoppingCart,
  Sun,
} from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { DigestActions } from '@/components/digest/DigestActions';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { AppointmentStatus } from '@/generated/prisma/enums';
import { requireUser } from '@/lib/auth/guard';
import { today, toDateKey } from '@/lib/dates';
import { getAppointmentsBetween, getLowStockItems } from '@/lib/queries';
import { getRecalls } from '@/lib/recalls';
import { getReliabilityMap } from '@/lib/reliability';
import { getReorderSuggestions } from '@/lib/reorder';
import { findFreeGaps } from '@/lib/scheduling';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'digest' });
  return { title: t('title') };
}

/**
 * The whole day on one page, meant to be read once with coffee and then printed
 * or sent to the group chat. Everything here already exists elsewhere in the
 * app; the value is that nobody has to open six screens to assemble it.
 */
export default async function DigestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const canSeeRecalls = user.permissions.includes('recall.view');
  const canSeeStock = user.permissions.includes('stock.view');

  const t = await getTranslations('digest');
  const ta = await getTranslations('appointments');
  const ts = await getTranslations('stock');
  const format = await getFormatter();

  const day = today();

  const [appointments, lowStock, recalls, gaps, reorder] = await Promise.all([
    getAppointmentsBetween(day, day),
    canSeeStock ? getLowStockItems() : Promise.resolve([]),
    canSeeRecalls ? getRecalls() : Promise.resolve([]),
    findFreeGaps({ date: day }),
    canSeeStock ? getReorderSuggestions() : Promise.resolve([]),
  ]);

  const scheduled = appointments.filter((a) => a.status === AppointmentStatus.SCHEDULED);
  const reliability = await getReliabilityMap(scheduled.map((a) => a.patient.id));

  // Who is worth a confirmation call: they have not answered the link, and
  // their history says they might not turn up. Someone who already replied is
  // settled — chasing them again is exactly the noise this page should avoid.
  const worthConfirming = scheduled.filter(
    (appointment) =>
      !appointment.confirmed &&
      reliability.get(appointment.patient.id)?.level === 'at-risk',
  );

  const dayLabel = format.dateTime(day, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // The same brief as plain text, for pasting into the clinic's group chat.
  const lines = [
    `${t('title')} — ${dayLabel}`,
    '',
    `${t('scheduleTitle')}: ${scheduled.length}`,
    ...scheduled.map(
      (a) => `  ${a.startTime} ${a.patient.firstName} ${a.patient.lastName}${a.serviceName ? ` — ${a.serviceName}` : ''}`,
    ),
    ...(gaps.length > 0 ? ['', `${t('gapsTitle')}: ${gaps.map((g) => `${g.startTime}–${g.endTime}`).join(', ')}`] : []),
    ...(recalls.length > 0 ? ['', `${t('callTitle')}: ${recalls.length}`, ...recalls.slice(0, 8).map((r) => `  ${r.lastName} ${r.firstName} — ${r.phone}`)] : []),
    ...(lowStock.length > 0 ? ['', `${t('stockTitle')}: ${lowStock.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}`] : []),
  ].join('\n');

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={dayLabel}
        actions={<DigestActions text={lines} />}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={t('scheduleTitle')}
            subtitle={t('scheduleSubtitle', { count: scheduled.length })}
            icon={<Sun size={22} aria-hidden />}
          />
          {scheduled.length === 0 ? (
            <EmptyState icon={<CalendarDays size={36} aria-hidden />} title={t('scheduleEmpty')} />
          ) : (
            <ul className="divide-y border-line">
              {scheduled.map((appointment) => {
                const level = reliability.get(appointment.patient.id)?.level;
                return (
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-5 py-2.5 last:border-b-0"
                  >
                    <span className="w-16 shrink-0 text-[1.05rem] font-bold text-ink tabular-nums">
                      {appointment.startTime}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[1.02rem] text-ink">
                      {appointment.patient.firstName} {appointment.patient.lastName}
                      {appointment.serviceName ? (
                        <span className="text-ink-soft"> — {appointment.serviceName}</span>
                      ) : null}
                    </span>
                    {appointment.confirmed ? (
                      <Badge tone="ok">{ta('confirmed')}</Badge>
                    ) : level === 'at-risk' ? (
                      <Badge tone="warn">{t('callToConfirm')}</Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('gapsTitle')}
            subtitle={t('gapsSubtitle')}
            icon={<Clock size={22} aria-hidden />}
          />
          <div className="px-5 py-4">
            {gaps.length === 0 ? (
              <p className="text-[1.02rem] text-ink-soft">{t('gapsNone')}</p>
            ) : (
              <p className="flex flex-wrap gap-2">
                {gaps.map((gap) => (
                  <Badge key={gap.startTime} tone="ok">
                    {gap.startTime}–{gap.endTime} ({gap.minutes} {t('min')})
                  </Badge>
                ))}
              </p>
            )}

            {worthConfirming.length > 0 ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-warn bg-warn-soft px-3 py-2.5 text-[0.95rem] font-semibold text-warn">
                <CircleHelp size={18} aria-hidden className="mt-0.5 shrink-0" />
                {t('confirmHint', {
                  names: worthConfirming
                    .map((a) => `${a.patient.firstName} ${a.patient.lastName}`)
                    .join(', '),
                })}
              </p>
            ) : null}
          </div>
        </Card>

        {canSeeRecalls ? (
          <Card>
            <CardHeader
              title={t('callTitle')}
              subtitle={t('callSubtitle', { count: recalls.length })}
              icon={<BellRing size={22} aria-hidden />}
            />
            {recalls.length === 0 ? (
              <EmptyState icon={<BellRing size={36} aria-hidden />} title={t('callEmpty')} />
            ) : (
              <ul className="divide-y border-line">
                {recalls.slice(0, 10).map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-2.5 last:border-b-0"
                  >
                    <span className="text-[1.02rem] text-ink">
                      {row.lastName} {row.firstName}
                    </span>
                    <span className="text-[0.95rem] text-ink-soft">{row.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {canSeeStock ? (
          <Card>
            <CardHeader
              title={t('stockTitle')}
              subtitle={t('stockSubtitle', { count: lowStock.length })}
              icon={<Package size={22} aria-hidden />}
            />
            {lowStock.length === 0 && reorder.length === 0 ? (
              <EmptyState icon={<Package size={36} aria-hidden />} title={t('stockEmpty')} />
            ) : (
              <>
                <ul className="divide-y border-line">
                  {lowStock.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5 last:border-b-0"
                    >
                      <span className="text-[1.02rem] text-ink">{item.name}</span>
                      <Badge tone={item.quantity === 0 ? 'danger' : 'warn'}>
                        {ts('inStock', { qty: item.quantity, unit: item.unit })}
                      </Badge>
                    </li>
                  ))}
                </ul>

                {reorder.length > 0 ? (
                  <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-[0.95rem] text-ink-soft">
                    <ShoppingCart size={17} aria-hidden className="mt-0.5 shrink-0 text-brand" />
                    {t('reorderHint', { count: reorder.length })}
                  </p>
                ) : null}
              </>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
