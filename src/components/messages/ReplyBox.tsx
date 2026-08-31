'use client';

import { BellOff, MailWarning, Reply } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { replyToThread } from '@/lib/actions/inbox';
import { IDLE_STATE } from '@/lib/actions/types';
import { MAX_MESSAGE_LENGTH } from '@/lib/messages/template-constants';

/**
 * Answering, from inside the app.
 *
 * The one thing that would otherwise send everybody back to a mail client, and
 * with them the thread — a reply sent from Outlook lands in the patient's inbox
 * and nowhere in this record, which is how a correspondence log quietly becomes
 * half a correspondence log.
 *
 * Three states, and each is a different sentence:
 *
 *  - **No provider configured.** The app cannot send at all. Saying so here is
 *    better than a box that accepts a reply and then refuses it.
 *  - **The patient asked not to be contacted.** Refused, the same way every
 *    other screen refuses it. A thread they opened themselves does not reopen
 *    the door: they may write to the practice whenever they like, and the
 *    practice still may not write back.
 *  - **Otherwise**, a textarea and a send button.
 */
export function ReplyBox({
  threadId,
  correspondent,
  configured,
  optedOut,
}: {
  threadId: string;
  correspondent: string;
  configured: boolean;
  optedOut: boolean;
}) {
  const t = useTranslations('inbox');
  const uid = useId();

  const [body, setBody] = useState('');
  const [state, formAction] = useActionState(replyToThread, IDLE_STATE);
  const handledTs = useRef<number | undefined>(undefined);

  // Emptied only once it has actually gone. A refusal leaves the words where
  // they were typed, which is the whole reason this is not a plain form.
  useEffect(() => {
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;
    setBody('');
  }, [state]);

  if (optedOut) {
    return (
      <Card>
        <p className="flex items-center justify-center gap-2 px-5 py-6 text-center font-semibold text-ink-faint">
          <BellOff size={20} aria-hidden />
          {t('optedOutError')}
        </p>
      </Card>
    );
  }

  if (!configured) {
    return (
      <Card>
        <p className="flex flex-wrap items-center justify-center gap-2 px-5 py-6 text-center font-semibold text-ink-soft">
          <MailWarning size={20} aria-hidden />
          {t('mailNotConfigured')}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={t('replyTitle')}
        subtitle={t('replyTo', { address: correspondent })}
        icon={<Reply size={22} aria-hidden />}
      />

      <form action={formAction} className="space-y-3 px-5 py-5">
        {/* The address is not in this form and must not be. The action reads it
            off the thread — see `replyToThread`, which explains why a reply box
            carrying its own recipient would be an open relay on the practice's
            verified domain. */}
        <input type="hidden" name="threadId" value={threadId} />

        <label className="sr-only" htmlFor={`${uid}-body`}>
          {t('replyTitle')}
        </label>
        <textarea
          id={`${uid}-body`}
          name="body"
          required
          rows={6}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={t('replyPlaceholder')}
          className="field-input min-h-32 resize-y"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />

        {state.status === 'error' ? (
          <p
            role="alert"
            className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="text-meta text-ink-faint tabular-nums">
            {body.length} / {MAX_MESSAGE_LENGTH}
          </span>
          <SubmitButton label={t('send')} pendingLabel={t('sending')} />
        </div>
      </form>
    </Card>
  );
}
