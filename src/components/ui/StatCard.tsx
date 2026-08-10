import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  Icon,
  href,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  Icon: LucideIcon;
  href?: string;
  tone?: 'neutral' | 'warn';
}) {
  const body = (
    <>
      {/* A tinted tile with no outline at all — the fill is the shape. */}
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
          tone === 'warn' ? 'bg-accent-soft text-warn' : 'bg-brand-soft text-brand-deep',
        )}
      >
        <Icon size={22} aria-hidden />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-[2rem] leading-none font-bold tabular-nums',
            tone === 'warn' ? 'text-warn' : 'text-brand-deep',
          )}
        >
          {value}
        </span>
        <span className="mt-1 block text-[0.95rem] font-semibold text-ink-soft">{label}</span>
      </span>
    </>
  );

  const className = cn(
    'card flex items-center gap-4 px-5 py-4 no-underline transition-shadow transition-colors',
    href && 'hover:border-brand hover:shadow-pop',
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
