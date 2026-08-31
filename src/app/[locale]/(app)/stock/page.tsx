import {
  ClipboardCheck,
  Images,
  Minus,
  Package,
  Pencil,
  Plus,
  ScanBarcode,
  Truck,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { BatchFormDialog } from '@/components/stock/BatchFormDialog';
import { BatchList } from '@/components/stock/BatchList';
import { PhotoTile } from '@/components/stock/PhotoTile';
import { ReorderPanel } from '@/components/stock/ReorderPanel';
import { StockAlerts } from '@/components/stock/StockAlerts';
import { TakeOutForm } from '@/components/stock/TakeOutForm';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  adjustStock,
  clearOrdered,
  deleteStockItem,
  markOrdered,
  restoreStockItem,
} from '@/lib/actions/stock';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getStockCategories } from '@/lib/queries';
import { getReorderSuggestions } from '@/lib/reorder';
import { photoUrl } from '@/lib/stock-photos';
import { summariseBatches, usableQuantity } from '@/lib/expiry';
import { orderLateBy } from '@/lib/stock-alerts';
import { cn, matches } from '@/lib/utils';

export const dynamic = "force-dynamic";

/** Sentinel for "this material has no category" — a category id is a uuid, never this. */
const NO_CATEGORY = "__none__";

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string; q?: string; category?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.view');
  const canEdit = user.permissions.includes('stock.edit');
  const canDelete = user.permissions.includes('stock.delete');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');
  const tscan = await getTranslations('scan');
  const format = await getFormatter();

  // On its own, and first: the load that ships this feature is also the one that
  // moves the practice's old typed-in categories onto real rows, and the
  // materials have to be read *after* that rather than beside it — otherwise the
  // first render of the storage room files every last box under "Uncategorized".
  const categories = await getStockCategories();

  const [allItems, archived, usedRows, reorderLines] = await Promise.all([
    prisma.stockItem.findMany({
      where: ACTIVE_STOCK,
      orderBy: [{ name: 'asc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        // `id` and `photoKey` as well as the name: a variant with no picture of
        // its own shows the product's, exactly as it does on the catalogue.
        product: { select: { id: true, name: true, photoKey: true } },
        batches: { orderBy: { expiryDate: 'asc' } },
      },
    }),
    // No suppliers and no product names here any more: they were read to fill
    // the edit dialog's selects, and editing is its own page now — which reads
    // them for the one material being corrected instead of for all seventy on
    // every load of this list.
    //
    // Retired materials keep their ledger, so the usage chart and the burn rate
    // still read correctly. They are listed only so one archived by mistake is
    // recoverable without a database client.
    canEdit
      ? prisma.stockItem.findMany({
          where: { archivedAt: { not: null } },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, quantity: true, archivedAt: true },
        })
      : Promise.resolve([]),
    // Everything ever taken off the shelf, per material. All time, deliberately:
    // this is the spreadsheet's "Used Stock" — how much of what was bought has
    // gone — not a rate.
    prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: { delta: { lt: 0 } },
      _sum: { delta: true },
    }),
    getReorderSuggestions(),
  ]);
  // What is actually *usable*, which is the figure the dashboard's low-stock
  // list has always read. This page counted raw boxes instead, so the two
  // disagreed whenever anything had expired — the dashboard could say four
  // materials were low and the filtered list it linked straight to could show
  // two, with nothing on either screen to explain the difference.
  const usable = new Map(
    allItems.map((item) => [
      item.id,
      usableQuantity(item.quantity, item.batches),
    ]),
  );
  const usableOf = (item: { id: string; quantity: number }) =>
    usable.get(item.id) ?? item.quantity;

  const lowCount = allItems.filter(
    (item) => usableOf(item) <= item.minLimit,
  ).length;

  const used = new Map(
    usedRows.map((row) => [row.itemId, Math.abs(row._sum.delta ?? 0)]),
  );

  // Expiry is a second, independent way for the cupboard to be wrong: an
  // expired box counts as stock in every other check on this page.
  const expiry = new Map(
    allItems.map((item) => [item.id, summariseBatches(item.batches)]),
  );
  const expiredCount = [...expiry.values()].filter(
    (s) => s.level === "EXPIRED",
  ).length;
  const expiringCount = [...expiry.values()].filter(
    (s) => s.level === "SOON",
  ).length;
  const day = today();
  const todayKey = toDateKey(day);

  const { filter, q, category } = await searchParams;
  // `filter=low` is also the dashboard's stock-alert link — keep the value stable.
  const level = filter === "low" || filter === "out" ? filter : '';
  const query = (q ?? '').trim();
  const categoryFilter = category ?? '';

  const items = allItems.filter((item) => {
    if (level === "low" && usableOf(item) > item.minLimit) return false;
    if (level === "out" && usableOf(item) > 0) return false;
    // The article number is what staff read off a shelf label and off an order
    // form, so it has to be a thing you can type into the search box.
    if (
      query &&
      !matches(item.name, query) &&
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

  const isFiltered = Boolean(level || query || categoryFilter);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          canEdit ? (
            <>
              {/* The same storage room with the pictures on. Offered here rather
                  than only in the rail, because "which one is it?" is asked
                  while standing on this list. */}
              <Link href="/stock/catalog" className="btn btn-secondary">
                <Images size={18} aria-hidden />
                {t('catalog')}
              </Link>
              {/* Reading the box is now how stock moves in both directions, so
                  it leads — the manual controls further down the page are the
                  fallback for a symbol too damaged to read, not the main road. */}
              <Link href="/stock/scan" className="btn btn-secondary">
                <ScanBarcode size={18} aria-hidden />
                {tscan('action')}
              </Link>
              {/* Counting the room is the interaction bulk stock actually gets,
                  so it sits beside "new material" rather than buried in a menu. */}
              <Link href="/stock/stocktake" className="btn btn-secondary">
                <ClipboardCheck size={18} aria-hidden />
                {t('stocktake')}
              </Link>
              {/* A screen of its own rather than a modal — see `NewStockForm`. */}
              <Link href="/stock/new" className="btn btn-primary">
                <Plus size={20} aria-hidden />
                {t('new')}
              </Link>
            </>
          ) : null
        }
        trail={[{ label: t('title') }]}
      />

      {/* Low stock, expired lots and the ninety-day horizon are three ways for
          the same cupboard to be wrong, so they are read in one place — and each
          one is the card you press to see which materials it means. Skipped
          entirely on an empty storeroom, where "everything in stock" would be a
          lie of omission. */}
      {allItems.length > 0 ? (
        <StockAlerts
          lowCount={lowCount}
          expiredCount={expiredCount}
          expiringCount={expiringCount}
          canEdit={canEdit}
        />
      ) : null}

      {/* Nothing to narrow down until the shelf exists. */}
      {allItems.length > 0 ? (
        <FilterBar
          basePath="/stock"
          label={tc('filters')}
          values={{ filter: level, q: query, category: categoryFilter }}
          chips={{
            name: 'filter',
            label: t('filterLevelLabel'),
            options: [
              { value: '', label: t('filterAll') },
              { value: 'low', label: t('filterLow') },
              { value: 'out', label: t('filterOut') },
            ],
          }}
          search={{
            name: 'q',
            label: tc('search'),
            placeholder: t('searchPlaceholder'),
          }}
          selects={[
            {
              name: 'category',
              label: t('category'),
              anyLabel: t('anyCategory'),
              options: [
                ...categories.map((option) => ({
                  value: option.id,
                  label: option.name,
                })),
                { value: NO_CATEGORY, label: t('uncategorized') },
              ],
            },
          ]}
          submitLabel={tc('filter')}
          clearLabel={tc('clearFilters')}
          summary={t('showing', {
            count: items.length,
            total: allItems.length,
          })}
        />
      ) : null}

      {/* What to buy, before what is on the shelf: the shelf is a fact, the
          order is the decision that needs making. Quiet on its own when
          nothing is worth saying — see `getReorderSuggestions`. */}
      <ReorderPanel lines={reorderLines} canEdit={canEdit} />

      {/* Retired materials. Folded away and last, because the point of retiring
          one is that it stops being part of the daily list — but recoverable,
          because "archived by mistake" must not need a database client. */}
      {canEdit && archived.length > 0 ? (
        <details className="card mb-6">
          <summary className="cursor-pointer list-none px-5 py-4 text-lead font-bold text-ink">
            {t('archivedTitle')}
            <span className="ml-2 font-normal text-ink-soft">
              ({archived.length})
            </span>
          </summary>

          <ul className="divide-y divide-line border-t border-line">
            {archived.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-body font-bold text-ink">
                    {item.name}
                  </p>
                  <p className="text-meta text-ink-soft">
                    {t('inStock', { qty: item.quantity })}
                    {item.archivedAt
                      ? ` · ${t("archivedOn", {
                          date: format.dateTime(item.archivedAt, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }),
                        })}`
                      : ''}
                  </p>
                </div>

                <ActionForm action={restoreStockItem} values={{ id: item.id }}>
                  <button type="submit" className="btn btn-secondary btn-sm">
                    <Undo2 size={17} aria-hidden />
                    {t('restore')}
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </details>
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
        /* One card per material rather than a row in a striped list.

            The list had it backwards: it was eight controls wide and 56 pixels
            of photograph tall, and what somebody standing at the shelf needs
            first is *which box is this* — which is the picture. So the picture
            leads at 144px, what the material is reads down the middle, and
            everything pressable collects into one column on the right, ordered
            by how often it is pressed and with the irreversible one held
            apart. */
        <ul className="grid gap-4">
          {items.map((item) => {
            // The picture. A variant with no photograph of its own shows the
            // product's, exactly as it does on the catalogue.
            const photo = item.photoKey
              ? photoUrl('item', item.id, item.photoKey)
              : item.product?.photoKey
                ? photoUrl('product', item.product.id, item.product.photoKey)
                : null;

            // Two different questions, and they were one variable. What the
            // badges report is what can still be *used*; what the buttons may
            // move is what is physically on the shelf. An item whose every box
            // has expired reads "out" and must still be takeable — taking it out
            // is how it gets binned.
            const usableNow = usableOf(item);
            const isEmpty = item.quantity === 0;
            const isOut = usableNow === 0;
            const isLow = usableNow <= item.minLimit;

            return (
              <li
                key={item.id}
                className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5"
              >
                <PhotoTile
                  kind="item"
                  id={item.id}
                  name={item.name}
                  src={photo}
                  inherited={!item.photoKey && photo !== null}
                  canEdit={canEdit}
                  size="xl"
                  allowRemove={false}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <p className="text-title font-bold text-ink">
                      {item.name}
                    </p>
                    {/* Which one of the eight it is — the shade, the size, the
                        gauge. Chipped rather than run into the name, so a list
                        of siblings reads down the variant column. */}
                    {item.variantName ? (
                      <span className="rounded-md bg-paper px-2 py-0.5 text-meta font-semibold text-ink-soft">
                        {item.variantName}
                      </span>
                    ) : null}
                    {/* The number on the shelf label, beside the name it labels. */}
                    {item.code ? (
                      <span className="font-semibold tabular-nums text-ink-faint">
                        #{item.code}
                      </span>
                    ) : null}
                    {/* Pushed to the edge so the badges line up down the page:
                        "which of these is low" is answered by scanning one
                        column, not by reading every name to its end. */}
                    <span className="ml-auto">
                      {isOut ? (
                        <Badge tone="danger">{t('out')}</Badge>
                      ) : isLow ? (
                        <Badge tone="warn">{t('low')}</Badge>
                      ) : (
                        <Badge tone="ok">{t('ok')}</Badge>
                      )}
                    </span>
                  </div>

                  {/* Where it comes from and where it is filed — the two things
                      read while writing an order. */}
                  <p className="mt-1.5 text-body text-ink-soft">
                    {item.supplier ? `${item.supplier.name} · ` : ''}
                    {item.category?.name || t('uncategorized')}
                  </p>

                  {/* The bookkeeping, a step quieter than the name above it. */}
                  <p className="mt-0.5 text-meta text-ink-faint">
                    {t('minShort', { min: item.minLimit })} ·{' '}
                    {/* How much of what was bought has gone. Quiet until there
                        is something to say. */}
                    {(used.get(item.id) ?? 0) > 0
                      ? `${t("usedTotal", { qty: used.get(item.id) ?? 0 })} · `
                      : ''}
                    {t('lastUpdated', {
                      date: format.dateTime(item.updatedAt, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }),
                    })}
                  </p>

                  {/* An order already placed answers the low-stock badge above
                      it, so the two are read together rather than separately.

                      A `div` rather than a `p`: this is a badge and a button, not
                      a sentence, and a `p` cannot legally hold the `form` that
                      `ActionForm` renders. The browser closes the paragraph
                      before the form and reparents it, which does not match what
                      the server sent — React then throws away the whole page's
                      tree and rebuilds it on the client, every load. */}
                  {item.orderedAt ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/* Late is a different badge, not a differently worded
                          one. `expectedAt` was printed here from the day it
                          existed and compared to today by nothing, so this
                          badge said "on order by 10 Aug" in a calm blue for as
                          long as the material sat undelivered — which is the
                          one state it most needed to shout about. */}
                      {orderLateBy(item, day) > 0 ? (
                        <Badge tone="danger">
                          {t('onOrderLate', { days: orderLateBy(item, day) })}
                        </Badge>
                      ) : (
                        <Badge tone="brand">
                          {item.expectedAt
                            ? t('onOrderBy', {
                                date: format.dateTime(item.expectedAt, {
                                  day: 'numeric',
                                  month: 'short',
                                }),
                              })
                            : t('onOrder')}
                        </Badge>
                      )}
                      {canEdit ? (
                        <ActionForm
                          action={clearOrdered}
                          values={{ id: item.id }}
                        >
                          <button
                            type="submit"
                            className="text-meta font-semibold text-ink-faint underline hover:text-ink"
                          >
                            {t('clearOrdered')}
                          </button>
                        </ActionForm>
                      ) : null}
                    </div>
                  ) : null}

                  <BatchList
                    batches={item.batches.map((batch) => ({
                      id: batch.id,
                      lotNumber: batch.lotNumber ?? '',
                      expiryDate: batch.expiryDate
                        ? batch.expiryDate.toISOString()
                        : '',
                      purchasedAt: batch.purchasedAt
                        ? batch.purchasedAt.toISOString()
                        : '',
                      manufacturedAt: batch.manufacturedAt
                        ? batch.manufacturedAt.toISOString()
                        : '',
                      quantity: batch.quantity,
                      notes: batch.notes ?? '',
                    }))}
                    canEdit={canEdit}
                  />
                </div>

                {/* Everything pressable, in one column, in the order it is
                    reached for: the count, the two bulk movements, then the
                    paperwork. */}
                <div className="flex w-full flex-col gap-2 sm:w-60 sm:shrink-0">
                  {/* The count and the fast ±1, as one segmented control. They
                      were three loose grey squares with the number floating
                      between two of them, which read as three unrelated verbs
                      rather than as one number you nudge.

                      `contents` on the two forms: each button is its own `form`,
                      and a form between the row and its buttons would break the
                      shared border into three separate boxes. */}
                  <div
                    role="group"
                    aria-label={t('adjust')}
                    className="flex items-stretch overflow-hidden rounded-xl border border-line-strong bg-surface"
                  >
                    {canEdit ? (
                      <ActionForm
                        action={adjustStock}
                        values={{ id: item.id, delta: -1 }}
                        className="contents"
                      >
                        <button
                          type="submit"
                          className="flex w-12 shrink-0 items-center justify-center border-r border-line-strong text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                          title={t('use')}
                          disabled={isEmpty}
                        >
                          <Minus size={18} aria-hidden />
                          <span className="sr-only">{t('use')}</span>
                        </button>
                      </ActionForm>
                    ) : null}

                    <span className="flex flex-1 flex-col items-center justify-center px-2 py-2 leading-none">
                      <span
                        className={cn(
                          'text-figure font-bold tabular-nums',
                          isLow ? 'text-warn' : 'text-ink',
                        )}
                      >
                        {item.quantity}
                      </span>
                      <span className="mt-1 text-caption font-semibold text-ink-soft">
                        {t('boxes', { count: item.quantity })}
                      </span>
                    </span>

                    {canEdit ? (
                      <ActionForm
                        action={adjustStock}
                        values={{ id: item.id, delta: 1 }}
                        className="contents"
                      >
                        <button
                          type="submit"
                          className="flex w-12 shrink-0 items-center justify-center border-l border-line-strong text-ink-soft transition-colors hover:bg-paper hover:text-ink"
                          title={t('restock')}
                        >
                          <Plus size={18} aria-hidden />
                          <span className="sr-only">{t('restock')}</span>
                        </button>
                      </ActionForm>
                    ) : null}
                  </div>

                  {/* Six of something is one entry, not six presses. Hidden at
                      zero, where there is nothing to take. */}
                  {canEdit && !isEmpty ? (
                    <TakeOutForm itemId={item.id} max={item.quantity} />
                  ) : null}

                  {/* A delivery is one press: the count goes up, the lot and its
                      expiry are recorded, and the order flag clears. Directly
                      under its opposite, and both of them named — as two icons
                      they differed only by the direction of a small arrow. */}
                  {canEdit ? (
                    <BatchFormDialog
                      itemId={item.id}
                      itemName={item.name}
                      today={todayKey}
                    />
                  ) : null}

                  {/* The paperwork, below a rule and quieter: pressed once a
                      month, not once a day. Retiring the material sits apart at
                      the far end, because it is the one press in this column
                      that pressing something else will not undo. */}
                  {canEdit || canDelete ? (
                    <div className="mt-0.5 flex items-center gap-1.5 border-t border-line pt-2.5">
                      {canEdit && !item.orderedAt && isLow ? (
                        <ActionForm
                          action={markOrdered}
                          values={{ id: item.id }}
                        >
                          <button
                            type="submit"
                            className="btn btn-secondary btn-sm"
                            title={t('markOrdered')}
                          >
                            <Truck size={17} aria-hidden />
                            <span className="sr-only">{t('markOrdered')}</span>
                          </button>
                        </ActionForm>
                      ) : null}

                      {/* A link, not a dialog: correcting a material is the same
                          ten questions as recording one, and they are asked on a
                          page. */}
                      {canEdit ? (
                        <Link
                          href={`/stock/${item.id}/edit`}
                          className="btn btn-secondary btn-sm"
                          title={t('edit')}
                        >
                          <Pencil size={17} aria-hidden />
                          <span className="sr-only">{t('edit')}</span>
                        </Link>
                      ) : null}

                      {canDelete ? (
                        <ActionForm
                          action={deleteStockItem}
                          values={{ id: item.id }}
                          confirmMessage={t('confirmRetire')}
                          className="ml-auto"
                        >
                          <button
                            type="submit"
                            className="btn btn-danger btn-sm"
                            title={tc('delete')}
                          >
                            <Trash2 size={17} aria-hidden />
                            <span className="sr-only">{tc('delete')}</span>
                          </button>
                        </ActionForm>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
