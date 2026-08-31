import { ArrowLeft, CircleCheck, ClipboardList, PackageX, Truck } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { cancelPurchaseOrder } from '@/lib/actions/stock';
import { requirePermission } from '@/lib/auth/guard';
import { getPurchaseOrders } from '@/lib/purchase-orders';

export const dynamic = 'force-dynamic';

/**
 * What has been ordered and what has actually turned up.
 *
 * The screen `StockItem.orderedAt` could not support. That flag says "on its
 * way" and clears on the first box, so an order of ten answered by a delivery of
 * six left four that nothing in the app was still waiting for — see
 * `PurchaseOrder` in the schema for the three questions it could not hold.
 *
 * `stock.view` rather than `stock.edit`: "is the composite here yet" is asked at
 * the front desk as often as in the storage room, and it is a reading question.
 * Cancelling is the verb, and it simply does not render without the permission.
 *
 * No money on this page, deliberately. It is a storage-room screen and the rule
 * that keeps prices off those has not changed — what an order cost is read on
 * the statistics page, by the two roles that may see business figures.
 */
export default async function StockOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.view');
  const canEdit = user.permissions.includes('stock.edit');

  const t = await getTranslations('orders');
  const tc = await getTranslations('common');
  const tstock = await getTranslations('stock');
  const format = await getFormatter();

  const { show } = await searchParams;
  const closed = show === 'closed';
  const orders = await getPurchaseOrders({ open: !closed });

  const day = (date: Date) => format.dateTime(date, { day: 'numeric', month: 'short' });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={closed ? t('subtitleClosed') : t('subtitle')}
        trail={[{ href: '/stock', label: tstock('title') }, { label: t('title') }]}
        actions={
          <>
            {/* Two states, one link each way. A filter bar for a boolean is a
                form where a link would do. */}
            <Link
              href={closed ? '/stock/orders' : '/stock/orders?show=closed'}
              className="btn btn-secondary"
            >
              <ClipboardList size={18} aria-hidden />
              {closed ? t('showOpen') : t('showClosed')}
            </Link>
            <Link href="/stock" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          </>
        }
      />

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck size={40} aria-hidden />}
            title={closed ? t('emptyClosed') : t('empty')}
            explain
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader
                title={order.supplierName || t('noSupplier')}
                subtitle={
                  order.expectedAt
                    ? t('placedExpected', {
                        placed: day(order.placedAt),
                        expected: day(order.expectedAt),
                      })
                    : t('placed', { placed: day(order.placedAt) })
                }
                icon={<Truck size={22} aria-hidden />}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Late is the one thing an order can do wrong, and the one
                        thing the flag on the material could never say. Same
                        wording as the reorder list and the reminder board —
                        three screens showing one order must not disagree about
                        whether it is late. */}
                    {order.lateDays > 0 ? (
                      <Badge tone="danger">{t('late', { days: order.lateDays })}</Badge>
                    ) : null}

                    {order.cancelled ? (
                      <Badge tone="neutral">{t('cancelled')}</Badge>
                    ) : order.closedAt ? (
                      <Badge tone="ok">{t('complete')}</Badge>
                    ) : (
                      <Badge tone="brand">{t('outstanding', { count: order.outstanding })}</Badge>
                    )}

                    {canEdit && !order.closedAt ? (
                      <ActionForm
                        action={cancelPurchaseOrder}
                        values={{ id: order.id }}
                        confirmMessage={t('cancelConfirm')}
                      >
                        <button type="submit" className="btn btn-ghost btn-sm">
                          <PackageX size={17} aria-hidden />
                          {t('cancel')}
                        </button>
                      </ActionForm>
                    ) : null}
                  </div>
                }
              />

              <ul className="divide-y divide-line">
                {order.lines.map((line) => {
                  const full = line.outstanding === 0;

                  return (
                    <li
                      key={line.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
                    >
                      <span className="min-w-0 flex-1 truncate font-bold text-ink">
                        {/* The material itself, not just its name — the shelf is
                            where somebody goes next after reading this row. */}
                        <Link href={`/stock/${line.itemId}`} className="hover:underline">
                          {line.name}
                        </Link>
                      </span>

                      {/* Received against asked, always both. "6" alone is the
                          number that made a part-delivery invisible; "6 of 10"
                          is the whole point of the table. */}
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className={full ? 'text-ink-soft' : 'font-bold text-ink'}>
                          {t('receivedOf', {
                            got: line.receivedQuantity,
                            asked: line.quantity,
                          })}
                        </span>
                        {full ? (
                          <CircleCheck size={17} className="text-ok" aria-label={t('lineFull')} />
                        ) : (
                          <Badge tone="warn">{t('stillOwed', { count: line.outstanding })}</Badge>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
