import { Check } from 'lucide-react';
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

/** The dot beside each status, doubling as the key to the colours on the grid. */
const STATUS_DOT: Record<CalendarStatus, string> = {
  SCHEDULED: 'bg-brand',
  ARRIVED: 'bg-accent',
  COMPLETED: 'bg-ok',
  CANCELLED: 'bg-line-strong',
  NO_SHOW: 'bg-warn',
};

/**
 * Which statuses the grid draws — checkboxes in everything but markup.
 *
 * They are links, not inputs, so the filter is part of the URL like every other
 * one in the app: it survives a reload, it can be sent to a colleague, and it
 * needs no JavaScript to work.
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
    <section aria-label={t('status')} className="card p-4" data-print-hide>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[1.05rem] font-bold text-ink">{t('status')}</h2>
        {all ? null : (
          <Link
            href={hrefFor([...CALENDAR_STATUSES])}
            className="text-[0.88rem] font-semibold text-brand-deep"
          >
            {t('allStatuses')}
          </Link>
        )}
      </div>

      <ul className="space-y-0.5">
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
                className="flex min-h-10 items-center gap-2.5 rounded-lg px-1 py-1 no-underline hover:bg-paper"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                    on
                      ? 'border-brand-dark bg-brand-dark text-white'
                      : 'border-line-strong bg-surface',
                  )}
                >
                  {on ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
                </span>
                <span
                  aria-hidden
                  className={cn('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_DOT[status])}
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
    </section>
  );
}
