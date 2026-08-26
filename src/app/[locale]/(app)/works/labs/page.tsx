import { ArrowLeft, Building2, Mail, Phone, PhoneOff, Plus, Power } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LabFormDialog } from '@/components/works/LabFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { setLabActive } from '@/lib/actions/labs';
import { requirePermission } from '@/lib/auth/guard';
import { getLabUsage } from '@/lib/labs';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'labs' });
  return { title: t('title') };
}

/**
 * The laboratories the practice sends work to.
 *
 * Filed under the register for the same reason the procedures catalogue is: it
 * is a list named once and then picked from, which is not a place anybody starts
 * their day.
 *
 * The telephone number is why the table exists, so it is what each row leads
 * with — and a laboratory without one is said out loud rather than left blank,
 * because that is the row where the follow-up board still cannot do its job.
 */
export default async function LabsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('work.edit');

  const t = await getTranslations('labs');
  const tc = await getTranslations('common');
  // The copy button's own words, where every other screen's copy button gets them.
  const tcon = await getTranslations('contacts');

  const labs = await getLabUsage();
  const missingPhone = labs.filter((lab) => !lab.archivedAt && !lab.phone).length;

  const newLink = (
    <Link href="/works/labs/new" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      {t('new')}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ href: '/works', label: t('worksTitle') }, { label: t('title') }]}
        actions={
          <>
            <Link href="/works" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {t('worksTitle')}
            </Link>
            {newLink}
          </>
        }
      />

      {/* The one thing this screen can tell somebody that they did not come here
          knowing. Every laboratory carried over from the old text column arrived
          with a name and no number, and a number is the whole point — so the gap
          is counted at the top rather than left to be noticed row by row. */}
      {missingPhone > 0 ? (
        <p className="card mb-6 flex flex-wrap items-center gap-3 border-warn px-5 py-4 text-[1.02rem] font-semibold text-warn">
          <PhoneOff size={20} aria-hidden />
          {t('missingPhone', { count: missingPhone })}
        </p>
      ) : null}

      {labs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Building2 size={40} aria-hidden />}
            title={t('empty')}
            action={newLink}
          />
        </div>
      ) : (
        <ul className="card divide-y-2 divide-line">
          {labs.map((lab) => (
            <li
              key={lab.id}
              className={cn(
                'flex flex-wrap items-start justify-between gap-4 px-5 py-4',
                lab.archivedAt && 'opacity-60',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[1.08rem] font-bold text-ink">{lab.name}</span>
                  {lab.archivedAt ? <Badge>{t('retired')}</Badge> : null}
                  {/* What the register owes them. The second number is the one
                      that makes retiring a laboratory a decision rather than a
                      tidy-up. */}
                  {lab.outstanding > 0 ? (
                    <Badge tone="warn">{t('outstanding', { count: lab.outstanding })}</Badge>
                  ) : null}
                  {lab.lines > 0 ? <Badge>{t('lines', { count: lab.lines })}</Badge> : null}
                </p>

                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.95rem]">
                  {lab.phone ? (
                    <span className="flex items-center gap-1.5 text-ink-soft">
                      <Phone size={15} aria-hidden />
                      {/* A `tel:` link and a copy button, never the link alone —
                          a browser-only front desk has nothing registered for the
                          scheme, and a link that silently does nothing looks
                          exactly like one nobody pressed. See `ContactActions`. */}
                      <a href={`tel:${lab.phone.replaceAll(' ', '')}`} className="tabular-nums">
                        {lab.phone}
                      </a>
                      <CopyButton value={lab.phone} label={tcon('copyValue')} copiedLabel={tcon('copied')} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 font-semibold text-warn">
                      <PhoneOff size={15} aria-hidden />
                      {t('noPhone')}
                    </span>
                  )}

                  {lab.email ? (
                    <span className="flex items-center gap-1.5 text-ink-soft">
                      <Mail size={15} aria-hidden />
                      {lab.email}
                      <CopyButton value={lab.email} label={tcon('copyValue')} copiedLabel={tcon('copied')} />
                    </span>
                  ) : null}
                </p>

                {lab.notes ? (
                  <p className="mt-1 text-[0.93rem] whitespace-pre-line text-ink-soft">
                    {lab.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <LabFormDialog
                  lab={{
                    id: lab.id,
                    name: lab.name,
                    phone: lab.phone,
                    email: lab.email,
                    notes: lab.notes,
                  }}
                />
                {/* Retired, never deleted. The lines pointing at this row are the
                    register's record of what went where, and deleting it would
                    set every one of them back to a name with no number. */}
                <ActionForm
                  action={setLabActive}
                  values={{ id: lab.id, active: lab.archivedAt ? '1' : '0' }}
                  confirmMessage={
                    lab.archivedAt || lab.outstanding === 0
                      ? undefined
                      : t('retireConfirm', { count: lab.outstanding })
                  }
                >
                  <button
                    type="submit"
                    className="btn btn-secondary btn-sm"
                    title={lab.archivedAt ? t('restore') : t('retire')}
                  >
                    <Power size={17} aria-hidden />
                    <span className="sr-only">{lab.archivedAt ? t('restore') : t('retire')}</span>
                  </button>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
