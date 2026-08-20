import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PatientImport } from '@/components/patients/PatientImport';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'patients' });
  return { title: t('importTitle') };
}

/**
 * Bringing an existing patient list into the practice.
 *
 * A screen of its own rather than a dialog on the list, for the reason
 * registering somebody is: the preview is a table of three thousand rows that
 * has to be *read* before anything is pressed, and a modal is the wrong shape
 * for a document.
 *
 * Needs `patient.edit` rather than `patient.view` — there is nothing to read
 * here, so somebody without it could only fill the screen in and be refused at
 * the end. All the work is in `PatientImport`, which does its parsing in the
 * browser; this page is the frame and the guard.
 */
export default async function PatientImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('patient.edit');

  const t = await getTranslations('patients');

  return (
    <>
      <PageHeader
        title={t('importTitle')}
        subtitle={t('importSubtitle')}
        trail={[{ href: '/patients', label: t('title') }, { label: t('importTitle') }]}
      />

      <PatientImport />
    </>
  );
}
