'use client';

import { BellOff, Mail, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { logContact } from '@/lib/actions/contacts';

/**
 * Reminders open WhatsApp / the mail client with the message pre-filled — the
 * dentist stays the sender and reviews every message before it leaves.
 *
 * Opening one also writes a line to the contact log. That is the closest thing
 * to "a message was sent" this app can honestly record, and it is what lets the
 * next person see that the patient was already chased this morning.
 */
export function ReminderLinks({
  patientId,
  appointmentId,
  whatsapp,
  mail,
  body,
  consent = null,
  purpose = 'REMINDER',
  size = 'sm',
}: {
  patientId: string;
  appointmentId?: string;
  /** Pre-composed hrefs — the wording is built server-side, in the patient's language. */
  whatsapp: string | null;
  mail: string | null;
  body: string;
  /**
   * Tri-state, matching `Patient.contactConsent`. `null` is "nobody has asked",
   * which is not a refusal — the honest state of every record that predates the
   * question, and messaging is still offered. Only an explicit `false` closes it.
   */
  consent?: boolean | null;
  purpose?: 'REMINDER' | 'RECALL' | 'CONFIRMATION' | 'FOLLOW_UP' | 'OTHER';
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('appointments');
  const [, startTransition] = useTransition();

  const buttonClass = size === 'sm' ? 'btn btn-secondary btn-sm' : 'btn btn-secondary';
  const iconSize = size === 'sm' ? 17 : 19;

  // Asking somebody who said not to is worse than not asking at all. The
  // dashboard's chase list already honoured this in its query; every other
  // screen offered the button anyway, which made the setting decorative.
  if (consent === false) {
    return (
      <p className="flex items-center gap-1.5 text-[0.9rem] font-semibold text-ink-faint">
        <BellOff size={iconSize} aria-hidden />
        {t('optedOut')}
      </p>
    );
  }

  // Fire-and-forget: the log must never delay or block the message. The link's
  // own navigation is left alone, so this works the same whether WhatsApp opens
  // in a tab, an app, or not at all.
  const record = (channel: 'WHATSAPP' | 'EMAIL') => {
    startTransition(async () => {
      await logContact({ patientId, appointmentId, channel, purpose, body });
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
          title={t('remind')}
          onClick={() => record('WHATSAPP')}
        >
          <MessageCircle size={iconSize} aria-hidden />
          {t('remindWhatsapp')}
        </a>
      ) : (
        <span className={`${buttonClass} opacity-55`} title={t('noPhoneForReminder')}>
          <MessageCircle size={iconSize} aria-hidden />
          {t('remindWhatsapp')}
        </span>
      )}

      {mail ? (
        <a href={mail} className={buttonClass} title={t('remind')} onClick={() => record('EMAIL')}>
          <Mail size={iconSize} aria-hidden />
          {t('remindEmail')}
        </a>
      ) : (
        <span className={`${buttonClass} opacity-55`} title={t('noEmailForReminder')}>
          <Mail size={iconSize} aria-hidden />
          {t('remindEmail')}
        </span>
      )}
    </div>
  );
}
