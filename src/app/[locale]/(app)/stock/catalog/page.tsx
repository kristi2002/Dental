import { ArrowLeft, Images, Package, Pencil, Plus, QrCode } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PhotoTile } from '@/components/stock/PhotoTile';
import { ProductFormDialog } from '@/components/stock/ProductFormDialog';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getStockCategories } from '@/lib/queries';
import { photoUrl } from '@/lib/stock-photos';
import { cn, matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Sentinel for "this material has no category" — a category id is a uuid, never this. */
const NO_CATEGORY = '__none__';

/**
 * The storage room, as a picture.
 *
 * The stock screen next door is a working list: counts to move, orders to place,
 * lots to write off. This is the other question, and the one nobody could answer
 * without walking to the cupboard — *what do we actually keep, and what does it
 * look like?* Every material in the practice, one row each, with a photograph of
 * the box in the same row as its name.
 *
 * Built for somebody who recognises a material by sight and not by an article
 * number, so the picture leads and the numbers are large enough to read across a
 * desk. Nothing here is a nested menu: the only thing that can be changed from
 * this screen is the photograph, and it is changed by pressing the photograph.
 *
 * Variants sit together under the product they are variants of. Eight shades of
 * one composite are eight rows on the shelf — separately counted, separately run
 * out of — but one thing in the storage room, and a catalogue that lists them as
 * eight unrelated materials beginning with the same four words is a catalogue
 * nobody reads twice.
 */
export default async function StockCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string; filter?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.view');
  const canEdit = user.permissions.includes('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');

  // First and on its own, for the reason the stock list does it: this is where
  // the practice's old typed-in category names become rows, and the materials
  // have to be read after it or every box files itself under "Uncategorized".
  const categories = await getStockCategories();

  // No suppliers and no product names beside it any more: they filled the edit
  // dialog's selects, and editing is a page of its own now — which reads them
  // for the one material being corrected rather than for the whole catalogue on
  // every load of this screen.
  const allItems = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: [{ name: 'asc' }],
    include: {
      supplier: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      product: {
        select: { id: true, name: true, brand: true, photoKey: true },
      },
    },
  });

  const { q, category, filter } = await searchParams;
  const query = (q ?? '').trim();
  const categoryFilter = category ?? '';
  // The one work-list this screen has: which boxes nobody has photographed yet.
  // Filling the catalogue in is an afternoon's job done a shelf at a time, and
  // without this it is done by scrolling and remembering.
  const missingOnly = filter === 'nophoto';

  const items = allItems.filter((item) => {
    if (missingOnly && (item.photoKey || item.product?.photoKey)) return false;
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
    if (categoryFilter === NO_CATEGORY) {
      if (item.categoryId) return false;
    } else if (categoryFilter && item.categoryId !== categoryFilter) {
      return false;
    }
    return true;
  });

  // One entry per product, plus one per material that belongs to no product —
  // which is most of them, and which is why a standalone material renders as a
  // group of one rather than as a second kind of row.
  type Item = (typeof items)[number];
  const groups = new Map<string, { product: Item['product']; rows: Item[] }>();
  for (const item of items) {
    const key = item.productId ?? `solo:${item.id}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(item);
    } else {
      groups.set(key, { product: item.product, rows: [item] });
    }
  }

  const ordered = [...groups.values()]
    .map((group) => ({
      ...group,
      // A2 before A3 before B1: the manufacturer's own ordering, which is the
      // one printed on the shelf.
      rows: [...group.rows].sort((a, b) =>
        (a.variantName ?? a.name).localeCompare(b.variantName ?? b.name, locale),
      ),
    }))
    .sort((a, b) =>
      (a.product?.name ?? a.rows[0].name).localeCompare(b.product?.name ?? b.rows[0].name, locale),
    );

  const withPhoto = allItems.filter((item) => item.photoKey || item.product?.photoKey).length;
  const isFiltered = Boolean(query || categoryFilter || missingOnly);

  return (
    <>
      <PageHeader
        title={t('catalogTitle')}
        subtitle={t('catalogSubtitle')}
        trail={[{ href: '/stock', label: t('title') }, { label: t('catalog') }]}
        actions={
          <>
            <Link href="/stock" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {t('title')}
            </Link>
            {/* Beside the pictures, because this is the screen somebody works
                the storage room from shelf by shelf — and sticking a QR code on
                a box is the other thing you do while holding it. */}
            <Link href="/stock/labels" className="btn btn-secondary">
              <QrCode size={18} aria-hidden />
              {t('labels')}
            </Link>
            {canEdit ? (
              <Link href="/stock/new" className="btn btn-primary">
                <Plus size={20} aria-hidden />
                {t('new')}
              </Link>
            ) : null}
          </>
        }
      />

      {/* How much of the room has a picture yet. Said once, in words, because
          "38 of 74" is the only thing that tells somebody filling this in
          whether they are nearly done. */}
      {allItems.length > 0 ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-ink-soft">
          <Images size={19} aria-hidden />
          <span className="font-bold text-ink">
            {t('photoProgress', { done: withPhoto, total: allItems.length })}
          </span>
          {canEdit && withPhoto < allItems.length ? <span>{t('photoHint')}</span> : null}
        </p>
      ) : null}

      {allItems.length > 0 ? (
        <FilterBar
          basePath="/stock/catalog"
          label={tc('filters')}
          values={{ q: query, category: categoryFilter, filter: missingOnly ? 'nophoto' : '' }}
          chips={{
            name: 'filter',
            label: t('filterPhotoLabel'),
            options: [
              { value: '', label: t('filterAll') },
              { value: 'nophoto', label: t('filterNoPhoto') },
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
          ]}
          submitLabel={tc('filter')}
          clearLabel={tc('clearFilters')}
          summary={t('showing', { count: items.length, total: allItems.length })}
        />
      ) : null}

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package size={40} aria-hidden />}
            title={isFiltered ? t('emptyFiltered') : t('empty')}
            action={
              isFiltered || !canEdit ? null : (
                <Link href="/stock/new" className="btn btn-primary">
                  <Plus size={20} aria-hidden />
                  {t('new')}
                </Link>
              )
            }
          />
        </div>
      ) : (
        // Wider apart than the padding inside a row, and deliberately so. At the
        // same 1rem on both, the gap between two cards and the gap above a row's
        // own name measure identically, and a shelf of single-variant materials
        // — which is most of them — stops reading as cards at all and becomes
        // one long stripe. The space between things has to beat the space
        // within them or it is not a boundary.
        <ul className="space-y-6">
          {ordered.map((group) => {
            const product = group.product;
            // A product band only earns its place once there is more than one
            // variant under it: for a group of one it would be the same name
            // printed twice, above a second photograph of the same box.
            const banded = Boolean(product) && group.rows.length > 1;
            const productPhoto =
              product?.photoKey ? photoUrl('product', product.id, product.photoKey) : null;

            return (
              // A firmer edge than the default card, because white-on-near-white
              // is not one: the standard hairline differs from the paper behind
              // it by about a percent of luminance, which is invisible at the
              // arm's length this screen is read at. Still a hairline, only one
              // you can see — and lifted a step so the card floats rather than
              // being drawn.
              <li
                key={product?.id ?? group.rows[0].id}
                className="card overflow-hidden border-line-strong shadow-lift"
              >
                {banded && product ? (
                  <header className="flex flex-wrap items-center gap-4 border-b-2 border-line bg-surface-soft px-4 py-4">
                    <PhotoTile
                      kind="product"
                      id={product.id}
                      name={product.name}
                      src={productPhoto}
                      canEdit={canEdit}
                      size="lg"
                    />

                    <div className="min-w-52 flex-1">
                      <p className="text-[1.25rem] font-bold text-ink">{product.name}</p>
                      <p className="mt-0.5 text-[0.95rem] text-ink-soft">
                        {product.brand ? `${product.brand} · ` : ''}
                        {t('variantsCount', { count: group.rows.length })} ·{' '}
                        {t('groupTotal', {
                          count: group.rows.reduce((sum, row) => sum + row.quantity, 0),
                        })}
                      </p>
                      <p className="mt-1 text-[0.88rem] text-ink-faint">{t('productPhotoHint')}</p>
                    </div>

                    {canEdit ? (
                      <ProductFormDialog
                        product={{ id: product.id, name: product.name, brand: product.brand ?? '' }}
                      />
                    ) : null}
                  </header>
                ) : null}

                <ul className="divide-y-2 divide-line">
                  {group.rows.map((item) => {
                    const isOut = item.quantity === 0;
                    const isLow = item.quantity <= item.minLimit;

                    // The row's own photograph, or the product's when it has
                    // none: three shades of one composite come in three
                    // identical boxes, and photographing each is work for no
                    // information.
                    const own = item.photoKey ? photoUrl('item', item.id, item.photoKey) : null;

                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'flex flex-wrap items-center gap-4 border-l-8 px-4 py-4',
                          // Colour before text: the state of a row is readable
                          // from across the room, and the badge beside the count
                          // says the same thing in words for anyone who cannot
                          // tell the two greens apart.
                          isOut ? 'border-l-danger' : isLow ? 'border-l-warn' : 'border-l-ok',
                        )}
                      >
                        <PhotoTile
                          kind="item"
                          id={item.id}
                          name={item.name}
                          src={own ?? productPhoto}
                          inherited={!own && Boolean(productPhoto)}
                          canEdit={canEdit}
                          size={banded ? 'md' : 'lg'}
                        />

                        <div className="min-w-52 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            {/* Inside a band the product's name is already
                                overhead, so the row leads with the only part
                                that differs — which is the part somebody is
                                looking for. */}
                            <p className="text-[1.15rem] font-bold text-ink">
                              {banded ? (item.variantName ?? item.name) : item.name}
                            </p>
                            {!banded && item.variantName ? (
                              <span className="font-semibold text-ink-soft">
                                {item.variantName}
                              </span>
                            ) : null}
                            {item.code ? (
                              <span className="font-semibold tabular-nums text-ink-faint">
                                #{item.code}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-0.5 text-[0.95rem] text-ink-soft">
                            {item.category?.name || t('uncategorized')}
                            {item.supplier ? ` · ${item.supplier.name}` : ''}
                          </p>
                        </div>

                        {/* The count, at the size the question deserves: this is
                            the number the whole screen exists to answer. */}
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'text-[2rem] leading-none font-bold tabular-nums',
                              isOut ? 'text-danger' : isLow ? 'text-warn' : 'text-ink',
                            )}
                          >
                            {item.quantity}
                          </span>
                          <span className="text-[0.95rem] font-semibold text-ink-soft">
                            {t('boxes', { count: item.quantity })}
                          </span>
                          {isOut ? (
                            <Badge tone="danger">{t('out')}</Badge>
                          ) : isLow ? (
                            <Badge tone="warn">{t('low')}</Badge>
                          ) : (
                            <Badge tone="ok">{t('ok')}</Badge>
                          )}
                        </div>

                        {/* `?from=catalog`, so cancelling and saving both come
                            back to the pictures rather than to the list. */}
                        {canEdit ? (
                          <Link
                            href={`/stock/${item.id}/edit?from=catalog`}
                            className="btn btn-secondary btn-sm"
                            title={t('edit')}
                          >
                            <Pencil size={18} aria-hidden />
                            <span className="sr-only">{t('edit')}</span>
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
