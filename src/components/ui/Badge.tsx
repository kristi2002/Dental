import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger';

/* The border is a tinted whisper of the text colour, not the text colour itself —
 * that alone takes most of the shout out of a row of badges. */
const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-paper text-ink-soft',
  brand: 'border-brand/30 bg-brand-soft text-brand-deep',
  ok: 'border-ok/25 bg-ok-soft text-ok',
  warn: 'border-warn/25 bg-warn-soft text-warn',
  danger: 'border-danger/25 bg-danger-soft text-danger',
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
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.85rem] font-bold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
