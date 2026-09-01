import { CircleCheck, History, RotateCcw, Send } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { QueueRow } from '@/components/messages/QueueRow';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';
import { getSendQueue } from '@/lib/messages/board';
import { mailerStatus } from '@/lib/messages/mailer';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'outbox' });
  return { title: t('title') };
}

/**
 * The queue, and the gate.
 *
 * This screen is the reason the app can have a clock at all. The blueprint's
 * rule is "nudge, don't send", and a scheduler that mailed patients by itself
 * would break it outright — so the job decides *who*, writes a row, and stops.
 * A person decides *whether*, here, and presses the button that opens the
 * message. Nothing in this app has ever sent anything on its own and this is
 * what keeps that true while still saving somebody the job of working out who
 * is due back tomorrow.
 *
 * Three lists rather than one, because they are three different actions:
 *
 *  - **Waiting** is work. It empties.
 *  - **Held** is the mail provider having refused. Its own section because a
 *    refused send used to leave the row exactly where it was, with a sentence in
 *    the note that looked like every other sentence in the note — so an
 *    unverified sender domain produced a queue of rows that each looked like
 *    work and each failed identically, and the front desk found that out one
 *    press at a time. These say how many times they have been tried and when
 *    they come back.
 *  - **Missed** is an apology. Its rows were queued, never sent, and the moment
 *    has gone; they are shown rather than quietly filtered out, because "nobody
 *    got to these" is exactly what a send queue owes the person opening it, and
 *    it is invisible from every other screen in the app. The clock clears them
 *    on its next run so the bucket cannot grow forever.
 *  - **Handled today** is the answer to "did somebody already ring them?" — the
 *    question two people working one queue actually ask each other.
 *
 * Permissions ride on `recall.view` / `recall.send` rather than a pair of their
 * own. It is the same capability by any honest reading — contacting a patient
 * about their care — and the four roles would have been given identical answers
 * twice. The front desk works this list; the locum reads it.
 */
export default async function OutboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('recall.view');
  const canSend = user.permissions.includes('recall.send');

  const t = await getTranslations('outbox');
  const { waiting, held, passed, handled } = await getSendQueue();

  // Configured or not, this screen works — the difference is whether the email
  // button sends or opens a draft. Said out loud in the subtitle rather than
  // discovered by pressing it, because "why did that open Outlook?" is a
  // question the practice should never have to ask twice.
  const mailer = mailerStatus();

  const sections = [
    { key: 'waiting', icon: <Send size={22} aria-hidden />, rows: waiting, mode: 'send' },
    { key: 'held', icon: <RotateCcw size={22} aria-hidden />, rows: held, mode: 'held' },
    { key: 'passed', icon: <History size={22} aria-hidden />, rows: passed, mode: 'passed' },
    {
      key: 'handled',
      icon: <CircleCheck size={22} aria-hidden />,
      rows: handled,
      mode: 'handled',
    },
  ] as const;

  const visible = sections.filter((section) => section.rows.length > 0);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={mailer.configured ? t('subtitleSending', { from: mailer.from }) : t('subtitle')}
        trail={[{ label: t('title') }]}
      />

      {visible.length === 0 ? (
        <Card>
          {/* Not a failure state. An empty queue in the morning means yesterday
              evening's was worked, and at six it means nobody is booked for
              tomorrow — so the sentence says the queue is clear rather than
              that something is missing. */}
          <EmptyState icon={<CircleCheck size={40} aria-hidden />} title={t('empty')} />
        </Card>
      ) : (
        <div className="space-y-6">
          {visible.map((section) => (
            <Card key={section.key}>
              <CardHeader
                title={t(`${section.key}Title`)}
                subtitle={t(`${section.key}Subtitle`, { count: section.rows.length })}
                icon={section.icon}
              />
              <ul className="divide-y-2 divide-line">
                {section.rows.map((row) => (
                  <QueueRow
                    key={row.id}
                    message={row}
                    mode={section.mode}
                    locale={locale}
                    canSend={canSend}
                    canEmail={mailer.configured}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
