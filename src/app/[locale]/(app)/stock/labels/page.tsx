import { ArrowLeft, QrCode as QrCodeIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LabelCard } from '@/components/stock/LabelCard';
import { PrintLabelsButton } from '@/components/stock/PrintLabelsButton';
import { QrCode } from '@/components/stock/QrCode';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getStockCategories } from '@/lib/queries';
import { stockLabelUrl, type StockLabelKind } from '@/lib/stock-labels';
import { matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Sentinel for "this material has no category" — a category id is a uuid, never this. */
const NO_CATEGORY = '__none__';

/** Printed width of one sticker. The label sheet is laid out in millimetres, not pixels. */
const SIZES = { sm: '32mm', md: '45mm', lg: '62mm' } as const;
type Size = keyof typeof SIZES;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'stock' });
  return { title: t('labelsTitle') };
}

/**
 * Where the app reaches itself from, for a label that will outlive this page
 * load by years.
 *
 * `NEXT_PUBLIC_APP_URL` first, because a configured address is a deliberate one
 * and a sticker is printed once. Where it is unset, the host the printing
 * browser is actually using beats the localhost fallback the messaging links use
 * — a label printed from `192.168.1.14:3000` and pointing at `localhost` would
 * resolve to the phone itself, which is the one machine it must not mean.
 *
 * And if the practice later moves to a different address, nothing already stuck
 * to a box stops working: `parseStockLabel` matches on the path and ignores the
 * host entirely, so an old sticker read by the in-app scanner still finds its
 * material. Only the phone-camera path needs the host to still resolve.
 */
async function labelOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host');
  if (!host) return 'http://localhost:3000';

  const proto = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Every label in the storage room, on paper.
 *
 * The counterpart to `/stock/q/…`: that screen is what a sticker opens, and this
 * is where the stickers come from. Filtered rather than all-or-nothing, because
 * the way this actually gets used is one shelf at a time — a category is chosen,
 * a page comes out, and those boxes get labelled in an afternoon.
 *
 * `stock.view`, not `stock.edit`. Printing changes nothing, and an assistant who
 * finds an unlabelled box should be able to make it a label without having to
 * find somebody who can also edit the shelf.
 *
 * Deliberately **not** printing the quantity on the sticker. It is the one fact
 * on this screen that is wrong within the hour, and a label that states a number
 * nobody has updated is worse than a label that states none — the count belongs
 * on the screen the sticker opens, where it is read fresh every time.
 */
