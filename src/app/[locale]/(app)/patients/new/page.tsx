import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewPatientForm } from '@/components/patients/NewPatientForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Registering a patient.
 *
 * Needs `patient.edit` rather than `patient.view`: there is nothing to read
 * here, so somebody without the permission would only be able to fill the form
 * in and be refused at the save.
 */
export default async function NewPatientPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('patient.edit');

  const t = await getTranslations('patients');
  const tc = await getTranslations('common');

  // The answers the practice has already given, offered as autocomplete — it is
  // what keeps "Instagram", "instagram" and "IG" from becoming three rows on the
  // referral chart.
  const referralRows = await prisma.patient.findMany({
    where: { referralSource: { not: null } },
    distinct: ['referralSource'],
    orderBy: { referralSource: 'asc' },
    select: { referralSource: true },
  });

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/patients', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/patients" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewPatientForm
        referralSources={referralRows
          .map((row) => row.referralSource)
          .filter((value): value is string => Boolean(value))}
        canEditMedical={user.permissions.includes('patient.medical.edit')}
      />
    </>
  );
}
