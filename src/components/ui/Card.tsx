import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('card', className)}>{children}</section>;
}

export function CardHeader({
  title,
  icon,
  action,
  subtitle,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  subtitle?: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line px-5 py-4">
      <div className="flex items-center gap-3">
        {icon ? <span className="text-brand">{icon}</span> : null}
        <div>
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          {subtitle ? <p className="text-[0.95rem] text-ink-soft">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
