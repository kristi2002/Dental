import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CatalogueImport } from '@/components/shared/CatalogueImport';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'imports' });
  return { title: t('stockTitle') };
}

/**
 * Bringing an existing storage-room list in from a spreadsheet.
 *
 * What comes in is the *catalogue* — what each material is, what it costs, who
 * it is bought from, when to reorder — and never how much of it is on the shelf.
 * The reasoning is in `catalogue-import.ts`: a count in this app is a batch with
 * a date and a price, not a number in a column, and the stocktake screen is
 * where one gets recorded properly.
 */
export default async function StockImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('stock.edit');

  const t = await getTranslations('imports');
  const ts = await getTranslations('stock');

  return (
    <>
      <PageHeader
        title={t('stockTitle')}
        subtitle={t('stockSubtitle')}
        trail={[{ href: '/stock', label: ts('title') }, { label: t('stockTitle') }]}
      />

      <CatalogueImport kind="stock" />
    </>
  );
}
