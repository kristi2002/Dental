import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewOperatoryForm } from '@/components/settings/NewOperatoryForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings' });
  return { title: t('operatoryNew') };
}

/** Naming a chair. Same permission the settings screen's own edits need. */
export default async function NewOperatoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('settings.edit');

  const t = await getTranslations('settings');
  const tc = await getTranslations('common');

  // Retired chairs included: their names are still taken, and offering one again
  // would put two rows with the same label in the diary's chair column.
  const operatories = await prisma.operatory.findMany({
    orderBy: { name: 'asc' },
    select: { name: true },
  });

  return (
    <>
      <PageHeader
        title={t('operatoryNew')}
        subtitle={t('operatoryNewSubtitle')}
        trail={[{ href: '/settings', label: t('title') }, { label: t('operatoryNew') }]}
        actions={
          <Link href="/settings" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewOperatoryForm existing={operatories.map((room) => room.name)} />
    </>
  );
}
