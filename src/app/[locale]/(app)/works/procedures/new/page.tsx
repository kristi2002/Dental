import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewProcedureForm } from '@/components/works/NewProcedureForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { getWorkProcedures } from '@/lib/work-procedures';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workProcedures' });
  return { title: t('new') };
}

/** Naming a kind of work. Same permission the list itself needs. */
export default async function NewWorkProcedurePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('work.edit');

  const t = await getTranslations('workProcedures');
  const tc = await getTranslations('common');

  const procedures = await getWorkProcedures();

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/works/procedures', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/works/procedures" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewProcedureForm existing={procedures.map((procedure) => procedure.name)} />
    </>
  );
}
