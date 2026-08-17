import { ArrowLeft, Boxes, Package, ScanBarcode } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PhotoTile } from '@/components/stock/PhotoTile';
import { QuickMoveForm } from '@/components/stock/QuickMoveForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link, redirect } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { photoUrl } from '@/lib/stock-photos';
import { stockLabelPath } from '@/lib/stock-labels';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'stock' });
  return { title: t('moveTitle') };
}

/**
 * Where a printed shelf label lands.
 *
 * The whole feature in one screen: point a phone at the sticker on a box, and
 * this opens on the material it names with two buttons and a number. No search,
 * no list, no picking the right row out of seventy — which is the work the
 * label exists to remove.
 *
 * Reached three ways, all of them arriving here: the phone's own camera opens
 * the URL, the in-app camera resolves it through `lookupScan`, and a desk
 * scanner types it. Only the first needs this page to be a page.
 *
 * `stock.view` rather than `stock.edit`, so that somebody who may not move stock
 * can still scan a box to see what it is and how many are left. The form below
 * is what needs the permission, and it simply does not render without it.
 */
export default async function StockLabelPage({
  params,
}: {
  params: Promise<{ locale: string; kind: string; id: string }>;
}) {
  const { locale, kind, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.view');
  const canEdit = user.permissions.includes('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');

  if (kind !== 'i' && kind !== 'p') notFound();

  // A product label names a family, not a box, so it has to ask which variant
  // before it can ask how many.
  if (kind === 'p') {
    const product = await prisma.stockProduct.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        brand: true,
        photoKey: true,
        items: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            variantName: true,
            quantity: true,
            minLimit: true,
            photoKey: true,
          },
        },
      },
    });
    if (!product) notFound();

    // A product of one is most of them, and a screen offering a single choice is
    // a screen that only ever costs a tap. Straight through to the box itself.
    if (product.items.length === 1) {
      redirect({ href: stockLabelPath('item', product.items[0].id), locale });
    }

    const productPhoto = product.photoKey
      ? photoUrl('product', product.id, product.photoKey)
      : null;

    return (
      <>
        <PageHeader
          title={product.name}
          subtitle={product.brand ?? undefined}
          trail={[{ href: '/stock', label: t('title') }, { label: t('moveTitle') }]}
          actions={
            <Link href="/stock" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          }
        />

        <p className="mb-4 flex items-center gap-2 text-[1.05rem] text-ink-soft">
          <Boxes size={20} aria-hidden />
          {t('moveWhichVariant')}
        </p>

        {product.items.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Package size={40} aria-hidden />} title={t('moveNoVariants')} />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {product.items.map((item) => {
              const isOut = item.quantity === 0;
              const isLow = item.quantity <= item.minLimit;

              return (
                <li key={item.id}>
                  {/* One big target each: this is read at arm's length, by
                      somebody holding a box in the other hand. */}
                  <Link
                    href={stockLabelPath('item', item.id)}
                    className={cn(
                      'card flex items-center gap-4 border-l-8 p-4 transition-colors hover:border-ink',
                      isOut ? 'border-l-danger' : isLow ? 'border-l-warn' : 'border-l-ok',
                    )}
                  >
                    <PhotoTile
                      kind="item"
                      id={item.id}
                      name={item.name}
                      src={
                        item.photoKey ? photoUrl('item', item.id, item.photoKey) : productPhoto
                      }
                      inherited={!item.photoKey && Boolean(productPhoto)}
                      canEdit={false}
                      size="md"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.15rem] font-bold text-ink">
                        {item.variantName ?? item.name}
                      </span>
                      <span className="mt-0.5 block text-[0.95rem] text-ink-soft">
                        {t('inStock', { qty: item.quantity })}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'text-[1.75rem] leading-none font-bold tabular-nums',
                        isOut ? 'text-danger' : isLow ? 'text-warn' : 'text-ink',
                      )}
                    >
                      {item.quantity}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const item = await prisma.stockItem.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      supplier: { select: { name: true } },
      product: { select: { id: true, name: true, brand: true, photoKey: true } },
    },
  });
  if (!item) notFound();

  const isOut = item.quantity === 0;
  const isLow = item.quantity <= item.minLimit;

  const own = item.photoKey ? photoUrl('item', item.id, item.photoKey) : null;
  const productPhoto = item.product?.photoKey
    ? photoUrl('product', item.product.id, item.product.photoKey)
    : null;

  return (
    <>
      <PageHeader
        title={item.product?.name ?? item.name}
        subtitle={item.variantName ?? undefined}
        trail={[{ href: '/stock', label: t('title') }, { label: t('moveTitle') }]}
        actions={
          <>
            <Link href="/stock/scan" className="btn btn-secondary">
              <ScanBarcode size={18} aria-hidden />
              {t('moveScanAnother')}
            </Link>
            <Link href="/stock" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* What was scanned, at a size that confirms it across a storage room —
            the first job of this screen is to prove the right box was read. */}
        <section
          className={cn(
            'card flex flex-wrap items-center gap-5 border-l-8 p-5',
            isOut ? 'border-l-danger' : isLow ? 'border-l-warn' : 'border-l-ok',
          )}
        >
          <PhotoTile
            kind="item"
            id={item.id}
            name={item.name}
            src={own ?? productPhoto}
            inherited={!own && Boolean(productPhoto)}
            canEdit={false}
            size="lg"
          />

          <div className="min-w-40 flex-1">
            <p className="text-[1.25rem] font-bold text-ink">{item.name}</p>
            <p className="mt-1 text-[0.95rem] text-ink-soft">
              {item.category?.name || t('uncategorized')}
              {item.supplier ? ` · ${item.supplier.name}` : ''}
              {item.code ? ` · #${item.code}` : ''}
            </p>

            <p className="mt-3 flex flex-wrap items-center gap-2">
              {isOut ? (
                <Badge tone="danger">{t('out')}</Badge>
              ) : isLow ? (
                <Badge tone="warn">{t('low')}</Badge>
              ) : (
                <Badge tone="ok">{t('ok')}</Badge>
              )}
              {/* A retired material whose label is still on a box in a drawer.
                  Worth saying, and not worth refusing — the ledger should record
                  what actually happened either way. */}
              {item.archivedAt ? <Badge>{t('archivedTitle')}</Badge> : null}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <span
              className={cn(
                'text-[3.5rem] leading-none font-bold tabular-nums',
                isOut ? 'text-danger' : isLow ? 'text-warn' : 'text-ink',
              )}
            >
              {item.quantity}
            </span>
            <span className="text-[0.95rem] font-semibold text-ink-soft">
              {t('boxes', { count: item.quantity })}
            </span>
          </div>
        </section>

        <QuickMoveForm itemId={item.id} onHand={item.quantity} canEdit={canEdit} />
      </div>

      {!canEdit ? (
        <p className="mt-4 text-ink-soft">{tc('viewOnly')}</p>
      ) : null}
    </>
  );
}
