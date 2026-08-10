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
 * Two buttons and nothing else. The patient may change their mind — answering
 * again simply overwrites the previous answer — so the form stays available
 * after a response rather than locking them out of correcting a mis-tap.
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
