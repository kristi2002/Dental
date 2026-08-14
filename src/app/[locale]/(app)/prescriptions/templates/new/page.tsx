import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewTemplateForm } from '@/components/prescriptions/NewTemplateForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { getServiceOptions } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'prescriptions' });
  return { title: t('newTemplate') };
}

/**
 * Writing a standard wording.
 *
 * Needs `prescription.edit` rather than the `.view` the list opens on: there is
 * nothing to read here, so somebody without the permission would only be able to
 * write the wording and be refused at the save.
 */
export default async function NewTemplatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('prescription.edit');

  const t = await getTranslations('prescriptions');
  const tc = await getTranslations('common');

  const [templates, services] = await Promise.all([
    // The groupings already in use, offered as autocomplete — it is what keeps
    // "Antibiotics", "antibiotic" and "AB" from becoming three headings.
    prisma.prescriptionTemplate.findMany({
      where: { category: { not: null } },
      distinct: ['category'],
      orderBy: { category: 'asc' },
      select: { category: true },
    }),
    // The whole catalogue: a template is tied to a treatment, and the form has
    // to offer every one of them grouped by department.
    getServiceOptions(),
  ]);

  return (
    <>
      <PageHeader
        title={t('newTemplate')}
        subtitle={t('newTemplateSubtitle')}
        trail={[
          { href: '/prescriptions', label: t('templatesTitle') },
          { label: t('newTemplate') },
        ]}
        actions={
          <Link href="/prescriptions" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewTemplateForm
        categories={templates
          .map((row) => row.category)
          .filter((value): value is string => Boolean(value))}
        services={services}
      />
    </>
  );
}
