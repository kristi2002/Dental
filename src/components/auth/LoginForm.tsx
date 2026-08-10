'use client';

import { ArrowLeft, Delete, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { Role } from '@/generated/prisma/enums';
import { signIn } from '@/lib/actions/auth';
import { IDLE_STATE } from '@/lib/actions/types';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/lib/auth/pin-constants';
import { cn, initials } from '@/lib/utils';

export type StaffOption = { id: string; firstName: string; lastName: string; role: Role };

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function LoginForm({ staff }: { staff: StaffOption[] }) {
  const t = useTranslations('auth');
  const tr = useTranslations('roles');
  const [state, formAction] = useActionState(signIn, IDLE_STATE);
  const [selected, setSelected] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // A rejected PIN clears itself — retyping is faster than deleting six digits.
  useEffect(() => {
    if (state.status === 'error') setPin('');
  }, [state]);

  if (staff.length === 0) {
    return (
      <div className="rounded-lg border border-warn bg-warn-soft px-4 py-3 font-semibold text-warn">
        {t('noStaff')}
      </div>
    );
  }

  if (!selected) {
    return (
      <div>
        <h2 className="field-label">{t('whoAreYou')}</h2>
        <ul className="mt-1 grid gap-2.5 sm:grid-cols-2">
          {staff.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => setSelected(person)}
                className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-line-strong bg-surface px-3.5 py-3 text-left transition-colors hover:border-brand hover:bg-brand-soft"
              >
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-[1.05rem] font-bold text-brand-deep"
                >
                  {initials(person.firstName, person.lastName)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[1.05rem] font-bold text-ink">
                    {person.firstName} {person.lastName}
                  </span>
                  <span className="block truncate text-[0.9rem] text-ink-soft">
                    {tr(person.role)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const complete = pin.length >= PIN_MIN_LENGTH;

  function press(digit: string) {
    setPin((current) => (current.length >= PIN_MAX_LENGTH ? current : current + digit));
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="staffId" value={selected.id} />
      <input type="hidden" name="pin" value={pin} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setSelected(null);
            setPin('');
          }}
        >
          <ArrowLeft size={18} aria-hidden />
          {t('changePerson')}
        </button>
        <Badge tone="brand">
          {selected.firstName} {selected.lastName}
        </Badge>
      </div>

      <div>
        <p className="field-label">{t('enterPin')}</p>
        {/* Filled dots, not the digits — the screen faces a waiting room. */}
        <div className="flex justify-center gap-2.5 py-2" aria-hidden>
          {Array.from({ length: PIN_MAX_LENGTH }, (_, index) => (
            <span
              key={index}
              className={cn(
                'size-3.5 rounded-full border-2 transition-colors',
                index < pin.length ? 'border-brand-dark bg-brand-dark' : 'border-line-strong',
              )}
            />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {t('digitsEntered', { count: pin.length })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-[1.6rem] font-bold text-ink transition-colors hover:border-brand hover:bg-brand-soft"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setPin('')}
          disabled={pin.length === 0}
          className="rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-[0.95rem] font-bold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          {t('clear')}
        </button>
        <button
          type="button"
          onClick={() => press('0')}
          className="rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-[1.6rem] font-bold text-ink transition-colors hover:border-brand hover:bg-brand-soft"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => setPin((current) => current.slice(0, -1))}
          disabled={pin.length === 0}
          aria-label={t('backspace')}
          className="grid place-items-center rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          <Delete size={24} aria-hidden />
        </button>
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton
        label={t('signIn')}
        pendingLabel={t('signingIn')}
        disabled={!complete}
        className="btn-lg w-full disabled:opacity-50"
      />

      <p className="text-center text-[0.9rem] text-ink-soft">
        <LogIn size={15} aria-hidden className="mr-1 inline align-[-2px]" />
        {t('pinHint', { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH })}
      </p>
    </form>
  );
}
