import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/* Three ways for a number to matter: it is just the count, it is a number
 * somebody should act on this week, or it is one that must be dealt with before
 * a box reaches a patient. */
/* `warn-soft`, not `accent-soft`. The palette note in `globals.css` reserves
 * peach for "add something new" and nothing else, and a low-stock count tinted
 * peach was quietly spending the one accent this design system rations — while
 * pairing a peach tile with amber-brown digits beside it, which is two warm
 * hues doing one job. */
const TONES = {
  neutral: { chip: 'bg-brand-soft text-brand-deep', value: 'text-brand-deep' },
  warn: { chip: 'bg-warn-soft text-warn', value: 'text-warn' },
  danger: { chip: 'bg-danger-soft text-danger', value: 'text-danger' },
} as const;

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
  tone?: keyof typeof TONES;
}) {
  const palette = TONES[tone];

  const body = (
    <>
      {/* A tinted tile with no outline at all — the fill is the shape. A size
          smaller below `sm`, where these now sit two to a row: the number is
          what the card is for, and the tile beside it should not be taking a
          third of a 180px card away from it. */}
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12',
          palette.chip,
        )}
      >
        <Icon size={22} aria-hidden />
      </span>
      <span className="min-w-0">
        <span
          className={cn('block text-[2rem] leading-none font-bold tabular-nums', palette.value)}
        >
          {value}
        </span>
        <span className="mt-1 block text-body font-semibold text-ink-soft">{label}</span>
      </span>
    </>
  );

  // `card-flat`: four of these sit in a row, and a shadow under each cell turns
  // the row into stripes rather than lifting anything. A stat card that is a
  // link earns its shadow on hover, where the lift means "this opens".
  const className = cn(
    'card-flat flex items-center gap-3 px-4 py-3.5 no-underline transition-shadow transition-colors',
    'sm:gap-4 sm:px-5 sm:py-4',
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
