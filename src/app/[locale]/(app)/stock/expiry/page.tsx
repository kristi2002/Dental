import { ArrowLeft, CalendarClock, PackageCheck } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { WriteOffForm } from '@/components/stock/WriteOffForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { addDays, today } from '@/lib/dates';
import { EXPIRY_SOON_DAYS, expiryLevel } from '@/lib/expiry';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The lots that have turned, and the ones about to.
 *
 * Expiry was already computed and already badged on the stock page — as a
 * property of a *material*, which is the wrong unit to act on. "Composite:
 * expired" tells you a shelf is wrong; it does not tell you which box to take
 * off it, and the only way to find out was to open each material in turn.
 *
 * This is the same information turned the other way up: one row per lot, oldest
 * first, with the one action that answers it. Expired lots come first because
 * they are the ones that must not go near a patient; the ninety-day window
 * behind them is the ordering horizon — long enough to use the box up or to buy
 * its replacement without rushing.
 */
export default async function ExpiryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // `stock.edit`, like the stocktake and for the same reason: everything here is
  // already legible on the stock page, and what this screen adds is the action.
  await requirePermission('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const day = today();
  const horizon = addDays(day, EXPIRY_SOON_DAYS);

  const batches = await prisma.stockBatch.findMany({
    where: {
      item: ACTIVE_STOCK,
      expiryDate: { not: null, lte: horizon },
    },
    orderBy: { expiryDate: 'asc' },
    select: {
      id: true,
      lotNumber: true,
      expiryDate: true,
      quantity: true,
      usedQuantity: true,
      item: { select: { id: true, name: true } },
    },
  });

  // A lot that has been fully drawn down is history, not a problem: the units it
  // held are already off the shelf, and listing it would be asking somebody to
  // throw away a box that is not there.
  const open = batches
    .map((batch) => ({ ...batch, remaining: batch.quantity - batch.usedQuantity }))
    .filter((batch) => batch.remaining > 0);

  const expired = open.filter((batch) => expiryLevel(batch.expiryDate, day) === 'EXPIRED');
  const soon = open.filter((batch) => expiryLevel(batch.expiryDate, day) === 'SOON');

  const section = (
    rows: typeof open,
    title: string,
    subtitle: string,
    tone: 'alert' | 'warn',
  ) =>
    rows.length === 0 ? null : (
      <Card className={tone === 'alert' ? 'border-danger' : 'border-warn'}>
        <CardHeader
          title={title}
          subtitle={subtitle}
          icon={
            <CalendarClock
              size={22}
              aria-hidden
              className={tone === 'alert' ? 'text-danger' : 'text-warn'}
            />
          }
        />
        <ul className="divide-y divide-line">
          {rows.map((batch) => (
            <li
              key={batch.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5"
            >
              <span className="min-w-0">
                <Link
                  href={`/stock?q=${encodeURIComponent(batch.item.name)}`}
                  className="text-body font-bold text-ink"
                >
                  {batch.item.name}
                </Link>
                <span className="block text-meta text-ink-soft tabular-nums">
                  {t('inStock', { qty: batch.remaining })}
                  {batch.lotNumber ? ` · ${t('lotShort', { lot: batch.lotNumber })}` : ''}
                </span>
              </span>

              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={tone}>
                  {batch.expiryDate
                    ? format.dateTime(batch.expiryDate, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : ''}
                </Badge>
                <WriteOffForm
                  batchId={batch.id}
                  remaining={batch.remaining}
                  itemName={batch.item.name}
                />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    );

  return (
    <>
      <PageHeader
        title={t('expiryTitle')}
        subtitle={t('expirySubtitle', { days: EXPIRY_SOON_DAYS })}
        trail={[{ href: '/stock', label: t('title') }, { label: t('expiryTitle') }]}
        actions={
          <Link href="/stock" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      {open.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<PackageCheck size={40} aria-hidden />}
            title={t('expiryNone', { days: EXPIRY_SOON_DAYS })}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {section(
            expired,
            t('expiredTitle'),
            t('expiredSubtitle', { count: expired.length }),
            'alert',
          )}
          {section(soon, t('expiringTitle'), t('expiringSubtitle', { count: soon.length }), 'warn')}
        </div>
      )}
    </>
  );
}
