'use client';

import { BellOff, Check, Mail, MessageCircle, Pencil, Phone, PhoneCall, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { CopyButton } from '@/components/ui/CopyButton';
import { logContact } from '@/lib/actions/contacts';
import type { ComposedTemplate } from '@/lib/messages/template-constants';
import { mailtoLink, telLink, whatsappChatLink } from '@/lib/reminders';
import { MessageDialog } from './MessageDialog';

/**
 * The phone number and the address, as things you can *do* something with.
 *
 * They used to be a `tel:` link and a `mailto:` link, and on a desktop those are
 * very often nothing at all. Both are protocol hand-offs: whether a click does
 * anything depends on what the *workstation* has registered as a handler, and a
 * front desk running a browser with no mail client set up gets silence — no
 * error, no window, nothing to report to anybody. It had been that way for as
 * long as the header has existed and nobody could have known, because a link
 * that does nothing looks exactly like a link nobody clicked.
 *
 * So every route out of here now has one option that cannot fail: WhatsApp,
 * which is an ordinary HTTPS URL and opens on any machine with a browser; a
 * message the server sends itself; and copy-to-clipboard, which is what somebody
 * does anyway when they are about to dial a desk phone. The `tel:` and `mailto:`
 * links are still offered — they are genuinely the fastest route on a tablet,
 * and on a machine with Outlook — but they are no longer the *only* route, which
 * is the part that was broken.
 */
export function ContactActions({
  patientId,
  patientName,
  phone,
  email,
  consent,
  preferredChannel,
  canMessage,
  templates,
  messageLocale,
  readerLocale,
  mailerConfigured,
}: {
  patientId: string;
  patientName: string;
  phone: string;
  email: string;
  /** Tri-state, as `Patient.contactConsent`. Only an explicit `false` closes it. */
  consent: boolean | null;
  /**
   * `Patient.preferredChannel`. Collected by the edit form since the day it was
   * written and read by nothing until now, which made it a question the front
   * desk was asking patients for no reason.
   */
  preferredChannel: string | null;
  canMessage: boolean;
  templates: ComposedTemplate[];
  messageLocale: string;
  readerLocale: string;
  mailerConfigured: boolean;
}) {
  const t = useTranslations('contacts');

  const whatsapp = whatsappChatLink(phone);
  const dial = telLink(phone);
  const draft = email ? mailtoLink(email, '', '') : null;
  const optedOut = consent === false;

  const message = {
    patientId,
    patientName,
    phone,
    email,
    consent,
    templates,
    messageLocale,
    readerLocale,
    mailerConfigured,
  };

  return (
    <>
      {phone ? (
        <ActionMenu
          label={t('phoneActions')}
          align="start"
          triggerClassName="contact-chip"
          trigger={
            <>
              <Phone size={17} aria-hidden className="shrink-0" />
              {phone}
            </>
          }
        >
          {optedOut ? (
            <p className="menu-item menu-item-muted">
              <BellOff size={18} aria-hidden className="shrink-0" />
              {t('optedOut')}
            </p>
          ) : whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="menu-item"
            >
              <MessageCircle size={18} aria-hidden className="shrink-0" />
              {t('openWhatsapp')}
              <Preferred when={preferredChannel === 'WHATSAPP'} label={t('preferred')} />
            </a>
          ) : null}

          {dial ? (
            <a href={dial} role="menuitem" className="menu-item" title={t('callHint')}>
              <PhoneCall size={18} aria-hidden className="shrink-0" />
              {t('call')}
              <Preferred when={preferredChannel === 'PHONE'} label={t('preferred')} />
            </a>
          ) : null}

          <CopyButton
            role="menuitem"
            className="menu-item"
            iconSize={18}
            value={phone}
            label={t('copyNumber')}
            copiedLabel={t('copied')}
          />

          {/* The one channel where the practice really does know the message
              was delivered, and the only one the app had no way to record. A
              call made from the desk phone left no trace at all until now. */}
          {canMessage && !optedOut ? (
            <LogCallItem patientId={patientId} label={t('logCall')} body={t('logCallBody')} />
          ) : null}
        </ActionMenu>
      ) : null}

      {email ? (
        <ActionMenu
          label={t('emailActions')}
          align="start"
          triggerClassName="contact-chip"
          trigger={
            <>
              <Mail size={17} aria-hidden className="shrink-0" />
              {email}
            </>
          }
        >
          {optedOut ? (
            <p className="menu-item menu-item-muted">
              <BellOff size={18} aria-hidden className="shrink-0" />
              {t('optedOut')}
            </p>
          ) : canMessage ? (
            <MessageDialog
              {...message}
              triggerClassName="menu-item"
              trigger={
                <>
                  <Pencil size={18} aria-hidden className="shrink-0" />
                  {t('writeMessage')}
                  <Preferred when={preferredChannel === 'EMAIL'} label={t('preferred')} />
                </>
              }
            />
          ) : null}

          {draft ? (
            <a href={draft} role="menuitem" className="menu-item" title={t('mailClientHint')}>
              <Mail size={18} aria-hidden className="shrink-0" />
              {t('openMailClient')}
            </a>
          ) : null}

          <CopyButton
            role="menuitem"
            className="menu-item"
            iconSize={18}
            value={email}
            label={t('copyEmail')}
            copiedLabel={t('copied')}
          />
        </ActionMenu>
      ) : null}
    </>
  );
}

/** A quiet mark on the channel this patient said they preferred. */
function Preferred({ when, label }: { when: boolean; label: string }) {
  if (!when) return null;
  return (
    <span className="ml-auto flex items-center gap-1 text-[0.82rem] font-semibold text-brand-deep">
      <Star size={13} aria-hidden className="shrink-0 fill-current" />
      {label}
    </span>
  );
}

/** "I rang them." One row on the contact log, and no message anywhere. */
function LogCallItem({
  patientId,
  label,
  body,
}: {
  patientId: string;
  label: string;
  body: string;
}) {
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      disabled={saved}
      onClick={() => {
        setSaved(true);
        startTransition(async () => {
          await logContact({ patientId, channel: 'PHONE', purpose: 'OTHER', body });
        });
      }}
    >
      {saved ? (
        <Check size={18} aria-hidden className="shrink-0 text-ok" />
      ) : (
        <PhoneCall size={18} aria-hidden className="shrink-0" />
      )}
      {label}
    </button>
  );
}
