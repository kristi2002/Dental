'use client';

import { useTranslations } from 'next-intl';
import { SITE_PAGES } from '@/components/site/site-pages';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The four words in the masthead, and the one that is lit.
 *
 * They used to be fragments — `#treatments`, `#practice` — because the
 * storefront was a single document and the nav scrolled it. Each is a route now,
 * and that changes what the bar has to do: an anchor list only ever says "here
 * is what is further down", where a route list also has to say **which page you
 * are on**. A navigation with four identical links on a four-page site is a
 * navigation that has stopped answering the first question anybody asks of one.
 *
 * So the current page keeps the gilt rule that the others only show on hover,
 * and carries `aria-current="page"`. Both halves are needed and neither is
 * enough: the rule is invisible to a screen reader, and `aria-current` is
 * invisible to everybody else.
 *
 * **It is a client component for exactly one reason — `usePathname`.**
 * Everything else about the bar, including the whole two-tier condense, is
 * server-rendered markup and CSS. The list itself is four `<a>` elements in the
 * HTML, so a reader whose JavaScript never arrives gets working navigation with
 * the highlight missing, which is the right way round for that to fail.
 *
 * The destinations themselves are in `site-pages.ts` rather than here, so that
 * the footer — a server component — can read the same array. See the note in
 * that file: a constant exported from a `'use client'` module reaches the server
 * as a reference rather than as a value.
 */

/**
 * Whether `pathname` is inside `href` — the locale prefix already stripped by
 * `usePathname`, which is the whole reason this can be a string comparison.
 *
 * `startsWith` rather than equality so a future `/treatments/implants` still
 * lights its section, and the boundary check is what stops `/visitors` matching
 * `/visit`.
 */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const t = useTranslations('site');
  const pathname = usePathname();

  return (
    // `justify-between`, so the four links spread the whole width between the
    // plaque and the booking block rather than bunching against one end. A
    // navigation that fills its row is furniture; four words huddled in a corner
    // are a widget.
    <ul className="flex items-center justify-between">
      {SITE_PAGES.map((page) => {
        const current = isCurrent(pathname, page.href);

        return (
          <li key={page.href}>
            <Link
              href={page.href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'relative inline-flex min-h-11 items-center px-1 text-[0.76rem] font-semibold tracking-[0.16em] uppercase no-underline transition-colors after:absolute after:inset-x-1 after:bottom-2.5 after:h-px after:origin-left after:bg-gilt after:transition-transform hover:text-white focus-visible:outline-white motion-reduce:after:transition-none',
                current
                  ? 'text-white after:scale-x-100'
                  : 'text-navy-ink after:scale-x-0 hover:after:scale-x-100',
              )}
            >
              {t(`nav.${page.key}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
