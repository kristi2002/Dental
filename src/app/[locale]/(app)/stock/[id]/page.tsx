import {
  ArrowLeft,
  Boxes,
  History,
  Package,
  Pencil,
  ScanBarcode,
  Truck,
  User,
} from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { BarcodeList } from '@/components/stock/BarcodeList';
import { BatchList } from '@/components/stock/BatchList';
import { PhotoTile } from '@/components/stock/PhotoTile';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { byExpiry, summariseBatches, usableQuantity } from '@/lib/expiry';
import { prisma } from '@/lib/prisma';
import { getMaterialLedger } from '@/lib/stock-ledger';
import { photoUrl } from '@/lib/stock-photos';
import { stockLabelPath } from '@/lib/stock-labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'stock' });
  const item = await prisma.stockItem.findUnique({ where: { id }, select: { name: true } });
  return { title: item?.name ?? t('title') };
}

/**
 * One material's own record.
 *
 * The gap this fills is odd in shape: nearly all of it was already written down
 * and none of it was anywhere to be read. Lots render on the storage list,
 * barcodes on the edit form, and the movement ledger — eight code paths writing
 * to it, an index built for exactly this query, comments explaining which lot a
 * consumption came out of and which visit spent it — had no screen at all.
 *
 * So this is assembly, not new machinery. The one thing it adds is the ledger,
 * and adding it also makes the careful parts of the ledger *checkable*: a wrong
 * batch allocation, or a deduction against the wrong visit, looked exactly like
 * a right one for as long as nothing displayed either.
 *
 * Read-only, and `stock.view`. `/stock/[id]/edit` is next door and is where the
 * verbs live; this is the page you land on from a search, from an order line, or
 * from a shelf label, and none of those are arrivals that should open a form.
 */
