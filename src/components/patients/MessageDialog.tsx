'use client';

import { BellOff, Languages, Mail, MessageCircle, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { logContact } from '@/lib/actions/contacts';
import { sendPatientMessage } from '@/lib/actions/messages';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  MAX_MESSAGE_LENGTH,
  type ComposedTemplate,
  type TemplateId,
} from '@/lib/messages/template-constants';
import { mailtoLink, whatsappLink } from '@/lib/reminders';

/**
 * Writing to one patient.
 *
 * The gap this fills is embarrassing once seen: the app could remind somebody
 * about tomorrow's appointment and could chase them for a recall, and had no way
 * at all to simply *write to them* — "your crown is back", "we are shut on
 * Friday", "the swelling you described is normal". Every one of those went out
 * through somebody's personal WhatsApp, unlogged.
 *
 * **The templates are a starting point and not a form.** They arrive composed,
 * in the patient's language, and land in a textarea somebody can rewrite. That
 * is the honest arrangement for a clinic: the six things on the list cover
 * perhaps half of what gets said, and a picker that could not be argued with
 * would just be worked around.
 *
 * **Two send buttons, and they are not equivalent.** WhatsApp opens a draft the
 * user presses send in — the app never sees it leave, and says so. Email is sent
 * by the server when a provider is configured, and is a `mailto:` draft when it
 * is not. That ladder is the same one the send queue climbs, and it is why a
 * practice that configures nothing still has a working screen here.
 */
