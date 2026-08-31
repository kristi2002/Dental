import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * `lead` is the one panel on a screen that is the reason the screen exists, and
 * there may be exactly one — a second lead is a screen with no lead. `flat`
 * is for a panel already inside something, or one cell of a grid where the grid
 * is the shape and a shadow under every cell only makes stripes. See the note
 * on `.card-lead` in `globals.css`.
 */
export type CardWeight = 'lead' | 'default' | 'flat';

const WEIGHTS: Record<CardWeight, string> = {
  lead: 'card-lead',
  default: 'card',
  flat: 'card-flat',
};

export function Card({
  className,
  children,
  weight = 'default',
}: {
  className?: string;
  children: ReactNode;
  weight?: CardWeight;
}) {
  return <section className={cn(WEIGHTS[weight], className)}>{children}</section>;
}

export function CardHeader({
  title,
  icon,
  action,
  subtitle,
  className,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  subtitle?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon ? <span className="text-brand">{icon}</span> : null}
        <div>
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          {subtitle ? <p className="text-body text-ink-soft">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
