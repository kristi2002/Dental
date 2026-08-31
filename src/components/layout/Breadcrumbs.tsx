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
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-body">
        <li className="flex items-center">
          <Link
            href="/dashboard"
            title={t('dashboard')}
            className="flex min-h-9 items-center gap-1.5 rounded-md px-2 font-semibold text-ink-soft no-underline transition-colors hover:bg-surface hover:text-brand-deep"
          >
            <House size={17} aria-hidden />
            <span className="sr-only sm:not-sr-only">{t('dashboard')}</span>
          </Link>
        </li>

        {/* The cap and the ellipsis go on an inner span, not on the crumb itself:
            `text-overflow` only applies to block containers, so a `truncate` on
            the flex box that centres the label is a plain clip — a long plan
            title lost its last word and its right padding with it, and ran
            straight into the next chevron. */}
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center">
              <ChevronRight size={16} aria-hidden className="shrink-0 text-line-strong" />
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="flex min-h-9 items-center rounded-md px-2 font-semibold text-ink-soft no-underline transition-colors hover:bg-surface hover:text-brand-deep"
                >
                  <span className="max-w-[16rem] truncate">{crumb.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className="flex min-h-9 items-center px-2 font-bold text-ink"
                >
                  <span className="max-w-[20rem] truncate">{crumb.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
