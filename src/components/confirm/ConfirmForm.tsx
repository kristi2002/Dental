'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { respondToAppointment } from '@/lib/actions/confirmations';
import { IDLE_STATE } from '@/lib/actions/types';
import { cn } from '@/lib/utils';

function AnswerButton({
  answer,
  label,
  tone,
  onPick,
}: {
  answer: 'yes' | 'no';
  label: string;
  tone: 'primary' | 'secondary';
  onPick: (answer: 'yes' | 'no') => void;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="answer"
      value={answer}
      disabled={pending}
      onClick={() => onPick(answer)}
      className={cn(
        'btn btn-lg flex-1',
        tone === 'primary' ? 'btn-primary' : 'btn-secondary',
      )}
    >
      {answer === 'yes' ? <Check size={20} aria-hidden /> : <X size={20} aria-hidden />}
      {label}
    </button>
  );
}

/**
 * Two buttons and nothing else.
 *
 * A patient who has confirmed may still change their mind — answering "no"
 * overwrites the "yes" — so the buttons stay available rather than locking
 * somebody out of correcting a mis-tap.
 *
 * A cancellation is where that stops. Once the slot is given up it may already
 * have been offered to somebody else, so re-confirming it here would silently
 * double-book the chair. The server refuses; this must not offer the button,
 * because a button that always returns an error is worse than no button.
 */
export function ConfirmForm({
  token,
  alreadyConfirmed,
  alreadyDeclined,
  closed,
}: {
  token: string;
  alreadyConfirmed: boolean;
  alreadyDeclined: boolean;
  closed: boolean;
}) {
  const t = useTranslations('confirm');
  const [state, formAction] = useActionState(respondToAppointment, IDLE_STATE);
  const [picked, setPicked] = useState<'yes' | 'no' | null>(null);

  if (closed) {
    return (
      <p className="rounded-lg border border-line bg-surface-soft px-4 py-3 text-[1.02rem] text-ink-soft">
        {t('closed')}
      </p>
    );
  }

  const answered = state.status === 'ok' ? picked : alreadyConfirmed ? 'yes' : alreadyDeclined ? 'no' : null;

  // Declined on this visit, or already cancelled when the page loaded. Either
  // way the slot is gone and the next move is a phone call, not a tap.
  if (alreadyDeclined || (state.status === 'ok' && picked === 'no')) {
    return (
      <div className="space-y-3">
        <p
          role="status"
          className="rounded-lg border border-line-strong bg-paper px-4 py-3 text-[1.05rem] font-semibold text-ink-soft"
        >
          {t('thanksDeclined')}
        </p>
        <p className="text-center text-[0.95rem] text-ink-soft">{t('cancelledNotice')}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {answered ? (
        <p
          role="status"
          className={cn(
            'rounded-lg border px-4 py-3 text-[1.05rem] font-semibold',
            answered === 'yes'
              ? 'border-ok/30 bg-ok-soft text-ok'
              : 'border-line-strong bg-paper text-ink-soft',
          )}
        >
          {answered === 'yes' ? t('thanksConfirmed') : t('thanksDeclined')}
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
        <AnswerButton answer="yes" label={t('yes')} tone="primary" onPick={setPicked} />
        <AnswerButton answer="no" label={t('no')} tone="secondary" onPick={setPicked} />
      </div>

      <p className="text-center text-[0.9rem] text-ink-soft">{t('changeMind')}</p>
    </form>
  );
}
