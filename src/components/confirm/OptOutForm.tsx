'use client';

import { BellOff, BellRing } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { setContactConsent } from '@/lib/actions/opt-out';
import { IDLE_STATE } from '@/lib/actions/types';
import { cn } from '@/lib/utils';

function AnswerButton({
  answer,
  label,
  tone,
  onPick,
}: {
  answer: 'out' | 'in';
  label: string;
  tone: 'primary' | 'secondary';
  onPick: (answer: 'out' | 'in') => void;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="answer"
      value={answer}
      disabled={pending}
      onClick={() => onPick(answer)}
      className={cn('btn btn-lg flex-1', tone === 'primary' ? 'btn-primary' : 'btn-secondary')}
    >
      {answer === 'out' ? <BellOff size={20} aria-hidden /> : <BellRing size={20} aria-hidden />}
      {label}
    </button>
  );
}

/**
 * One button that stops the messages, and one that starts them again.
 *
 * Both stay available after either press, which is the whole difference between
 * this and the confirmation form next door. There, answering "no" gives up a
 * slot that may already have been offered to somebody else, so the page must
 * not offer to undo it. Here nothing is given away: consent is a fact about
 * what somebody wants today, and the honest thing to do with a patient who taps
 * the wrong one on a phone is let them tap the other.
 *
 * The current setting is shown as the answer rather than as a form control,
 * because a page reached from a link in an email has one job and a checkbox
 * somebody has to then submit is a second one.
 */
export function OptOutForm({
  token,
  optedOut,
}: {
  token: string;
  /** What the record says right now, so the page opens on the truth. */
  optedOut: boolean;
}) {
  const t = useTranslations('unsubscribe');
  const [state, formAction] = useActionState(setContactConsent, IDLE_STATE);
  const [picked, setPicked] = useState<'out' | 'in' | null>(null);

  const answered = state.status === 'ok' ? picked : optedOut ? 'out' : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {answered ? (
        <p
          role="status"
          className={cn(
            'rounded-lg border px-4 py-3 text-body font-semibold',
            answered === 'out'
              ? 'border-line-strong bg-paper text-ink-soft'
              : 'border-ok/30 bg-ok-soft text-ok',
          )}
        >
          {answered === 'out' ? t('doneOut') : t('doneIn')}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft px-4 py-3 font-semibold text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {answered === 'out' ? (
          <AnswerButton answer="in" label={t('optIn')} tone="secondary" onPick={setPicked} />
        ) : (
          <AnswerButton answer="out" label={t('optOut')} tone="primary" onPick={setPicked} />
        )}
      </div>

      <p className="text-center text-meta text-ink-soft">{t('stillReachable')}</p>
    </form>
  );
}
