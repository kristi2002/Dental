import { ArrowLeft, Package } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StocktakeForm } from '@/components/stock/StocktakeForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getStockCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Counting the cupboard.
 *
 * Needs `stock.edit` rather than `stock.view`: there is nothing to read here
 * that the stock page does not already show, so a viewer landing on it would
 * only be able to type numbers they cannot save.
 */
export default async function StocktakePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');

  // Not for the list it returns — for what it does before returning it. This is
  // where the practice's old typed-in categories become rows, and a stocktake
  // opened before the stock page would otherwise group the entire room under
  // one "Uncategorized" heading, which is the one thing this screen must not do.
  await getStockCategories();

  // Category first so the form's groups come out in a stable order, and the
  // room can be walked the same way twice. Uncategorized materials sort last,
  // which is where a shelf that has not been named belongs.
  const items = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      code: true,
      category: { select: { name: true } },
      unit: true,
      quantity: true,
      packSize: true,
    },
  });

  return (
    <>
      <PageHeader
        title={t('stocktakeTitle')}
        subtitle={t('stocktakeSubtitle')}
        trail={[{ href: '/stock', label: t('title') }, { label: t('stocktakeTitle') }]}
        actions={
          <Link href="/stock" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Package size={40} aria-hidden />} title={t('empty')} />
        </div>
      ) : (
        <StocktakeForm
          items={items.map((item) => ({
            ...item,
            code: item.code ?? '',
            category: item.category?.name ?? '',
          }))}
        />
      )}
    </>
  );
}
