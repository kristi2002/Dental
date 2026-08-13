import { ArrowLeft, Package } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StocktakeForm } from '@/components/stock/StocktakeForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK } from '@/lib/queries';

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

  // Category first so the form's groups come out in a stable order, and the
  // room can be walked the same way twice.
  const items = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      category: true,
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
          items={items.map((item) => ({ ...item, category: item.category ?? '' }))}
        />
      )}
    </>
  );
}