export default async function StockLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string; kind?: string; size?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('stock.view');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');

  // First and on its own, for the reason every stock screen does it: this is
  // where the practice's old typed-in category names become rows.
  const categories = await getStockCategories();

  const { q, category, kind: rawKind, size: rawSize } = await searchParams;
  const query = (q ?? '').trim();
  const categoryFilter = category ?? '';
  const kind: StockLabelKind = rawKind === 'product' ? 'product' : 'item';
  const size: Size = rawSize === 'sm' || rawSize === 'lg' ? rawSize : 'md';

  const origin = await labelOrigin();

  const allItems = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      variantName: true,
      categoryId: true,
      category: { select: { name: true } },
      product: { select: { id: true, name: true, brand: true } },
    },
  });

  const items = allItems.filter((item) => {
    if (
      query &&
      !matches(item.name, query) &&
      !matches(item.product?.name ?? '', query) &&
      !matches(item.product?.brand ?? '', query) &&
      !matches(item.variantName ?? '', query) &&
      !matches(item.category?.name ?? '', query) &&
      !matches(item.code ?? '', query)
    ) {
      return false;
    }
    if (categoryFilter === NO_CATEGORY) return !item.categoryId;
    if (categoryFilter) return item.categoryId === categoryFilter;
    return true;
  });

  /** One sticker: what it points at, and the three lines printed under the symbol. */
  type Label = {
    key: string;
    url: string;
    title: string;
    subtitle: string | null;
    footnote: string | null;
  };

  let labels: Label[];

  if (kind === 'product') {
    // One sticker per product — for the shelf edge, where a whole family lives
    // together. Materials with no product of their own are still a product of
    // one, and get their own sticker pointing straight at the box.
    const seen = new Map<string, Label>();

    for (const item of items) {
      const product = item.product;
      const id = product?.id ?? item.id;
      if (seen.has(id)) continue;

      seen.set(id, {
        key: id,
        url: stockLabelUrl(origin, locale, product ? 'product' : 'item', id),
        title: product?.name ?? item.name,
        subtitle: product?.brand ?? null,
        footnote: item.category?.name ?? null,
      });
    }

    labels = [...seen.values()].toSorted((a, b) => a.title.localeCompare(b.title, locale));
  } else {
    labels = items.map((item) => ({
      key: item.id,
      url: stockLabelUrl(origin, locale, 'item', item.id),
      // The product's name leads where there is one, so the sticker reads the
      // way the catalogue does rather than repeating the shared half twice.
      title: item.product?.name ?? item.name,
      subtitle: item.variantName,
      footnote: [item.category?.name, item.code ? `#${item.code}` : null]
        .filter(Boolean)
        .join(' · ') || null,
    }));
  }

  const isFiltered = Boolean(query || categoryFilter);

  return (
    <>
      {/* Marked rather than found by its position in the layout: printing one
          sticker has to drop this heading, and a selector that walked up to
          `main` would have been a rule about `AppShell`'s nesting — silently
          wrong the day that changes, and wrong only on paper, where nobody
          would think to look. */}
      <div data-sheet-chrome>
        <PageHeader
          title={t('labelsTitle')}
          subtitle={t('labelsSubtitle')}
          trail={[{ href: '/stock', label: t('title') }, { label: t('labels') }]}
          actions={
            <>
              <Link href="/stock" className="btn btn-secondary">
                <ArrowLeft size={18} aria-hidden />
                {t('title')}
              </Link>
              {labels.length > 0 ? (
                <PrintLabelsButton label={t('labelsPrint', { count: labels.length })} />
              ) : null}
            </>
          }
        />
      </div>

      <div data-print-hide>
        <p className="mb-4 text-ink-soft">{t('labelsHint')}</p>

        {allItems.length > 0 ? (
          <FilterBar
            basePath="/stock/labels"
            label={tc('filters')}
            values={{ q: query, category: categoryFilter, kind, size }}
            chips={{
              name: 'kind',
              label: t('labelsKindLabel'),
              options: [
                { value: 'item', label: t('labelsKindItem') },
                { value: 'product', label: t('labelsKindProduct') },
              ],
            }}
            search={{ name: 'q', label: tc('search'), placeholder: t('catalogSearchPlaceholder') }}
            selects={[
              {
                name: 'category',
                label: t('category'),
                anyLabel: t('anyCategory'),
                options: [
                  ...categories.map((option) => ({ value: option.id, label: option.name })),
                  { value: NO_CATEGORY, label: t('uncategorized') },
                ],
              },
              {
                name: 'size',
                label: t('labelsSizeLabel'),
                anyLabel: t('labelsSizeMd'),
                anyValue: 'md',
                options: [
                  { value: 'sm', label: t('labelsSizeSm') },
                  { value: 'lg', label: t('labelsSizeLg') },
                ],
              },
            ]}
            submitLabel={tc('filter')}
            clearLabel={tc('clearFilters')}
            summary={t('showing', { count: labels.length, total: allItems.length })}
          />
        ) : null}
      </div>

      {labels.length === 0 ? (
        <div className="card" data-print-hide>
          <EmptyState
            icon={<QrCodeIcon size={40} aria-hidden />}
            title={isFiltered ? t('emptyFiltered') : t('empty')}
          />
        </div>
      ) : (
        // Millimetres, because the only thing that matters about this grid is
        // how wide a sticker comes out of the printer. `auto-fill` is what makes
        // one layout serve both a phone screen and A4.
        <ul
          className="label-sheet"
          style={{ '--label-size': SIZES[size] } as React.CSSProperties}
        >
          {labels.map((label) => (
            <LabelCard
              key={label.key}
              title={label.title}
              subtitle={label.subtitle}
              footnote={label.footnote}
            >
              {/* Drawn on the server and handed to the card as a child, so the
                  encoder never reaches the browser and the symbol travels once
                  however many places the card renders it. */}
              <QrCode value={label.url} className="label-qr" title={label.title} />
            </LabelCard>
          ))}
        </ul>
      )}
    </>
  );
}
