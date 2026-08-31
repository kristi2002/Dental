import { ArrowDownLeft, ArrowUpRight, Paperclip, User } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import type { ThreadSummary } from '@/lib/messages/threads';
import { cn } from '@/lib/utils';

/**
 * One conversation in the list.
 *
 * The row answers three questions in the order somebody scanning asks them:
 * *who*, *is it waiting for me*, and *what does it say*. So the name is the
 * heading, the unread count is the loudest thing on the line, and the preview is
 * one grey sentence underneath — never more, because a list that shows whole
 * messages is a list nobody scrolls to the bottom of.
 *
 * An unmatched thread shows the bare address and says so. That is not a gap to
 * be tidied away: a stranger writing in is the ordinary way a new patient makes
 * contact, and the row has to be legible before anybody knows who they are.
 */
export async function ThreadRow({ thread }: { thread: ThreadSummary }) {
  const t = await getTranslations('inbox');
  const format = await getFormatter();

  const unread = thread.unread > 0;
  const name = thread.patient
    ? `${thread.patient.lastName} ${thread.patient.firstName}`
    : thread.correspondent;

  return (
    <li>
      <Link
        href={`/inbox/${thread.id}`}
        className={cn(
          'flex items-start gap-3.5 px-5 py-4 no-underline transition-colors hover:bg-surface-soft',
          unread && 'bg-brand-soft/35',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
            unread ? 'bg-brand-dark text-white' : 'bg-paper text-ink-faint',
          )}
        >
          <User size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              className={cn(
                'min-w-0 truncate text-body text-ink',
                unread ? 'font-bold' : 'font-semibold',
              )}
            >
              {name}
            </span>

            {/* Said only when there is something to say. A thread already
                attached to a patient shows their name above; this is the one
                that is not, and the badge is what makes attaching it a visible
                job rather than something nobody knows is outstanding. */}
            {thread.patient ? null : <Badge tone="warn">{t('notLinked')}</Badge>}

            {unread ? <Badge tone="brand">{t('unread', { count: thread.unread })}</Badge> : null}

            <span className="ml-auto shrink-0 text-meta text-ink-faint tabular-nums">
              {format.dateTime(thread.lastMessageAt, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <p className="mt-0.5 truncate text-body font-semibold text-ink-soft">
            {thread.subject}
          </p>

          {thread.preview ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-meta text-ink-faint">
              {/* Which way the last message went. Without it a list of threads
                  reads as a list of things people said to you, and half of them
                  are things you said to them. */}
              {thread.preview.inbound ? (
                <ArrowDownLeft size={15} aria-hidden className="shrink-0 text-brand" />
              ) : (
                <ArrowUpRight size={15} aria-hidden className="shrink-0" />
              )}
              <span className="min-w-0 truncate">{thread.preview.text}</span>
              {thread.attachments > 0 ? (
                <Paperclip size={15} aria-hidden className="shrink-0" />
              ) : null}
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
