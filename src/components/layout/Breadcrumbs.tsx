import { ChevronRight, House } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * Where you are, and every step back out.
 *
 * The app had one way back — a single "← Patients" link on the patient record —
 * and nothing at all on the screens two levels deep. So a stocktake, a printed
 * day sheet or a plan opened from the dashboard were all dead ends whose only
 * exit was the browser's back button or the rail, which drops you at the *top*
 * of a section rather than where you came from.
 *
 * The dashboard is prepended here rather than by every caller: it is the root of
 * every trail in the app, and a crumb list that has to remember to include its
 * own root is a crumb list that will not.
 */
export type Crumb = {
  /** Omitted on the last crumb — you are already there. */
  href?: string;
  label: string;
};

export async function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = await getTranslations('nav');
  const tc = await getTranslations('common');

  return (
    <nav aria-label={tc('breadcrumb')} className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[0.95rem]">
        <li className="flex items-center">
          <Link
            href="/"
            title={t('dashboard')}
            className="flex min-h-9 items-center gap-1.5 rounded-md px-2 font-semibold text-ink-soft no-underline transition-colors hover:bg-surface hover:text-brand-deep"
          >
            <House size={17} aria-hidden />
            <span className="sr-only sm:not-sr-only">{t('dashboard')}</span>
          </Link>
        </li>

        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center">
              <ChevronRight size={16} aria-hidden className="shrink-0 text-line-strong" />
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="flex min-h-9 max-w-[16rem] items-center truncate rounded-md px-2 font-semibold text-ink-soft no-underline transition-colors hover:bg-surface hover:text-brand-deep"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="flex min-h-9 max-w-[20rem] items-center truncate px-2 font-bold text-ink"
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
