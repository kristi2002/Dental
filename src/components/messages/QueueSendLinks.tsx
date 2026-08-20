'use client';

import { BellOff, Mail, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { sendQueuedMessage } from '@/lib/actions/messages';

/**
 * The two buttons the queue exists for.
 *
 * Near-twins of `ReminderLinks`, and not a variant of it. That component opens a
 * draft and writes a line to the contact log; this one does the same *and*
 * resolves the queue row, in a single server action so the two records cannot
 * disagree. Threading a `messageId` through `ReminderLinks` would have given one
 * component two jobs and a branch in the middle of both — and this one has a
 * different shape anyway, because the row it sits in disappears when it works.
 *
 * The press is fire-and-forget, exactly as `ReminderLinks` is: the anchor's own
 * navigation is left alone, so WhatsApp opens at the same speed whether the
 * database answers in five milliseconds or five hundred.
 */
export function QueueSendLinks({
  messageId,
  whatsapp,
  mail,
  body,
  consent,
}: {
  messageId: string;
  /** Pre-composed hrefs, in the patient's language. Null when there is no number/address. */
  whatsapp: string | null;
  mail: string | null;
  body: string;
  /** Tri-state, as `Patient.contactConsent`. Only an explicit `false` closes it. */
  consent: boolean | null;
}) {
  const t = useTranslations('appointments');
  const [, startTransition] = useTransition();

  // A row for somebody who has since asked not to be contacted. The job's rules
  // would never have queued it, so this is the case where the answer changed
  // after the row was written — and the refusal has to hold here too, or the
  // setting is decorative on the one screen built for sending things.
  if (consent === false) {
    return (
      <p className="flex items-center gap-1.5 text-[0.9rem] font-semibold text-ink-faint">
        <BellOff size={17} aria-hidden className="shrink-0" />
        {t('optedOut')}
      </p>
    );
  }

  const record = (channel: 'WHATSAPP' | 'EMAIL') => {
    startTransition(async () => {
      await sendQueuedMessage({ id: messageId, channel, body });
    });
  };

  return (
    <>
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm"
          onClick={() => record('WHATSAPP')}
        >
          <MessageCircle size={17} aria-hidden className="shrink-0" />
          {t('remindWhatsapp')}
        </a>
      ) : (
        <span className="btn btn-secondary btn-sm opacity-55" title={t('noPhoneForReminder')}>
          <MessageCircle size={17} aria-hidden className="shrink-0" />
          {t('remindWhatsapp')}
        </span>
      )}

      {mail ? (
        <a href={mail} className="btn btn-secondary btn-sm" onClick={() => record('EMAIL')}>
          <Mail size={17} aria-hidden className="shrink-0" />
          {t('remindEmail')}
        </a>
      ) : (
        <span className="btn btn-secondary btn-sm opacity-55" title={t('noEmailForReminder')}>
          <Mail size={17} aria-hidden className="shrink-0" />
          {t('remindEmail')}
        </span>
      )}
    </>
  );
}
