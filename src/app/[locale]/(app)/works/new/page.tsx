import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewWorkForm } from '@/components/works/NewWorkForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'works' });
  return { title: t('new') };
}

/**
 * Writing a case into the register.
 *
 * Needs `work.edit` rather than `work.view`: there is nothing to read here, so
 * somebody without the permission would only be able to fill the form in and be
 * refused at the save.
 */
export default async function NewWorkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('work.edit');

  const t = await getTranslations('works');
  const tc = await getTranslations('common');

  // The laboratories this practice already uses, offered as suggestions so the
  // same one is not entered under three spellings. Distinct at the database
  // rather than pulled back and deduplicated here — the register grows forever
  // and the list of labs does not.
  const named = await prisma.workLine.findMany({
    where: { lab: { not: null } },
    distinct: ['lab'],
    orderBy: { lab: 'asc' },
    select: { lab: true },
  });
  const labs = named.map((row) => row.lab!).filter(Boolean);

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/works', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/works" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      {/* The clinic's today, not the browser's — a laptop left on overnight, or
          one set to another zone, would otherwise file the case a day out. */}
      <NewWorkForm labs={labs} today={toDateKey(today())} />
    </>
  );
}
