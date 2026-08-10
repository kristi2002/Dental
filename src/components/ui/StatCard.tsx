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
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2',
          tone === 'warn' ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-paper text-brand',
        )}
      >
        <Icon size={22} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[2rem] leading-none font-bold tabular-nums text-ink">
          {value}
        </span>
        <span className="mt-1 block text-[0.95rem] font-semibold text-ink-soft">{label}</span>
      </span>
    </>
  );

  const className = cn(
    'card flex items-center gap-4 px-5 py-4 no-underline transition-colors',
    href && 'hover:border-brand',
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
