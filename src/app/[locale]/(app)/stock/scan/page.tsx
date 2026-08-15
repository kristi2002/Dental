import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScanConsole } from '@/components/stock/ScanConsole';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getStockCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'scan' });
  return { title: t('title') };
}

/**
 * Moving stock by reading what is printed on it.
 *
 * Needs `stock.edit` rather than `stock.view`: there is nothing to read here.
 * Somebody without the permission could only scan a cupboard's worth of boxes
 * and be refused at the commit.
 *
 * The categories are loaded because the first scan of a product the practice has
 * never stocked creates the material inline, and a material created without a
 * shelf is one somebody has to go and file afterwards.
 */
export default async function ScanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('stock.edit');

  const t = await getTranslations('scan');
  const ts = await getTranslations('stock');
  const tc = await getTranslations('common');

  // On its own, and first: this is where the practice's old typed-in category
  // names become rows, and it has to finish before the shelves are offered.
  const categories = await getStockCategories();

  const items = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, unit: true },
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ href: '/stock', label: ts('title') }, { label: t('title') }]}
        actions={
          <Link href="/stock" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <ScanConsole items={items} categories={categories} />
    </>
  );
}
