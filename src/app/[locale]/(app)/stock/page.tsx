import { Minus, Package, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { ReorderPanel } from '@/components/stock/ReorderPanel';
import { StockFormDialog } from '@/components/stock/StockFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { adjustStock, deleteStockItem } from '@/lib/actions/stock';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { getReorderSuggestions } from '@/lib/reorder';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.view');
  const canEdit = user.permissions.includes('stock.edit');
  const canDelete = user.permissions.includes('stock.delete');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const { filter } = await searchParams;
  const lowOnly = filter === 'low';

  const [allItems, reorderLines] = await Promise.all([
    prisma.stockItem.findMany({ orderBy: [{ name: 'asc' }] }),
    getReorderSuggestions(),
  ]);
  const lowCount = allItems.filter((item) => item.quantity <= item.minLimit).length;
  const items = lowOnly ? allItems.filter((item) => item.quantity <= item.minLimit) : allItems;

  const categories = [...new Set(allItems.map((i) => i.category).filter(Boolean))] as string[];
  const units = [...new Set(allItems.map((i) => i.unit))];

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={canEdit ? <StockFormDialog categories={categories} units={units} /> : null}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line-strong p-1">
          <Link
            href="/stock"
            aria-current={lowOnly ? undefined : 'true'}
            className={cn(
              'min-h-10 rounded-md px-3.5 py-1.5 font-bold no-underline transition-colors',
              lowOnly ? 'text-ink-soft hover:bg-paper hover:text-ink' : 'bg-brand-dark text-white',
            )}
          >
            {t('filterAll')}
          </Link>
          <Link
            href="/stock?filter=low"
            aria-current={lowOnly ? 'true' : undefined}
            className={cn(
              'min-h-10 rounded-md px-3.5 py-1.5 font-bold no-underline transition-colors',
              lowOnly ? 'bg-brand-dark text-white' : 'text-ink-soft hover:bg-paper hover:text-ink',
            )}
          >
            {t('filterLow')}
          </Link>
        </div>

        {lowCount > 0 ? (
          <p className="flex items-center gap-2 font-bold text-warn">
            <TriangleAlert size={19} aria-hidden />
            {t('lowAlert', { count: lowCount })}
          </p>
        ) : null}
      </div>

      {/* What to buy comes before what is on the shelf: the shelf is a fact,
          the order is the decision that needs making. */}
      {canEdit ? <ReorderPanel lines={reorderLines} /> : null}

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package size={40} aria-hidden />}
            title={lowOnly ? t('lowAlert', { count: 0 }) : t('empty')}
            action={
              lowOnly || !canEdit ? null : (
                <StockFormDialog categories={categories} units={units} />
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
                    {item.category || t('uncategorized')} · {t('minShort', { min: item.minLimit })} ·{' '}
                    {t('lastUpdated', {
                      date: format.dateTime(item.updatedAt, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }),
                    })}
                  </p>
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
                  {canEdit ? (
                    <StockFormDialog
                      item={{
                        id: item.id,
                        name: item.name,
                        category: item.category ?? '',
                        quantity: item.quantity,
                        minLimit: item.minLimit,
                        unit: item.unit,
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
