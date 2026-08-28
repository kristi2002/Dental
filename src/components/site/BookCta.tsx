'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * The masthead's bronze pill — the one control the whole storefront exists to
 * get pressed.
 *
 * It is a client component for exactly the reason `SiteNav` is one: it has to
 * know which page is on screen. Booking became a route when it stopped being a
 * drawer, and a bar that offers "book a visit" as an undifferentiated link while
 * the reader is *on* the booking page is doing two things wrong. It says nothing
 * to somebody using a screen reader, who is handed a link to where they already
 * are with no indication of it; and it wastes the one piece of feedback a
 * masthead can give, which is telling you where you stand.
 *
 * So on `/book` it carries `aria-current="page"` and goes quiet — a bronze
 * outline instead of a bronze fill. It is deliberately **still a link**, and not
 * hidden and not disabled. Hidden, the bar visibly loses an item on one route
 * out of six, which reads as a rendering fault; disabled, a reader who has
 * scrolled to the foot of the booking page loses the quickest way back to the
 * form at the top of it.
 *
 * `usePathname` from `@/i18n/navigation` returns the path with the locale
 * already stripped, which is what makes this a single comparison rather than
 * three.
 */
export function BookCta() {
  const t = useTranslations('site');
  const pathname = usePathname();
  const here = pathname === '/book';

  return (
    <Link
      href="/book"
      // Gone on the narrowest screens, and not reluctantly. The lockup, the
      // language menu and this came to more than a 390px viewport has to give,
      // which put the whole page into a sideways scroll — and the thing being
      // scrolled off was a duplicate: the hero's own "book a visit" is a thumb's
      // width below it on a phone. `BookFab` covers every screen further down.
      className="masthead-cta group hidden sm:inline-flex"
      // `undefined` rather than `false`: `aria-current="false"` is a real value
      // meaning "not this one", and the stylesheet keys off the attribute's
      // presence. The same rule the app's segmented controls follow.
      aria-current={here ? 'page' : undefined}
    >
      {t('nav.book')}
      <ArrowRight
        size={15}
        aria-hidden
        className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
    </Link>
  );
}
