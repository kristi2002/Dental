import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewLabForm } from '@/components/works/NewLabForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { getLabs } from '@/lib/labs';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'labs' });
  return { title: t('new') };
}

/** Naming a laboratory. Same permission the list itself needs. */
export default async function NewLabPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('work.edit');

  const t = await getTranslations('labs');
  const tc = await getTranslations('common');

  const labs = await getLabs();

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/works/labs', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/works/labs" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewLabForm existing={labs.map((lab) => lab.name)} />
    </>
  );
}
