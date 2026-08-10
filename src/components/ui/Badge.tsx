import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-paper text-ink-soft',
  brand: 'border-brand bg-brand-soft text-brand-dark',
  ok: 'border-ok bg-ok-soft text-ok',
  warn: 'border-warn bg-warn-soft text-warn',
  danger: 'border-danger bg-danger-soft text-danger',
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
        'inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-[0.85rem] font-bold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
