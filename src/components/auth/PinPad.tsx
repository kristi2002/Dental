'use client';

import { Delete } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PIN_MAX_LENGTH } from '@/lib/auth/pin-constants';
import { cn } from '@/lib/utils';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * The number pad, shared by the login screen and the idle lock.
 *
 * Split out when the lock screen arrived rather than copied: the two are the
 * same challenge, and a keypad that drifts between them is a keypad where one
 * copy quietly stops masking the digits.
 */
export function PinPad({
  pin,
  onChange,
}: {
  pin: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations('auth');

  const press = (digit: string) => {
    if (pin.length < PIN_MAX_LENGTH) onChange(pin + digit);
  };

  return (
    <div className="space-y-5">
      {/* Filled dots, not the digits — the screen faces a waiting room. */}
      <div>
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
            className="rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-figure font-bold text-ink transition-colors hover:border-brand hover:bg-brand-soft"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onChange('')}
          disabled={pin.length === 0}
          className="rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-body font-bold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          {t('clear')}
        </button>
        <button
          type="button"
          onClick={() => press('0')}
          className="rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-figure font-bold text-ink transition-colors hover:border-brand hover:bg-brand-soft"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => onChange(pin.slice(0, -1))}
          disabled={pin.length === 0}
          aria-label={t('backspace')}
          className="grid place-items-center rounded-[var(--radius-card)] border border-line-strong bg-surface py-4 text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          <Delete size={24} aria-hidden />
        </button>
      </div>
    </div>
  );
}
