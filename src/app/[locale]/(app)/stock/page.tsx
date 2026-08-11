import {
  CalendarClock,
  Minus,
  Package,
  Plus,
  Truck,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { BatchFormDialog } from '@/components/stock/BatchFormDialog';
import { BatchList } from '@/components/stock/BatchList';
import { ReorderPanel } from '@/components/stock/ReorderPanel';
import { SupplierFormDialog } from '@/components/stock/SupplierFormDialog';
import { StockFormDialog } from '@/components/stock/StockFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  adjustStock,
  clearOrdered,
  deleteStockItem,
  deleteSupplier,
  markOrdered,
} from '@/lib/actions/stock';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { summariseBatches } from '@/lib/expiry';
import { getReorderSuggestions } from '@/lib/reorder';
import { cn, matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Sentinel for "this material has no category" — a real category can never be empty. */
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
  const tsup = await getTranslations('suppliers');
  const format = await getFormatter();

  const [allItems, reorderLines, suppliers] = await Promise.all([
    prisma.stockItem.findMany({
      orderBy: [{ name: 'asc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        batches: { orderBy: { expiryDate: 'asc' } },
      },
    }),
    getReorderSuggestions(),
    prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    }),
  ]);
  const lowCount = allItems.filter((item) => item.quantity <= item.minLimit).length;

  // Expiry is a second, independent way for the cupboard to be wrong: an
  // expired box counts as stock in every other check on this page.
  const expiry = new Map(allItems.map((item) => [item.id, summariseBatches(item.batches)]));
  const expiredCount = [...expiry.values()].filter((s) => s.level === 'EXPIRED').length;
  const expiringCount = [...expiry.values()].filter((s) => s.level === 'SOON').length;
  const todayKey = toDateKey(today());

  const categories = [...new Set(allItems.map((i) => i.category).filter(Boolean))] as string[];
  const units = [...new Set(allItems.map((i) => i.unit))];

  const { filter, q, category } = await searchParams;
  // `filter=low` is also the dashboard's stock-alert link — keep the value stable.
  const level = filter === 'low' || filter === 'out' ? filter : '';
  const query = (q ?? '').trim();
  const categoryFilter = category ?? '';

  const items = allItems.filter((item) => {
    if (level === 'low' && item.quantity > item.minLimit) return false;
    if (level === 'out' && item.quantity > 0) return false;
    if (query && !matches(item.name, query) && !matches(item.category ?? '', query)) return false;
    if (categoryFilter === NO_CATEGORY) {
      if (item.category) return false;
    } else if (categoryFilter && item.category !== categoryFilter) {
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
            <StockFormDialog categories={categories} units={units} suppliers={suppliers} />
          ) : null
        }
      />

      {lowCount > 0 ? (
        <p className="mb-4 flex items-center gap-2 font-bold text-warn">
          <TriangleAlert size={19} aria-hidden />
          {t('lowAlert', { count: lowCount })}
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
                ...categories.map((value) => ({ value, label: value })),
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
      {canEdit ? <ReorderPanel lines={reorderLines} /> : null}

      {/* Who to buy it from. Sits under the order list because that is when the
          question comes up, and folded away so it never crowds the shelf. */}
      {canEdit ? (
        <details className="card mb-6">
          <summary className="cursor-pointer list-none px-5 py-4 text-[1.1rem] font-bold text-ink">
            {tsup('title')}
            <span className="ml-2 font-normal text-ink-soft">({suppliers.length})</span>
          </summary>

          <div className="border-t border-line px-5 py-4">
            <SupplierFormDialog />
          </div>

          {suppliers.length > 0 ? (
            <ul className="divide-y divide-line border-t border-line">
              {suppliers.map((supplier) => (
                <li
                  key={supplier.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[1.05rem] font-bold text-ink">{supplier.name}</p>
                    <p className="text-[0.92rem] text-ink-soft">
                      {[supplier.phone, supplier.email].filter(Boolean).join(' · ') ||
                        tsup('noContact')}
                      {' · '}
                      {tsup('itemCount', { count: supplier._count.items })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <SupplierFormDialog
                      supplier={{
                        id: supplier.id,
                        name: supplier.name,
                        phone: supplier.phone ?? '',
                        email: supplier.email ?? '',
                        notes: supplier.notes ?? '',
                      }}
                    />
                    {canDelete ? (
                      <ActionForm
                        action={deleteSupplier}
                        values={{ id: supplier.id }}
                        confirmMessage={tc('confirmDelete')}
                      >
                        <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                          <Trash2 size={17} aria-hidden />
                          <span className="sr-only">{tc('delete')}</span>
                        </button>
                      </ActionForm>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      ) : null}

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package size={40} aria-hidden />}
            title={isFiltered ? t('emptyFiltered') : t('empty')}
            action={
              isFiltered || !canEdit ? null : (
                <StockFormDialog
                  categories={categories}
                  units={units}
                  suppliers={suppliers}
                />
              )
            }
          />
        </div>
      ) : (
        <ul className="card divide-y-2 divide-line">
          {items.map((item) => {
            const isOut = item.quantity === 0;
            const isLow = item.quantity <= item.minLimit;

            return (
              <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-52 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[1.12rem] font-bold text-ink">{item.name}</p>
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
                    {item.category || t('uncategorized')} · {t('minShort', { min: item.minLimit })} ·{' '}
                    {t('lastUpdated', {
                      date: format.dateTime(item.updatedAt, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }),
                    })}
                  </p>

                  {/* An order already placed answers the low-stock badge above
                      it, so the two are read together rather than separately. */}
                  {item.orderedAt ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2">
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
                    </p>
                  ) : null}

                  <BatchList
                    batches={item.batches.map((batch) => ({
                      id: batch.id,
                      lotNumber: batch.lotNumber ?? '',
                      expiryDate: batch.expiryDate ? batch.expiryDate.toISOString() : '',
                      quantity: batch.quantity,
                      notes: batch.notes ?? '',
                    }))}
                    unit={item.unit}
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
                </div>

                <div className="flex items-center gap-2">
                  {/* A delivery is one press: the count goes up, the lot and its
                      expiry are recorded, and the order flag clears. */}
                  {canEdit ? (
                    <BatchFormDialog
                      itemId={item.id}
                      itemName={item.name}
                      unit={item.unit}
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
                        category: item.category ?? '',
                        quantity: item.quantity,
                        minLimit: item.minLimit,
                        unit: item.unit,
                        supplierId: item.supplierId ?? '',
                      }}
                      categories={categories}
                      units={units}
                      compact
                    />
                  ) : null}
                  {canDelete ? (
                    <ActionForm
                      action={deleteStockItem}
                      values={{ id: item.id }}
                      confirmMessage={tc('confirmDelete')}
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
