import {
  CalendarClock,
  ClipboardCheck,
  Minus,
  Package,
  Plus,
  ScanBarcode,
  Truck,
  Trash2,
  TriangleAlert,
  Undo2,
  Wallet,
} from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { BatchFormDialog } from '@/components/stock/BatchFormDialog';
import { BatchList } from '@/components/stock/BatchList';
import { ReorderPanel } from '@/components/stock/ReorderPanel';
import { StockFormDialog } from '@/components/stock/StockFormDialog';
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
import { moneyFormat, moneyToInput, moneyToNumber, stockValue } from '@/lib/money';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getClinicProfile, getStockCategories } from '@/lib/queries';
import { summariseBatches } from '@/lib/expiry';
import { getReorderSuggestions } from '@/lib/reorder';
import { cn, matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Sentinel for "this material has no category" — a category id is a uuid, never this. */
const NO_CATEGORY = '__none__';

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

  const [allItems, reorderLines, suppliers, archived, usedRows, profile] = await Promise.all([
    prisma.stockItem.findMany({
      where: ACTIVE_STOCK,
      orderBy: [{ name: 'asc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        batches: { orderBy: { expiryDate: 'asc' } },
      },
    }),
    getReorderSuggestions(),
    // Only to fill the material form's "bought from" select — the suppliers
    // themselves are kept on their own screen.
    prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    // Retired materials keep their ledger, so the usage chart and the burn rate
    // still read correctly. They are listed only so one archived by mistake is
    // recoverable without a database client.
    canEdit
      ? prisma.stockItem.findMany({
          where: { archivedAt: { not: null } },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, unit: true, quantity: true, archivedAt: true },
        })
      : Promise.resolve([]),
    // Everything ever taken off the shelf, per material. All time, deliberately:
    // this is the spreadsheet's "Used Stock" — how much of what was bought has
    // gone — not a rate, which the reorder panel already works out over 90 days.
    prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: { delta: { lt: 0 } },
      _sum: { delta: true },
    }),
    getClinicProfile(),
  ]);
  const lowCount = allItems.filter((item) => item.quantity <= item.minLimit).length;

  const currency = profile.currency;
  const used = new Map(usedRows.map((row) => [row.itemId, Math.abs(row._sum.delta ?? 0)]));

  // What the room is worth, and how much of it nobody has priced — a total that
  // silently skips half the shelf is worse than no total at all.
  const value = stockValue(allItems);
  const anyPriced = allItems.some((item) => item.unitPrice !== null);

  // Expiry is a second, independent way for the cupboard to be wrong: an
  // expired box counts as stock in every other check on this page.
  const expiry = new Map(allItems.map((item) => [item.id, summariseBatches(item.batches)]));
  const expiredCount = [...expiry.values()].filter((s) => s.level === 'EXPIRED').length;
  const expiringCount = [...expiry.values()].filter((s) => s.level === 'SOON').length;
  const todayKey = toDateKey(today());

  const units = [...new Set(allItems.map((i) => i.unit))];

  const { filter, q, category } = await searchParams;
  // `filter=low` is also the dashboard's stock-alert link — keep the value stable.
  const level = filter === 'low' || filter === 'out' ? filter : '';
  const query = (q ?? '').trim();
  const categoryFilter = category ?? '';

  const items = allItems.filter((item) => {
    if (level === 'low' && item.quantity > item.minLimit) return false;
    if (level === 'out' && item.quantity > 0) return false;
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

      {lowCount > 0 ? (
        <p className="mb-4 flex items-center gap-2 font-bold text-warn">
          <TriangleAlert size={19} aria-hidden />
          {t('lowAlert', { count: lowCount })}
        </p>
      ) : null}

      {/* What the cupboard is worth. Says out loud how much of the shelf it
          could not price, because a valuation that quietly omits a third of the
          room reads as a full answer. */}
      {anyPriced ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-ink-soft">
          <Wallet size={19} aria-hidden />
          <span className="font-bold text-ink">
            {t('stockValue', { value: format.number(value.total, moneyFormat(currency, value.total)) })}
          </span>
          {value.unpriced > 0 ? <span>{t('unpricedNote', { count: value.unpriced })}</span> : null}
        </p>
      ) : null}

      {expiredCount > 0 || expiringCount > 0 ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 font-bold text-danger">
          <CalendarClock size={19} aria-hidden />
          {expiredCount > 0 ? t('expiredAlert', { count: expiredCount }) : null}
          {expiredCount > 0 && expiringCount > 0 ? ' · ' : null}
          {expiringCount > 0 ? (
            <span className="text-warn">{t('expiringAlert', { count: expiringCount })}</span>
          ) : null}
          {/* The line said which shelves were wrong and stopped there — finding
              the actual box meant opening each material in turn. This is the
              lot-by-lot list, with the one action that answers it. */}
          {canEdit ? (
            <Link href="/stock/expiry" className="btn btn-secondary btn-sm">
              {t('expiryTitle')}
            </Link>
          ) : null}
        </p>
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

      {/* What to buy comes before what is on the shelf: the shelf is a fact,
          the order is the decision that needs making. */}
      {canEdit ? <ReorderPanel lines={reorderLines} canEdit={canEdit} /> : null}

      {/* Retired materials. Folded away and last, because the point of retiring
          one is that it stops being part of the daily list — but recoverable,
          because "archived by mistake" must not need a database client. */}
      {canEdit && archived.length > 0 ? (
        <details className="card mb-6">
          <summary className="cursor-pointer list-none px-5 py-4 text-[1.1rem] font-bold text-ink">
            {t('archivedTitle')}
            <span className="ml-2 font-normal text-ink-soft">({archived.length})</span>
          </summary>

          <ul className="divide-y divide-line border-t border-line">
            {archived.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-bold text-ink">{item.name}</p>
                  <p className="text-[0.92rem] text-ink-soft">
                    {t('inStock', { qty: item.quantity, unit: item.unit })}
                    {item.archivedAt
                      ? ` · ${t('archivedOn', {
                          date: format.dateTime(item.archivedAt, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
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
        <ul className="card divide-y-2 divide-line">
          {items.map((item) => {
            const isOut = item.quantity === 0;
            const isLow = item.quantity <= item.minLimit;
            const itemPrice = moneyToNumber(item.unitPrice);

            return (
              <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-52 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[1.12rem] font-bold text-ink">{item.name}</p>
                    {/* The number on the shelf label, beside the name it labels. */}
                    {item.code ? (
                      <span className="font-semibold tabular-nums text-ink-faint">
                        #{item.code}
                      </span>
                    ) : null}
                    {isOut ? (
                      <Badge tone="danger">{t('out')}</Badge>
                    ) : isLow ? (
                      <Badge tone="warn">{t('low')}</Badge>
                    ) : (
                      <Badge tone="ok">{t('ok')}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[0.95rem] text-ink-soft">
                    {item.supplier ? `${item.supplier.name} · ` : ''}
                    {item.category?.name || t('uncategorized')} ·{' '}
                    {t('minShort', { min: item.minLimit })} ·{' '}
                    {/* What the box holds, so the count on the right is read as
                        boxes rather than pieces without anyone having to ask. */}
                    {item.packSize > 1
                      ? `${t('packOf', { count: item.packSize, unit: item.unit })} · `
                      : ''}
                    {/* What one costs, and how much of what was bought has gone —
                        the spreadsheet's two remaining columns. Both are quiet
                        until there is something to say. */}
                    {itemPrice !== null
                      ? `${t('eachCosts', {
                          price: format.number(itemPrice, moneyFormat(currency, itemPrice)),
                        })} · `
                      : ''}
                    {(used.get(item.id) ?? 0) > 0
                      ? `${t('usedTotal', { qty: used.get(item.id) ?? 0, unit: item.unit })} · `
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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
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
                      {canEdit ? (
                        <ActionForm action={clearOrdered} values={{ id: item.id }}>
                          <button
                            type="submit"
                            className="text-[0.88rem] font-semibold text-ink-faint underline hover:text-ink"
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
                      expiryDate: batch.expiryDate ? batch.expiryDate.toISOString() : '',
                      purchasedAt: batch.purchasedAt ? batch.purchasedAt.toISOString() : '',
                      manufacturedAt: batch.manufacturedAt
                        ? batch.manufacturedAt.toISOString()
                        : '',
                      // A Decimal cannot cross to a client component, and the
                      // far side of that boundary only ever formats it.
                      unitPrice: moneyToNumber(batch.unitPrice),
                      quantity: batch.quantity,
                      notes: batch.notes ?? '',
                    }))}
                    unit={item.unit}
                    currency={currency}
                    canEdit={canEdit}
                  />
                </div>

                <div className="flex items-center gap-2" aria-label={t('adjust')}>
                  {canEdit ? (
                    <ActionForm action={adjustStock} values={{ id: item.id, delta: -1 }}>
                      <button
                        type="submit"
                        className="btn btn-secondary btn-sm"
                        title={t('use')}
                        disabled={isOut}
                      >
                        <Minus size={18} aria-hidden />
                        <span className="sr-only">{t('use')}</span>
                      </button>
                    </ActionForm>
                  ) : null}

                  <span
                    className={cn(
                      'min-w-24 text-center text-[1.15rem] font-bold tabular-nums',
                      isLow ? 'text-warn' : 'text-ink',
                    )}
                  >
                    {item.quantity} <span className="text-[0.9rem] font-semibold">{item.unit}</span>
                  </span>

                  {canEdit ? (
                    <ActionForm action={adjustStock} values={{ id: item.id, delta: 1 }}>
                      <button
                        type="submit"
                        className="btn btn-secondary btn-sm"
                        title={t('restock')}
                      >
                        <Plus size={18} aria-hidden />
                        <span className="sr-only">{t('restock')}</span>
                      </button>
                    </ActionForm>
                  ) : null}

                  {/* Six of something is one entry, not six presses. Hidden at
                      zero, where there is nothing to take. */}
                  {canEdit && !isOut ? (
                    <TakeOutForm itemId={item.id} unit={item.unit} max={item.quantity} />
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {/* A delivery is one press: the count goes up, the lot and its
                      expiry are recorded, and the order flag clears. */}
                  {canEdit ? (
                    <BatchFormDialog
                      itemId={item.id}
                      itemName={item.name}
                      unit={item.unit}
                      currency={currency}
                      today={todayKey}
                    />
                  ) : null}

                  {canEdit && !item.orderedAt && item.quantity <= item.minLimit ? (
                    <ActionForm action={markOrdered} values={{ id: item.id }}>
                      <button type="submit" className="btn btn-secondary btn-sm" title={t('markOrdered')}>
                        <Truck size={18} aria-hidden />
                        <span className="sr-only">{t('markOrdered')}</span>
                      </button>
                    </ActionForm>
                  ) : null}

                  {canEdit ? (
                    <StockFormDialog
                      suppliers={suppliers}
                      item={{
                        id: item.id,
                        name: item.name,
                        code: item.code ?? '',
                        categoryId: item.categoryId ?? '',
                        quantity: item.quantity,
                        minLimit: item.minLimit,
                        unit: item.unit,
                        packSize: item.packSize,
                        orderQty: item.orderQty === null ? '' : String(item.orderQty),
                        unitPrice: moneyToInput(item.unitPrice),
                        supplierId: item.supplierId ?? '',
                      }}
                      categories={categories}
                      units={units}
                      currency={currency}
                      compact
                    />
                  ) : null}
                  {canDelete ? (
                    <ActionForm
                      action={deleteStockItem}
                      values={{ id: item.id }}
                      confirmMessage={t('confirmRetire')}
                    >
                      <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                        <Trash2 size={17} aria-hidden />
                        <span className="sr-only">{tc('delete')}</span>
                      </button>
                    </ActionForm>
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