export default async function StockItemPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.view');
  const canEdit = user.permissions.includes('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');
  const tl = await getTranslations('ledger');
  const format = await getFormatter();

  const item = await prisma.stockItem.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      variantName: true,
      code: true,
      location: true,
      quantity: true,
      minLimit: true,
      photoKey: true,
      archivedAt: true,
      updatedAt: true,
      orderedAt: true,
      expectedAt: true,
      category: { select: { name: true } },
      supplier: { select: { name: true } },
      product: { select: { id: true, name: true, photoKey: true } },
      batches: {
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          purchasedAt: true,
          manufacturedAt: true,
          quantity: true,
          usedQuantity: true,
          notes: true,
        },
      },
      barcodes: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, code: true, packQty: true, label: true, createdAt: true },
      },
      orderLines: {
        where: { order: { closedAt: null } },
        select: { quantity: true, receivedQuantity: true },
      },
    },
  });
  if (!item) notFound();

  const ledger = await getMaterialLedger(item.id);

  // The same two figures every stock screen reads, computed the same way: what
  // is on the shelf, and what of it can actually be used. An expired box counts
  // in the first and not the second, which is the whole reason both exist.
  const usable = usableQuantity(item.quantity, item.batches);
  const summary = summariseBatches(item.batches);

  // Boxes still owed on open orders — see `PurchaseOrder`. Nothing else on this
  // page can say "four of the ten never came".
  const outstanding = item.orderLines.reduce(
    (sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity),
    0,
  );

  const photo = item.photoKey
    ? photoUrl('item', item.id, item.photoKey)
    : item.product?.photoKey
      ? photoUrl('product', item.product.id, item.product.photoKey)
      : null;

  const title = item.variantName ? `${item.name} · ${item.variantName}` : item.name;
  const day = (date: Date) => format.dateTime(date, { day: 'numeric', month: 'short' });

  return (
    <>
      <PageHeader
        title={title}
        subtitle={item.category?.name || t('uncategorized')}
        trail={[{ href: '/stock', label: t('title') }, { label: title }]}
        actions={
          <>
            {/* The quick-move screen a shelf label opens. Offered here because
                the commonest thing to do after reading a material's record is to
                move some of it, and that screen is two buttons and a number. */}
            {canEdit ? (
              <Link href={stockLabelPath('item', item.id)} className="btn btn-secondary">
                <ScanBarcode size={18} aria-hidden />
                {t('moveTitle')}
              </Link>
            ) : null}
            {canEdit ? (
              <Link href={`/stock/${item.id}/edit`} className="btn btn-primary">
                <Pencil size={18} aria-hidden />
                {t('edit')}
              </Link>
            ) : null}
            <Link href="/stock" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              {/* Recognising the box is the point of the picture, so it leads
                  the column rather than sitting beside a field. */}
              <PhotoTile
                kind="item"
                id={item.id}
                name={title}
                src={photo}
                inherited={!item.photoKey && Boolean(item.product?.photoKey)}
                canEdit={canEdit}
                size="xl"
              />

              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-3xl font-bold tabular-nums text-ink">{item.quantity}</span>
                <span className="text-body text-ink-soft">{t('boxes', { count: item.quantity })}</span>
              </p>

              <ul className="space-y-1.5 text-body">
                {/* Only when the two differ. Printing "usable: 12" beside
                    "12 boxes" on every healthy material is a line that teaches
                    the reader to stop reading the list. */}
                {usable !== item.quantity ? (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-ink-soft">{tl('usable')}</span>
                    <Badge tone="warn">{usable}</Badge>
                  </li>
                ) : null}
                <li className="flex items-center justify-between gap-3">
                  <span className="text-ink-soft">{tl('minimum')}</span>
                  <span className="font-bold tabular-nums text-ink">{item.minLimit}</span>
                </li>
                {item.code ? (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-ink-soft">{t('code')}</span>
                    <span className="font-bold tabular-nums text-ink">#{item.code}</span>
                  </li>
                ) : null}
                {/* Where to walk to. Above the supplier, because somebody
                    reading this page is far more often looking for the box than
                    for who sold it. */}
                {item.location ? (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-ink-soft">{t('location')}</span>
                    <span className="text-right font-bold text-ink">{item.location}</span>
                  </li>
                ) : null}
                {item.supplier ? (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-ink-soft">{t('supplier')}</span>
                    <span className="font-bold text-ink">{item.supplier.name}</span>
                  </li>
                ) : null}
                <li className="flex items-center justify-between gap-3">
                  <span className="text-ink-soft">{tl('lastMoved')}</span>
                  <span className="text-ink">{day(item.updatedAt)}</span>
                </li>
              </ul>

              {/* On order, and — the part the flag alone could never say — how
                  much of it is still owed. */}
              {item.orderedAt ? (
                <p className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-soft px-3 py-2">
                  <Truck size={17} className="text-brand-deep" aria-hidden />
                  <Link href="/stock/orders" className="font-semibold text-brand-deep hover:underline">
                    {outstanding > 0
                      ? tl('onOrderOutstanding', { count: outstanding })
                      : tl('onOrder')}
                  </Link>
                </p>
              ) : null}

              {item.archivedAt ? (
                <p className="rounded-lg bg-paper px-3 py-2 text-meta text-ink-soft">
                  {t('archivedOn', { date: day(item.archivedAt) })}
                </p>
              ) : null}
            </CardBody>
          </Card>

          {/* Lots, with the expiry summary the storage list already computes.
              Silent for a material nobody tracks by lot, which is most of them. */}
          {item.batches.length > 0 ? (
            <Card>
              <CardHeader
                title={tl('lots')}
                icon={<Boxes size={22} aria-hidden />}
                action={
                  summary.expiredUnits > 0 ? (
                    <Badge tone="danger">{t('expired')}</Badge>
                  ) : summary.soonUnits > 0 ? (
                    <Badge tone="warn">{t('expiringSoon')}</Badge>
                  ) : null
                }
              />
              <CardBody>
                <BatchList
                  batches={byExpiry(item.batches).map((batch) => ({
                    id: batch.id,
                    lotNumber: batch.lotNumber ?? '',
                    expiryDate: batch.expiryDate?.toISOString() ?? '',
                    purchasedAt: batch.purchasedAt?.toISOString() ?? '',
                    manufacturedAt: batch.manufacturedAt?.toISOString() ?? '',
                    quantity: batch.quantity,
                    notes: batch.notes ?? '',
                  }))}
                  canEdit={canEdit}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {/* The ledger. Eight code paths have been writing to it and nothing
              has ever shown it — see `src/lib/stock-ledger.ts`. */}
          <Card>
            <CardHeader
              title={tl('title')}
              subtitle={tl('subtitle')}
              icon={<History size={22} aria-hidden />}
            />
            {ledger.length === 0 ? (
              <EmptyState icon={<Package size={40} aria-hidden />} title={tl('empty')} />
            ) : (
              <ul className="divide-y divide-line">
                {ledger.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                    {/* The number first and always signed. A ledger read down
                        the left edge is a ledger somebody can scan for the row
                        that does not belong. */}
                    <span
                      className={`w-12 shrink-0 text-right text-lead font-bold tabular-nums ${
                        entry.delta < 0 ? 'text-warn' : 'text-ok'
                      }`}
                    >
                      {entry.delta > 0 ? `+${entry.delta}` : `−${Math.abs(entry.delta)}`}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-ink">
                        {/* An unrecognised reason shows its own text rather
                            than being hidden or given a wrong label — see
                            `reasonKey`. */}
                        {entry.reason ? tl(`reason_${entry.reason}`) : entry.rawReason || tl('reason_unknown')}
                      </span>

                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-ink-soft">
                        <span>{format.dateTime(entry.at, { dateStyle: 'medium' })}</span>

                        {entry.staffName ? (
                          <span className="flex items-center gap-1">
                            <User size={13} aria-hidden />
                            {entry.staffName}
                          </span>
                        ) : null}

                        {/* The lot, which is the answer a recall notice wants.
                            Written on every consumption since lots were drawn
                            down and displayed nowhere until now. */}
                        {entry.lotNumber ? (
                          <span className="font-semibold">
                            {t('lotShort', { lot: entry.lotNumber })}
                          </span>
                        ) : null}

                        {/* And the visit that spent it. The link exists so a
                            mis-recorded visit can be found; this is the first
                            screen that lets anybody follow it. */}
                        {entry.patientId ? (
                          <Link
                            href={`/patients/${entry.patientId}`}
                            className="font-semibold text-brand-deep hover:underline"
                          >
                            {entry.patientName}
                          </Link>
                        ) : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Already written, previously reachable only from the edit form. */}
          <BarcodeList
            barcodes={item.barcodes.map((barcode) => ({
              ...barcode,
              label: barcode.label ?? '',
            }))}
          />
        </div>
      </div>
    </>
  );
}
