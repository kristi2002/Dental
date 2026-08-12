'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createFirstOwner } from '@/lib/actions/auth';
import { IDLE_STATE } from '@/lib/actions/types';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/lib/auth/pin-constants';

/**
 * The one-time form that creates the practice's first Owner.
 *
 * A plain form rather than the PIN pad the sign-in screen uses: this is typed
 * once, on whatever device happens to be doing the deployment, and the PIN has
 * to be entered twice — there is nobody who can reset it if it is mistyped.
 */
export function SetupForm() {
  const t = useTranslations('setup');
  const tp = useTranslations('patients');
  const tc = useTranslations('common');
  const uid = useId();
  const [state, formAction] = useActionState(createFirstOwner, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-firstName`}
          name="firstName"
          label={tp('firstName')}
          required
          autoComplete="given-name"
        />
        <TextField
          id={`${uid}-lastName`}
          name="lastName"
          label={tp('lastName')}
          required
          autoComplete="family-name"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-pin`}
          name="pin"
          type="password"
          inputMode="numeric"
          label={t('pin')}
          hint={t('pinHint', { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH })}
          required
          autoComplete="new-password"
          minLength={PIN_MIN_LENGTH}
          maxLength={PIN_MAX_LENGTH}
        />
        <TextField
          id={`${uid}-confirmPin`}
          name="confirmPin"
          type="password"
          inputMode="numeric"
          label={t('confirmPin')}
          required
          autoComplete="new-password"
          minLength={PIN_MIN_LENGTH}
          maxLength={PIN_MAX_LENGTH}
        />
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft px-4 py-3 font-semibold text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <p className="flex items-start gap-2.5 rounded-lg border border-line-strong bg-paper px-4 py-3 text-[0.95rem] text-ink-soft">
        <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-brand" />
        {t('afterHint')}
      </p>

      <SubmitButton
        label={t('createOwner')}
        pendingLabel={tc('saving')}
        className="btn btn-primary btn-lg w-full"
      />
    </form>
  );
}
