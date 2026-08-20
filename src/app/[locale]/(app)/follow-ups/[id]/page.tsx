import { Check, ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { FollowUpAttachments } from '@/components/follow-ups/FollowUpAttachments';
import { FollowUpDetailForm } from '@/components/follow-ups/FollowUpDetailForm';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { deleteFollowUp, toggleFollowUpDone } from '@/lib/actions/follow-ups';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, today } from '@/lib/dates';
import { daysOverdue, followUpLink, followUpStatus, linkHref } from '@/lib/follow-ups';
import { getAssignableStaff, getFollowUp } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const followUp = await getFollowUp(id);
  return { title: followUp?.title };
}

/**
 * One follow-up, in full.
 *
 * The screen the bell could never be. Everything here is something a popover has
 * no room for: the note with its structure intact, the files pinned to it, who
 * wrote it and when, and who ticked it off.
 *
 * The board and the bell both still work without ever coming here — a line that
 * is eight words and a date needs nothing on this page. That is the point of the
 * split: depth is available, not compulsory.
 */
export default async function FollowUpDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('followup.view');
  const canEdit = user.permissions.includes('followup.edit');

  const t = await getTranslations('followUps');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const [followUp, staff] = await Promise.all([getFollowUp(id), getAssignableStaff()]);
  if (!followUp) notFound();

  const day = today();
  const status = followUpStatus(followUp, day);
  const late = daysOverdue(followUp, day);
  const link = followUpLink(followUp);
  const done = followUp.doneAt !== null;

  return (
    <>
      <PageHeader
        title={followUp.title}
        subtitle={
          done
            ? t('doneOn', {
                date: format.dateTime(followUp.doneAt!, { day: 'numeric', month: 'long' }),
              })
            : status === 'overdue'
              ? t('lateBy', { days: late })
              : status === 'today'
                ? t('dueToday')
                : format.dateTime(followUp.dueAt, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
        }
        trail={[{ label: t('title'), href: '/follow-ups' }, { label: followUp.title }]}
        actions={
          canEdit ? (
            <>
              <ActionForm action={toggleFollowUpDone} values={{ id: followUp.id }}>
                <button type="submit" className="btn btn-secondary">
                  {done ? <RotateCcw size={18} aria-hidden /> : <Check size={18} aria-hidden />}
                  {done ? t('reopen') : t('markDone')}
                </button>
              </ActionForm>

              <ActionForm
                action={deleteFollowUp}
                values={{ id: followUp.id }}
                confirmMessage={tc('confirmDelete')}
              >
                <button type="submit" className="btn btn-ghost" title={tc('delete')}>
                  <Trash2 size={18} aria-hidden />
                  <span className="sr-only">{tc('delete')}</span>
                </button>
              </ActionForm>
            </>
          ) : undefined
        }
      />

      {/* The facts about the line that are not fields — what it is about, who
          wrote it, who closed it. Kept above the form rather than inside it, so
          nothing here looks editable when it is not. */}
      <Card className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-[0.95rem] text-ink-soft">
        {followUp.priority === 'URGENT' && !done ? <Badge tone="danger">{t('urgent')}</Badge> : null}
        {done ? <Badge tone="ok">{t('statusDone')}</Badge> : null}

        {link ? (
          <Link href={linkHref(link)} className="inline-flex items-center gap-1 font-semibold">
            {link.label}
            <ExternalLink size={14} aria-hidden />
          </Link>
        ) : null}

        <span>
          {followUp.assignedTo
            ? `${followUp.assignedTo.firstName} ${followUp.assignedTo.lastName}`
            : t('unassigned')}
        </span>

        {followUp.createdBy ? (
          <span>
            {t('writtenBy', {
              name: followUp.createdBy.firstName,
              date: format.dateTime(followUp.createdAt, { day: 'numeric', month: 'short' }),
            })}
          </span>
        ) : null}

        {done && followUp.doneBy ? (
          <span>{t('doneBy', { name: followUp.doneBy.firstName })}</span>
        ) : null}
      </Card>

      <div className="space-y-6">
        <FollowUpDetailForm
          followUp={{
            id: followUp.id,
            title: followUp.title,
            notes: followUp.notes ?? '',
            dueAt: toDateKey(followUp.dueAt),
            urgent: followUp.priority === 'URGENT',
            assignedToId: followUp.assignedToId ?? '',
          }}
          staff={staff}
          canEdit={canEdit}
        />

        <Card className="p-5">
          <FollowUpAttachments
            followUpId={followUp.id}
            attachments={followUp.attachments}
            canEdit={canEdit}
          />
        </Card>
      </div>
    </>
  );
}