export function MessageDialog({
  patientId,
  patientName,
  phone,
  email,
  consent,
  templates,
  messageLocale,
  readerLocale,
  mailerConfigured,
  trigger,
  triggerClassName = 'btn btn-secondary',
  triggerTitle,
}: {
  patientId: string;
  patientName: string;
  phone: string;
  email: string;
  /** Tri-state, as `Patient.contactConsent`. Only an explicit `false` closes it. */
  consent: boolean | null;
  /** Composed server-side, in the patient's language. See `composeTemplates`. */
  templates: ComposedTemplate[];
  /** Which language the bodies came out in… */
  messageLocale: string;
  /** …and the one the person at the desk is reading, to know whether to say so. */
  readerLocale: string;
  mailerConfigured: boolean;
  trigger: ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
}) {
  const t = useTranslations('messageTemplates');
  const tc = useTranslations('common');

  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();

  const [templateId, setTemplateId] = useState<TemplateId>(templates[0]?.id ?? 'FREE');
  const [subject, setSubject] = useState(templates[0]?.subject ?? '');
  const [body, setBody] = useState(templates[0]?.body ?? '');

  const [state, formAction] = useActionState(sendPatientMessage, IDLE_STATE);
  const handledTs = useRef<number | undefined>(undefined);

  // Closes itself once the send worked, and only then — a refusal has to leave
  // the wording on screen or somebody retypes it.
  useEffect(() => {
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;
    dialogRef.current?.close();
  }, [state]);

  function choose(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(template.id);
    // Deliberately clobbers whatever was typed. Picking a different template is
    // an unambiguous statement about what the message should say, and a merge
    // would leave a paragraph of the old one stranded underneath the new.
    setSubject(template.subject);
    setBody(template.body);
  }

  const whatsapp = phone && body.trim() ? whatsappLink(phone, body) : null;
  const mailDraft = email && body.trim() ? mailtoLink(email, subject, body) : null;
  const optedOut = consent === false;

  return (
    <>
      <button
        type="button"
        title={triggerTitle}
        className={triggerClassName}
        onClick={() => dialogRef.current?.showModal()}
      >
        {trigger}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-title`}
        className="m-auto max-h-[88vh] w-[min(94vw,44rem)] overflow-visible rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop"
      >
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={`${uid}-title`} className="text-xl font-bold">
              {t('title', { name: patientName })}
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={tc('close')}
              onClick={() => dialogRef.current?.close()}
            >
              <X size={20} aria-hidden />
            </button>
          </header>

          {optedOut ? (
            /* The whole dialog, refused. Every other screen honours the setting
               with a muted row; here there is nothing to mute, so it says the
               thing outright and offers no way past it. */
            <div className="px-5 py-8">
              <p className="flex items-center justify-center gap-2 text-center font-semibold text-ink-faint">
                <BellOff size={20} aria-hidden />
                {t('optedOut')}
              </p>
            </div>
          ) : (
            <form action={formAction} className="flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="patientId" value={patientId} />
              <input type="hidden" name="purpose" value={PURPOSE[templateId] ?? 'OTHER'} />

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <div className="field">
                  <label className="field-label" htmlFor={`${uid}-template`}>
                    {t('template')}
                  </label>
                  <select
                    id={`${uid}-template`}
                    className="field-input"
                    value={templateId}
                    onChange={(event) => choose(event.target.value)}
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Said only when it is worth saying. A receptionist reading
                    Albanian who is about to send Italian should know that is
                    deliberate rather than a bug she is looking at. */}
                {messageLocale !== readerLocale ? (
                  <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-soft px-3 py-2 text-[0.92rem] text-ink-soft">
                    <Languages size={17} aria-hidden className="shrink-0" />
                    {t('writtenIn', { language: t(`language_${messageLocale}`) })}
                  </p>
                ) : null}

                <div className="field">
                  <label className="field-label" htmlFor={`${uid}-subject`}>
                    {t('subject')}
                    <span className="ml-1.5 font-normal text-ink-faint">{t('emailOnly')}</span>
                  </label>
                  <input
                    id={`${uid}-subject`}
                    name="subject"
                    className="field-input"
                    maxLength={300}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor={`${uid}-body`}>
                    {t('body')}
                  </label>
                  <textarea
                    id={`${uid}-body`}
                    name="body"
                    required
                    rows={9}
                    maxLength={MAX_MESSAGE_LENGTH}
                    className="field-input min-h-44 resize-y"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                  <p className="mt-1 text-right text-[0.85rem] text-ink-faint tabular-nums">
                    {body.length} / {MAX_MESSAGE_LENGTH}
                  </p>
                </div>

                {state.status === 'error' ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
                  >
                    {state.message}
                  </p>
                ) : null}
              </div>

              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">
                <button
                  type="button"
                  className="btn btn-ghost mr-auto"
                  onClick={() => dialogRef.current?.close()}
                >
                  {tc('cancel')}
                </button>

                {/* Opens a draft; the user presses send. Logged on the press,
                    which is the most this app can honestly claim — the same
                    wording and the same reasoning as `ReminderLinks`. */}
                {whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    onClick={() => {
                      void logContact({
                        patientId,
                        channel: 'WHATSAPP',
                        purpose: PURPOSE[templateId] ?? 'OTHER',
                        body,
                      });
                      dialogRef.current?.close();
                    }}
                  >
                    <MessageCircle size={18} aria-hidden />
                    {t('sendWhatsapp')}
                  </a>
                ) : (
                  <span className="btn btn-secondary opacity-55" title={t('noPhone')}>
                    <MessageCircle size={18} aria-hidden />
                    {t('sendWhatsapp')}
                  </span>
                )}

                {email ? (
                  mailerConfigured ? (
                    <SubmitButton label={t('sendEmail')} pendingLabel={t('sending')} />
                  ) : (
                    /* No provider configured, so the app cannot send it — the
                       mail client can. This is the link that does nothing on a
                       workstation with no mail client registered, which is
                       exactly why the button above it exists. */
                    <a
                      href={mailDraft ?? undefined}
                      className={mailDraft ? 'btn btn-secondary' : 'btn btn-secondary opacity-55'}
                      title={t('draftHint')}
                      onClick={() => {
                        if (!mailDraft) return;
                        void logContact({
                          patientId,
                          channel: 'EMAIL',
                          purpose: PURPOSE[templateId] ?? 'OTHER',
                          body,
                        });
                      }}
                    >
                      <Mail size={18} aria-hidden />
                      {t('draftEmail')}
                    </a>
                  )
                ) : (
                  <span className="btn btn-secondary opacity-55" title={t('noEmail')}>
                    <Send size={18} aria-hidden />
                    {t('sendEmail')}
                  </span>
                )}
              </footer>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * Which kind of contact each template records.
 *
 * The `Contact` log already sorts by purpose and the patient record groups by
 * it, so a message sent from here should land in the same bucket the equivalent
 * automated one would — a recall written by hand is still a recall.
 */
const PURPOSE: Record<string, string> = {
  FREE: 'OTHER',
  RECALL: 'RECALL',
  CONFIRM: 'CONFIRMATION',
  RUNNING_LATE: 'REMINDER',
  POST_OP: 'FOLLOW_UP',
  DOCUMENT_READY: 'OTHER',
};
