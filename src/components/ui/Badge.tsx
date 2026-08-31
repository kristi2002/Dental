import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'alert';

/* The border is a tinted whisper of the text colour, not the text colour itself —
 * that alone takes most of the shout out of a row of badges.
 *
 * `alert` is the exception, and deliberately the only one: solid red on white,
 * reserved for the handful of facts — an allergy, above all — that must be seen
 * before anyone touches the patient. It only works because nothing else shouts. */
const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-paper text-ink-soft',
  brand: 'border-brand/30 bg-brand-soft text-brand-deep',
  ok: 'border-ok/25 bg-ok-soft text-ok',
  warn: 'border-warn/25 bg-warn-soft text-warn',
  danger: 'border-danger/25 bg-danger-soft text-danger',
  alert: 'border-danger bg-danger text-white',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-meta font-bold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
