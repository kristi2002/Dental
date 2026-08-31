import { ArrowLeft, Plus, Tags, Trash2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CategoryFormDialog } from '@/components/stock/CategoryFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { deleteStockCategory } from '@/lib/actions/stock';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getStockCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The shelves the storage room is filed by.
 *
 * Named here, once, and picked from everywhere else — the material form offers
 * this list and nothing but this list, which is what keeps one shelf from
 * becoming three spellings of itself.
 *
 * Needs `stock.edit` rather than `stock.view`, like the stocktake: the names
 * are already on every material on the stock page, so a viewer landing here
 * would only be able to read a list they can neither add to nor change.
 */
export default async function StockCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.edit');
  const canDelete = user.permissions.includes('stock.delete');

  const t = await getTranslations('stockCategories');
  const tc = await getTranslations('common');
  const tstock = await getTranslations('stock');

  // On its own, and first: this is where the practice's old typed-in category
  // names become rows, and the materials have to be counted *after* that rather
  // than beside it — otherwise the first render of this screen reports every
  // shelf as empty.
  const categories = await getStockCategories();

  // Counted off the shelf rather than with `_count`, which would include retired
  // materials — the number is there to answer "what does dropping this shelf
  // affect", and a retired material is not affected by anything.
  const filed = await prisma.stockItem.findMany({
    where: { ...ACTIVE_STOCK, categoryId: { not: null } },
    select: { categoryId: true },
  });

  const itemsPerCategory = new Map<string, number>();
  for (const item of filed) {
    if (!item.categoryId) continue;
    itemsPerCategory.set(item.categoryId, (itemsPerCategory.get(item.categoryId) ?? 0) + 1);
  }

  const newLink = (
    <Link href="/stock/categories/new" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      {t('new')}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ href: '/stock', label: tstock('title') }, { label: t('title') }]}
        actions={
          <>
            <Link href="/stock" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
            {newLink}
          </>
        }
      />

      {categories.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Tags size={40} aria-hidden />}
            title={t('empty')}
            action={newLink}
            explain
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-body font-bold text-ink">{category.name}</p>
                <p className="text-meta text-ink-soft">
                  {t('itemCount', { count: itemsPerCategory.get(category.id) ?? 0 })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <CategoryFormDialog category={{ id: category.id, name: category.name }} />
                {canDelete ? (
                  <ActionForm
                    action={deleteStockCategory}
                    values={{ id: category.id }}
                    confirmMessage={t('confirmDelete')}
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
      )}
    </>
  );
}
