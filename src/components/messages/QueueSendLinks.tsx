'use client';

import { BellOff, Mail, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';
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
  preferred,
  emailBounced,
  emailAction,
}: {
  messageId: string;
  /** Pre-composed hrefs, in the patient's language. Null when there is no number/address. */
  whatsapp: string | null;
  mail: string | null;
  body: string;
  /** Tri-state, as `Patient.contactConsent`. Only an explicit `false` closes it. */
  consent: boolean | null;
  /**
   * `Patient.preferredChannel`, when they were asked.
   *
   * Read here for the first time on this screen. The patient record has marked
   * the preferred channel since the field was collected, and the queue — the
   * one screen whose entire purpose is contacting people — offered WhatsApp
   * first to everybody, including the patients who had said they would rather
   * be emailed. It changes which button is the filled one, and nothing else: a
   * preference is not a refusal, so every channel stays available.
   */
  preferred?: string | null;
  /**
   * Whether the address on the record is one the provider has told us does not
   * work. Changes what the disabled button says, which is the difference
   * between "they never gave us an address" and "the one we have is dead".
   */
  emailBounced?: boolean;
  /**
   * The button that really sends, when a mail provider is configured. Given as a
   * slot rather than a flag because it is a server-rendered form and this is a
   * client component — and because passing it here rather than beside this
   * component means the consent refusal below covers it too. A screen where the
   * draft link honours an opt-out and the send button does not would be worse
   * than one that honours neither.
   */
  emailAction?: ReactNode;
}) {
  const t = useTranslations('appointments');
  const [, startTransition] = useTransition();

  // A row for somebody who has since asked not to be contacted. The job's rules
  // would never have queued it, so this is the case where the answer changed
  // after the row was written — and the refusal has to hold here too, or the
  // setting is decorative on the one screen built for sending things.
  if (consent === false) {
    return (
      <p className="flex items-center gap-1.5 text-meta font-semibold text-ink-faint">
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

  // Which button is filled. The preference decides it when there is one, and
  // WhatsApp keeps it otherwise — it is the channel this practice reaches most
  // patients on, and the one that was hard-coded here before.
  const emailFirst = preferred === 'EMAIL';
  const whatsappTone = emailFirst ? 'btn-secondary' : 'btn-primary';
  const emailTone = emailFirst ? 'btn-primary' : 'btn-secondary';

  return (
    <>
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn btn-sm ${whatsappTone}`}
          onClick={() => record('WHATSAPP')}
        >
          <MessageCircle size={17} aria-hidden className="shrink-0" />
          {t('remindWhatsapp')}
        </a>
      ) : (
        <button type="button" disabled className="btn btn-secondary btn-sm" title={t('noPhoneForReminder')}>
          <MessageCircle size={17} aria-hidden className="shrink-0" />
          {t('remindWhatsapp')}
        </button>
      )}

      {/* When the practice has a mail provider this is a button that sends;
          when it has not, the same job is done by the draft link below, which
          is how a clinic that never configures one keeps working exactly as it
          does today. */}
      {emailAction ??
        (mail ? (
          <a href={mail} className={`btn btn-sm ${emailTone}`} onClick={() => record('EMAIL')}>
            <Mail size={17} aria-hidden className="shrink-0" />
            {t('remindEmail')}
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="btn btn-secondary btn-sm"
            title={emailBounced ? t('bouncedAddress') : t('noEmailForReminder')}
          >
            <Mail size={17} aria-hidden className="shrink-0" />
            {t('remindEmail')}
          </button>
        ))}
    </>
  );
}
