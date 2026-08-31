import { Archive, ArchiveRestore, Link2, Paperclip, TriangleAlert, User } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LinkThreadDialog } from '@/components/messages/LinkThreadDialog';
import { MarkThreadRead } from '@/components/messages/MarkThreadRead';
import { ReplyBox } from '@/components/messages/ReplyBox';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { setThreadArchived } from '@/lib/actions/inbox';
import { formatBytes } from '@/lib/file-constants';
import { mailerStatus } from '@/lib/messages/mailer';
import { getThread } from '@/lib/messages/threads';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'inbox' });
  const thread = await getThread(id);
  return { title: thread ? thread.subject : t('title') };
}

/**
 * One conversation.
 *
 * Laid out as a transcript rather than as a mail client: the practice's own
 * messages sit on one side and the patient's on the other, oldest at the top,
 * and the reply box is the last thing on the page. That is the shape of every
 * messaging app anybody at a front desk has ever used, and this app's whole
 * messaging story is WhatsApp-shaped already.
 *
 * **Nothing here renders the sender's markup.** `getThread` does not even select
 * it — see the note there. What is shown is the text part, which React escapes
 * like any other string; the original is a download.
 */
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('message.view');
  const canSend = user.permissions.includes('message.send');

  const t = await getTranslations('inbox');
  const format = await getFormatter();

  const thread = await getThread(id);
  if (!thread) notFound();

  const mailer = mailerStatus();
  const optedOut = thread.patient?.contactConsent === false;

  return (
    <>
      {/* Opening it is what marks it read, so the write happens from the client
          once the page is on screen — a server component may not mutate while
          it renders, and this genuinely is a side effect of looking. */}
      <MarkThreadRead threadId={thread.id} />

      <PageHeader
        title={thread.subject}
        subtitle={thread.correspondent}
        trail={[{ label: t('title'), href: '/inbox' }, { label: thread.subject }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {thread.patient ? (
              <Link href={`/patients/${thread.patient.id}`} className="btn btn-secondary btn-sm">
                <User size={17} aria-hidden />
                {`${thread.patient.lastName} ${thread.patient.firstName}`}
              </Link>
            ) : null}

            {canSend ? (
              <LinkThreadDialog
                threadId={thread.id}
                linked={
                  thread.patient
                    ? {
                        id: thread.patient.id,
                        name: `${thread.patient.lastName} ${thread.patient.firstName}`,
                      }
                    : null
                }
              />
            ) : null}

            <ActionForm
              action={setThreadArchived}
              values={{ threadId: thread.id, archived: thread.archived ? '0' : '1' }}
            >
              <button type="submit" className="btn btn-secondary btn-sm">
                {thread.archived ? (
                  <ArchiveRestore size={17} aria-hidden />
                ) : (
                  <Archive size={17} aria-hidden />
                )}
                {t(thread.archived ? 'unfile' : 'file')}
              </button>
            </ActionForm>
          </div>
        }
      />

      {/* A thread nobody has attached to a record is the ordinary way a new
          patient makes contact, so this is a prompt and not a warning. */}
      {thread.patient ? null : (
        <p className="mb-5 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface-soft px-4 py-3 text-ink-soft">
          <Link2 size={18} aria-hidden className="shrink-0" />
          {t('notLinkedHint')}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader title={t('conversation')} />
        <ol className="space-y-4 px-5 py-5">
          {thread.messages.map((message) => (
            <li
              key={message.id}
              className={cn('flex', message.inbound ? 'justify-start' : 'justify-end')}
            >
              <div
                className={cn(
                  'max-w-[min(46rem,88%)] rounded-[var(--radius-card)] border px-4 py-3',
                  message.inbound ? 'border-line bg-surface-soft' : 'border-brand/35 bg-brand-soft',
                )}
              >
                <p className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-ink-soft">
                  <span className="font-bold text-ink">
                    {message.inbound
                      ? message.fromName || message.fromAddress
                      : message.actorName || t('thePractice')}
                  </span>
                  <span className="tabular-nums">
                    {format.dateTime(message.at, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {/* The provider's own opinion, shown rather than acted on. A
                      number the app silently filtered by would be a number
                      nobody could see was wrong. */}
                  {message.spamScore !== null && message.spamScore >= 5 ? (
                    <Badge tone="warn">
                      <TriangleAlert size={13} aria-hidden />
                      {t('spamScore', { score: message.spamScore.toFixed(1) })}
                    </Badge>
                  ) : null}
                </p>

                <p className="text-body whitespace-pre-wrap text-ink">{message.text}</p>

                {message.attachments.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((file) => (
                      <li key={file.id}>
                        {/* Downloaded through a route that checks the session,
                            never served from a public directory — the same rule
                            every other file in this app follows. */}
                        <a
                          href={`/api/mail/attachments/${file.id}`}
                          className="btn btn-secondary btn-sm"
                          download={file.fileName}
                        >
                          <Paperclip size={16} aria-hidden />
                          <span className="max-w-[16rem] truncate">{file.fileName}</span>
                          <span className="text-ink-faint tabular-nums">
                            {formatBytes(file.sizeBytes)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* Offered only when there is one, and it is a download rather
                    than a view: this app renders no inbound markup anywhere. */}
                {message.hasHtml ? (
                  <p className="mt-2">
                    <a
                      href={`/api/mail/original/${message.id}`}
                      className="text-meta font-semibold text-ink-soft underline"
                      download
                    >
                      {t('viewOriginal')}
                    </a>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {canSend ? (
        <ReplyBox
          threadId={thread.id}
          correspondent={thread.correspondent}
          configured={mailer.configured}
          optedOut={optedOut}
        />
      ) : null}
    </>
  );
}
