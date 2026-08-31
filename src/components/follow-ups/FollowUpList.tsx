import { Check, CircleCheck, ExternalLink, Paperclip, Repeat2, Trash2 } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { ActionForm, ReportingActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { deleteFollowUp, snoozeFollowUp, toggleFollowUpDone } from '@/lib/actions/follow-ups';
import { isNew } from '@/lib/board-new';
import { toDateKey, today } from '@/lib/dates';
import {
  daysOverdue,
  followUpLink,
  followUpStatus,
  linkHref,
  SNOOZE_DAYS,
  sortFollowUps,
} from '@/lib/follow-ups';
import { excerpt } from '@/lib/markdown';
import type { OpenFollowUp } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { FollowUpFormDialog, type StaffOption } from './FollowUpFormDialog';

/**
 * The board, as a list of lines.
 *
 * One component for both places it appears, because they are the same list read
 * at two distances. In the bell it is everything still open, and it is where the
 * board is *worked* — ticked, pushed back, corrected. On the dashboard it is cut
 * to what is late or due today, and it only offers the two verbs somebody
 * standing at the desk actually wants: open it, or tick it off.
 *
 * A server component, so the dates are formatted in the reader's locale and on
 * the reader's side of the wire. The bell around it is the only client part, and
 * all it does is open and shut.
 */
export async function FollowUpList({
  items,
  canEdit,
  staff,
  variant,
  dueOnly = false,
  viewerId,
  seenAt = null,
}: {
  items: ReadonlyArray<OpenFollowUp>;
  canEdit: boolean;
  staff: ReadonlyArray<StaffOption>;
  /** `popover` is the working surface; `card` is the dashboard's shorter read. */
  variant: 'popover' | 'card';
  /** Drop anything not already late or due today. */
  dueOnly?: boolean;
  /**
   * Who is reading, so a row can say whether it is theirs.
   *
   * Only ever written into `data-kind` for the board's "mine" card to act on —
   * the row prints the assignee's name either way, and a list that said "yours"
   * on half its lines would be shouting something the name already says.
   */
  viewerId?: string;
  /**
   * When the reader last shut the board, so a line written since can say so.
   *
   * Absent on the dashboard's copy: that card is a glance at what is due, not
   * the surface somebody works and closes, and "new since you last looked" is
   * meaningless about a list nobody looks *at*.
   */
  seenAt?: Date | null;
}) {
  const t = await getTranslations('followUps');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const day = today();
  const dayKey = toDateKey(day);

  const rows = sortFollowUps(items, day).filter(
    (item) => !dueOnly || followUpStatus(item, day) !== 'upcoming',
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CircleCheck size={variant === 'popover' ? 32 : 40} aria-hidden />}
        title={dueOnly ? t('emptyDue') : t('empty')}
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((item) => {
        const status = followUpStatus(item, day);
        const late = daysOverdue(item, day);
        const link = followUpLink(item);

        return (
          /* `data-kind` is what the reminder board's filters act on. The board is
             a client component wrapped around a server-rendered list, so it
             cannot re-render these rows to narrow them — it flips one attribute
             on the container and the stylesheet hides whatever does not match.
             Space-separated tokens rather than one value, because a row belongs
             to more than one pile: it is a follow-up *and* it is late. */
          <li
            key={item.id}
            data-kind={[
              'followup',
              status,
              item.priority === 'URGENT' ? 'urgent' : '',
              viewerId && item.assignedToId === viewerId ? 'mine' : '',
              isNew(item, seenAt) ? 'fresh' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            className="flex items-start gap-3 px-4 py-3"
          >
            {/* The tick, first and biggest. Everything else on the row is
                secondary to the one act that makes the board shrink. */}
            {canEdit ? (
              <ReportingActionForm action={toggleFollowUpDone} values={{ id: item.id }}>
                <button
                  type="submit"
                  title={t('markDone')}
                  className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 border-line-strong text-transparent transition-colors hover:border-ok hover:bg-ok-soft hover:text-ok focus-visible:outline focus-visible:outline-offset-2"
                >
                  <Check size={16} aria-hidden />
                  <span className="sr-only">{t('markDone')}</span>
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
                {/* The way in to the note itself — where the full text, the
                    checklist and the attachments live. The row stays a summary;
                    everything that does not fit in one is one press away. */}
                <Link href={`/follow-ups/${item.id}`} className="font-bold text-ink">
                  {item.title}
                </Link>
                {item.priority === 'URGENT' ? (
                  <Badge tone="danger">{t('urgent')}</Badge>
                ) : null}
                {/* Written since this person last shut the board.
                
                    First on the row and in the practice's own colour, because
                    the whole point of it is to be found in a list of twenty
                    without reading twenty. It says nothing about urgency — a
                    new line may be due next month — only that it was not there
                    last time. */}
                {isNew(item, seenAt) ? <Badge tone="brand">{t('fresh')}</Badge> : null}

                {/* Said on the row, because a repeating line behaves
                    differently when ticked — it comes back — and somebody about
                    to press the circle should know that before they press it,
                    not discover it when the board does not shrink. */}
                {item.repeatEvery ? (
                  <span
                    className="inline-flex items-center gap-1 text-meta font-semibold text-ink-faint"
                    title={t('repeatsEvery', { every: t(`repeat.${item.repeatEvery}`) })}
                  >
                    <Repeat2 size={13} aria-hidden />
                    {t(`repeat.${item.repeatEvery}`)}
                  </span>
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
                    status === 'overdue' && 'text-danger',
                    status === 'today' && 'text-warn',
                  )}
                >
                  {status === 'overdue'
                    ? t('lateBy', { days: late })
                    : status === 'today'
                      ? t('dueToday')
                      : format.dateTime(item.dueAt, { day: 'numeric', month: 'short' })}
                </span>

                {/* What it is about, as the way in. A follow-up whose record is
                    one click away is one somebody can actually action from
                    here; one that only names it sends them to the search box. */}
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

                {item.assignedTo ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      {item.assignedTo.firstName} {item.assignedTo.lastName}
                    </span>
                  </>
                ) : null}
              </p>

              {/* One line, with the Markdown taken off. A row is a summary, and
                  a note that is now allowed to be a checklist would otherwise
                  print its dashes and asterisks into the bell. */}
              {item.notes ? (
                <p className="mt-1 text-meta text-ink-faint">{excerpt(item.notes, 120)}</p>
              ) : null}

              {/* The working verbs, and only in the bell. The dashboard card is
                  read in passing — a delete button on a list somebody glanced
                  at on their way past is a mis-tap waiting to happen. */}
              {canEdit && variant === 'popover' ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-caption font-semibold text-ink-faint">
                    {t('snooze')}
                  </span>
                  {SNOOZE_DAYS.map((days) => (
                    <ActionForm
                      key={days}
                      action={snoozeFollowUp}
                      values={{ id: item.id, days }}
                    >
                      <button type="submit" className="btn btn-ghost btn-sm tabular-nums">
                        {t('snoozeDays', { days })}
                      </button>
                    </ActionForm>
                  ))}

                  <span className="flex-1" />

                  <FollowUpFormDialog
                    staff={staff}
                    today={dayKey}
                    triggerClassName="btn btn-ghost btn-sm"
                    compact
                    followUp={{
                      id: item.id,
                      title: item.title,
                      notes: item.notes ?? '',
                      dueAt: toDateKey(item.dueAt),
                      urgent: item.priority === 'URGENT',
                      repeatEvery: item.repeatEvery ?? '',
                      assignedToId: item.assignedToId ?? '',
                    }}
                  />

                  <ActionForm
                    action={deleteFollowUp}
                    values={{ id: item.id }}
                    confirmMessage={tc('confirmDelete')}
                  >
                    <button type="submit" className="btn btn-ghost btn-sm" title={tc('delete')}>
                      <Trash2 size={16} aria-hidden />
                      <span className="sr-only">{tc('delete')}</span>
                    </button>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
