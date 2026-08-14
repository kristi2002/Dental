import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewStockForm } from '@/components/stock/NewStockForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getClinicProfile, getStockCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Recording a material.
 *
 * Needs `stock.edit` rather than `stock.view`, like the stocktake: there is
 * nothing to read here, so somebody without the permission would only be able to
 * fill the form in and be refused at the save.
 */
export default async function NewStockItemPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');

  // On its own, and first: this is where the practice's old typed-in category
  // names become rows, and it has to finish before the shelves are offered —
  // otherwise the first material recorded after the deploy is filed against a
  // list that is still empty.
  const categories = await getStockCategories();

  const [unitRows, suppliers, profile] = await Promise.all([
    // The units already in use, offered as autocomplete — it is what keeps
    // "box", "Box" and "bx" from becoming three units of the same thing.
    prisma.stockItem.findMany({
      where: ACTIVE_STOCK,
      distinct: ['unit'],
      orderBy: { unit: 'asc' },
      select: { unit: true },
    }),
    prisma.supplier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    getClinicProfile(),
  ]);

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/stock', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/stock" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewStockForm
        categories={categories}
        units={unitRows.map((row) => row.unit)}
        suppliers={suppliers}
        currency={profile.currency}
      />
    </>
  );
}
