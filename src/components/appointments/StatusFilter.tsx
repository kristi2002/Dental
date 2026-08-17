import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** The statuses the calendar can show, in the order a booking moves through them. */
export const CALENDAR_STATUSES = [
  'SCHEDULED',
  'ARRIVED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

/**
 * Read the `status` query key. An absent, empty or unrecognised value means
 * "everything" rather than "nothing" — a calendar that silently hides every
 * appointment because a link was mistyped is worse than one that ignores the
 * filter.
 */
export function parseStatusFilter(raw: string | undefined): CalendarStatus[] {
  const wanted = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is CalendarStatus =>
      CALENDAR_STATUSES.includes(value as CalendarStatus),
    );

  return wanted.length > 0 ? CALENDAR_STATUSES.filter((s) => wanted.includes(s)) : [...CALENDAR_STATUSES];
}

/**
 * The swatch beside each status, doubling as the key to the colours on the
 * grid. A bar rather than a dot, because a bar is exactly what the grid draws
 * down the left edge of every block.
 */
const STATUS_DOT: Record<CalendarStatus, string> = {
  SCHEDULED: 'bg-brand',
  ARRIVED: 'bg-accent-dark',
  COMPLETED: 'bg-ok',
  CANCELLED: 'bg-line-strong',
  NO_SHOW: 'bg-warn',
};

/**
 * Which statuses the grid draws — checkboxes in everything but markup, folded
 * into a dropdown in the toolbar.
 *
 * It used to be a card standing beside the month rail under the calendar, five
 * rows tall and permanently open. Five tickboxes are not five things anybody
 * reads: four of them are on almost all the time, and the panel spent a block
 * of the page saying so.
 *
 * `<details>` rather than a menu component, for the same reason the items are
 * links: the whole filter is the URL. It survives a reload, it can be sent to a
 * colleague, it needs no JavaScript — and because every item navigates, the
 * panel closes itself on the way out without anything having to listen for a
 * click landing outside it.
 *
 * The one thing a collapsed filter must never do is hide work silently, so the
 * trigger goes teal and carries a count the moment it is filtering anything.
 */
export function StatusFilter({
  active,
  hrefFor,
}: {
  active: readonly CalendarStatus[];
  /** Builds the URL for a given set of statuses — the page owns the query string. */
  hrefFor: (statuses: CalendarStatus[]) => string;
}) {
  const t = useTranslations('appointments');
  const all = active.length === CALENDAR_STATUSES.length;

  return (
    <details className="segmented relative" data-print-hide>
      <summary
        aria-label={`${t('status')}: ${active.map((status) => t(`status_${status}`)).join(', ')}`}
        className={cn(
          // `list-none` and the webkit rule between them see off the disclosure
          // triangle, which no browser draws in a place this button can use.
          'segment flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden',
          !all && 'bg-brand-soft text-brand-deep hover:bg-brand-soft hover:text-brand-deep',
        )}
      >
        {t('status')}
        {all ? null : (
          <span
            aria-hidden
            className="grid min-w-6 place-items-center rounded-full bg-brand-dark px-1.5 text-[0.8rem] tabular-nums text-white"
          >
            {active.length}
          </span>
        )}
        <ChevronDown size={16} aria-hidden className="opacity-70" />
      </summary>

      {/* Left-aligned and above everything the grid draws. Capped at the
          viewport so it cannot run off the right edge of a phone. */}
      <div className="absolute top-full left-0 z-30 mt-1.5 w-[min(17rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-surface p-2 shadow-pop">
        <ul>
          {CALENDAR_STATUSES.map((status) => {
            const on = active.includes(status);
            // Unticking the last one would leave an empty calendar with no way
            // back other than the browser's back button, so it turns the rest on.
            const next = on
              ? active.filter((value) => value !== status)
              : [...active, status];

            return (
              <li key={status}>
                <Link
                  href={hrefFor(next.length > 0 ? next : [...CALENDAR_STATUSES])}
                  aria-current={on ? 'true' : undefined}
                  className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 no-underline hover:bg-paper"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      on
                        ? 'border-brand-dark bg-brand-dark text-white'
                        : 'border-line-strong bg-surface',
                    )}
                  >
                    {on ? <Check size={17} strokeWidth={3.5} aria-hidden /> : null}
                  </span>
                  <span
                    aria-hidden
                    className={cn('h-4 w-1.5 shrink-0 rounded-full', STATUS_DOT[status])}
                  />
                  <span
                    className={cn(
                      'text-[0.95rem]',
                      on ? 'font-semibold text-ink' : 'text-ink-soft',
                    )}
                  >
                    {t(`status_${status}`)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {all ? null : (
          <Link
            href={hrefFor([...CALENDAR_STATUSES])}
            className="mt-1 flex min-h-11 items-center justify-center rounded-lg border-t border-line font-semibold text-brand-deep no-underline hover:bg-paper"
          >
            {t('allStatuses')}
          </Link>
        )}
      </div>
    </details>
  );
}
