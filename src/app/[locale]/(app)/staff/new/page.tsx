import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewStaffForm } from '@/components/staff/NewStaffForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'staff' });
  return { title: t('new') };
}

/** Giving somebody an account. Same permission the staff list itself needs. */
export default async function NewStaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('staff.manage');

  const t = await getTranslations('staff');
  const tc = await getTranslations('common');

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/staff', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/staff" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewStaffForm />
    </>
  );
}
