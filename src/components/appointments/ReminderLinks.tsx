'use client';

import { BellOff, Mail, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';
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
  variant = 'button',
  emailSend,
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
  /**
   * `menu` is the same two links as rows inside an `ActionMenu` — same hrefs,
   * same logging, no box of their own. See `.menu-item`.
   */
  variant?: 'button' | 'menu';
  /**
   * The button that really sends, for a practice that has configured a mail
   * provider. Replaces the `mailto:` draft rather than joining it — two email
   * buttons side by side would be a question nobody at a desk should have to
   * answer.
   *
   * A slot rather than a flag, exactly as `QueueSendLinks.emailAction` is, and
   * for the same two reasons: the form it contains is server-rendered while
   * this is a client component, and passing it *through* here means the consent
   * refusal above covers it too. A screen where the draft link honours an
   * opt-out and the send button does not is worse than one that honours
   * neither.
   */
  emailSend?: ReactNode;
}) {
  const t = useTranslations('appointments');
  const [, startTransition] = useTransition();

  const inMenu = variant === 'menu';
  const buttonClass = inMenu
    ? 'menu-item'
    : size === 'sm'
      ? 'btn btn-secondary btn-sm'
      : 'btn btn-secondary';
  const iconSize = size === 'sm' && !inMenu ? 17 : 19;

  // Asking somebody who said not to is worse than not asking at all. The
  // dashboard's chase list already honoured this in its query; every other
  // screen offered the button anyway, which made the setting decorative.
  if (consent === false) {
    return (
      <p
        className={
          inMenu
            ? 'menu-item menu-item-muted'
            : 'flex items-center gap-1.5 text-[0.9rem] font-semibold text-ink-faint'
        }
      >
        <BellOff size={iconSize} aria-hidden className="shrink-0" />
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

  // Inside a menu the panel is already the box, so the wrapper steps out of the
  // way with `contents` and the two rows sit straight in the menu.
  const wrapperClass = inMenu ? 'contents' : 'flex flex-wrap items-center gap-2';
  const mutedClass = inMenu ? 'menu-item menu-item-muted' : `${buttonClass} opacity-55`;
  const role = inMenu ? 'menuitem' : undefined;

  return (
    <div className={wrapperClass}>
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          role={role}
          className={buttonClass}
          title={t('remind')}
          onClick={() => record('WHATSAPP')}
        >
          <MessageCircle size={iconSize} aria-hidden className="shrink-0" />
          {t('remindWhatsapp')}
        </a>
      ) : (
        <span className={mutedClass} title={t('noPhoneForReminder')}>
          <MessageCircle size={iconSize} aria-hidden className="shrink-0" />
          {t('remindWhatsapp')}
        </span>
      )}

      {emailSend ??
        (mail ? (
          <a
            href={mail}
            role={role}
            className={buttonClass}
            title={t('remind')}
            onClick={() => record('EMAIL')}
          >
            <Mail size={iconSize} aria-hidden className="shrink-0" />
            {t('remindEmail')}
          </a>
        ) : (
          <span className={mutedClass} title={t('noEmailForReminder')}>
            <Mail size={iconSize} aria-hidden className="shrink-0" />
            {t('remindEmail')}
          </span>
        ))}
    </div>
  );
}
