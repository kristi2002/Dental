import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewWorkForm } from '@/components/works/NewWorkForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, today } from '@/lib/dates';
import { getLabs } from '@/lib/labs';
import { getProcedureOptions } from '@/lib/work-procedures';

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

  // The two catalogues each line is filled in from. Both are picked rather than
  // typed now: the laboratory used to be a text box with the register's own past
  // spellings offered as suggestions, which is how one bench became three
  // strings — the same failure the work catalogue was built to end, plus one
  // more, because a suggestion has nowhere to keep a telephone number.
  const [labs, procedures] = await Promise.all([getLabs(), getProcedureOptions()]);

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
      <NewWorkForm labs={labs} procedures={procedures} today={toDateKey(today())} />
    </>
  );
}
