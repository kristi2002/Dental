import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewServiceForm } from '@/components/services/NewServiceForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { getServiceCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'services' });
  return { title: t('new') };
}

/**
 * Adding a treatment to the catalogue.
 *
 * Needs `service.edit` rather than `service.view`: there is nothing to read
 * here, so somebody without the permission would only be able to fill the form
 * in and be refused at the save.
 */
export default async function NewServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('service.edit');

  const t = await getTranslations('services');
  const tc = await getTranslations('common');

  // On its own, and first: this is where the practice's old typed-in category
  // names become rows, and it has to finish before the departments are offered.
  const categories = await getServiceCategories();

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/services', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/services" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewServiceForm categories={categories} />
    </>
  );
}
