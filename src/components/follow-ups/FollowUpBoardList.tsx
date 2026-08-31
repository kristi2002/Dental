import { Check, ExternalLink, Paperclip, RotateCcw } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ActionForm, ReportingActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { snoozeFollowUp, toggleFollowUpDone } from '@/lib/actions/follow-ups';
import { today } from '@/lib/dates';
import { daysOverdue, followUpLink, followUpStatus, linkHref, SNOOZE_DAYS } from '@/lib/follow-ups';
import { excerpt } from '@/lib/markdown';
import type { BoardFollowUp } from '@/lib/queries';
import { cn } from '@/lib/utils';

/**
 * One bucket of the board.
 *
 * Deliberately a different component from `FollowUpList` rather than a third
 * `variant` of it. That one is the bell's: it is sorted, filtered and grouped by
 * itself because a popover has no page around it to do that. Here the page owns
 * all three, and the row's job is only to draw a line and offer its verbs —
 * which is a small enough component that sharing one would mean a prop for every
 * difference and a reader who has to hold both screens in their head.
 *
 * A closed line keeps its row and gains "reopen", because the honest reason to
 * look at the done pile is that something was ticked that should not have been.
 */
export async function FollowUpBoardList({
  items,
  canEdit,
}: {
  items: ReadonlyArray<BoardFollowUp>;
  canEdit: boolean;
}) {
  const t = await getTranslations('followUps');
  const format = await getFormatter();
  const day = today();

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const status = followUpStatus(item, day);
        const late = daysOverdue(item, day);
        const link = followUpLink(item);
        const done = item.doneAt !== null;

        return (
          <li key={item.id} className="flex items-start gap-3 px-5 py-4">
            {canEdit ? (
              <ReportingActionForm action={toggleFollowUpDone} values={{ id: item.id }}>
                <button
                  type="submit"
                  title={done ? t('reopen') : t('markDone')}
                  className={cn(
                    'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors focus-visible:outline focus-visible:outline-offset-2',
                    done
                      ? 'border-ok bg-ok-soft text-ok'
                      : 'border-line-strong text-transparent hover:border-ok hover:bg-ok-soft hover:text-ok',
                  )}
                >
                  {done ? <RotateCcw size={15} aria-hidden /> : <Check size={16} aria-hidden />}
                  <span className="sr-only">{done ? t('reopen') : t('markDone')}</span>
                </button>
              </ReportingActionForm>
            ) : (
              <span
                aria-hidden
                className="mt-0.5 size-7 shrink-0 rounded-full border-2 border-line-strong"
              />
            )}

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={`/follow-ups/${item.id}`}
                  className={cn(
                    'text-body font-bold text-ink',
                    done && 'text-ink-soft line-through',
                  )}
                >
                  {item.title}
                </Link>
                {item.priority === 'URGENT' && !done ? (
                  <Badge tone="danger">{t('urgent')}</Badge>
                ) : null}
                {item._count.attachments > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 text-meta font-semibold text-ink-faint tabular-nums"
                    title={t('attachmentCount', { count: item._count.attachments })}
                  >
                    <Paperclip size={13} aria-hidden />
                    {item._count.attachments}
                  </span>
                ) : null}
              </p>

              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-ink-soft">
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    !done && status === 'overdue' && 'text-danger',
                    !done && status === 'today' && 'text-warn',
                  )}
                >
                  {done
                    ? t('doneOn', {
                        date: format.dateTime(item.doneAt!, { day: 'numeric', month: 'short' }),
                      })
                    : status === 'overdue'
                      ? t('lateBy', { days: late })
                      : status === 'today'
                        ? t('dueToday')
                        : format.dateTime(item.dueAt, { day: 'numeric', month: 'short' })}
                </span>

                {link ? (
                  <>
                    <span aria-hidden>·</span>
                    <Link
                      href={linkHref(link)}
                      className="inline-flex items-center gap-1 font-semibold"
                    >
                      {link.label}
                      <ExternalLink size={13} aria-hidden />
                    </Link>
                  </>
                ) : null}

                <span aria-hidden>·</span>
                <span>
                  {item.assignedTo
                    ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`
                    : t('unassigned')}
                </span>

                {done && item.doneBy ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{t('doneBy', { name: item.doneBy.firstName })}</span>
                  </>
                ) : null}
              </p>

              {item.notes ? (
                <p className="mt-1.5 text-meta text-ink-faint">{excerpt(item.notes, 200)}</p>
              ) : null}

              {/* Snooze only on what is still open — pushing a closed line back
                  a day is not a thing anybody means to do, and `snoozeFollowUp`
                  reopens what it touches. */}
              {canEdit && !done ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-caption font-semibold text-ink-faint">
                    {t('snooze')}
                  </span>
                  {SNOOZE_DAYS.map((days) => (
                    <ActionForm key={days} action={snoozeFollowUp} values={{ id: item.id, days }}>
                      <button type="submit" className="btn btn-ghost btn-sm tabular-nums">
                        {t('snoozeDays', { days })}
                      </button>
                    </ActionForm>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
