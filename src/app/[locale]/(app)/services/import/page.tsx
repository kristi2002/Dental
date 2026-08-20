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
  return { title: t('servicesTitle') };
}

/**
 * Bringing an existing price list in from a spreadsheet.
 *
 * A screen of its own rather than a dialog, like the patient import: the preview
 * is a table that has to be read before anything is pressed, and a modal is the
 * wrong shape for a document.
 *
 * Needs `service.edit` rather than `service.view` — there is nothing to read
 * here, so somebody without it could only fill the screen in and be refused at
 * the end.
 */
export default async function ServiceImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('service.edit');

  const t = await getTranslations('imports');
  const ts = await getTranslations('services');

  return (
    <>
      <PageHeader
        title={t('servicesTitle')}
        subtitle={t('servicesSubtitle')}
        trail={[{ href: '/services', label: ts('title') }, { label: t('servicesTitle') }]}
      />

      <CatalogueImport kind="services" />
    </>
  );
}
