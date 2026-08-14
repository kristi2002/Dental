import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewCategoryForm } from '@/components/services/NewCategoryForm';
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
  const t = await getTranslations({ locale, namespace: 'serviceCategories' });
  return { title: t('new') };
}

/**
 * Naming a catalogue heading.
 *
 * `?parent=` is how "add a subdivision" on a department hands over which one, so
 * the question is answered before the screen is even drawn — the row it was
 * pressed on already knows the answer.
 */
export default async function NewServiceCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ parent?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('service.edit');

  const t = await getTranslations('serviceCategories');
  const tc = await getTranslations('common');

  const { parent } = await searchParams;

  const categories = await getServiceCategories();
  const departments = categories.filter((category) => category.parentId === null);

  // A `?parent=` naming a heading that is not a department — or is nothing at
  // all — is dropped rather than obeyed: the catalogue is two levels deep, and a
  // preselected third would only be refused at the save.
  const parentId = departments.some((option) => option.id === parent) ? parent! : '';

  return (
    <>
      <PageHeader
        title={parentId ? t('newChild') : t('new')}
        subtitle={parentId ? t('newChildSubtitle') : t('newSubtitle')}
        trail={[{ href: '/services/categories', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/services/categories" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewCategoryForm departments={departments} defaultParentId={parentId} />
    </>
  );
}
