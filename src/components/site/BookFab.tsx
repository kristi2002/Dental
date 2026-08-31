'use client';

import { CalendarCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * The way to book from anywhere on the site, on the screens that had none.
 *
 * The masthead's own "book a visit" is `hidden … sm:inline-flex`, and that was
 * the right call for the reason `SiteHeader` gives: the lockup, the language
 * menu and a third control came to more than a 390px bar has to give, and the
 * page went into a sideways scroll. The justification offered for dropping it —
 * that the hero's own button is a thumb's width below — is true at the top of
 * the page and false everywhere else. A visitor on a phone who has read the
 * treatments and looked at the gallery is four screens from any way of getting
 * in touch, on a site whose entire purpose is getting them to.
 *
 * So: a button that appears once the hero has gone by. Both halves matter.
 * Floating a permanent button over the hero would cover the composition the hero
 * was rebuilt to fit exactly one screen.
 *
 * **Why an observer and not CSS.** The rest of this page's motion is
 * scroll-driven CSS with no JavaScript in it, and that rule is worth keeping
 * where the thing being animated is decoration. This is not decoration — it is
 * whether a control exists — and the CSS version needs `timeline-scope` to reach
 * an element in a different subtree, which lands the fallback in the worst
 * possible state: a browser that does not support it would show the button
 * permanently, over the hero. An `IntersectionObserver` is supported everywhere
 * this page runs and fails to *absent*, which is the safe direction for a
 * floating control.
 *
 * **It is a link to the booking page**, and it used to be a link to a fragment
 * that a drawer intercepted. Booking is a route now — `/book`, with the
 * practice's own calendar on it — so this is an ordinary navigation with an address, a
 * back button and a place in history, and there is nothing left for a delegated
 * click listener to do.
 *
 * **It hides itself on the page it points at.** A floating "book a visit" over
 * the booking form is the same bug as one over the hero, in a louder key: it
 * would sit on top of the form's own submit button and offer the reader the
 * thing they are already doing. `usePathname` from `@/i18n/navigation` returns
 * the path *without* the locale in front of it, which is what makes a single
 * comparison work on all three languages.
 */
export function BookFab() {
  const t = useTranslations('site');
  const pathname = usePathname();
  const [shown, setShown] = useState(false);

  const onBookingPage = pathname === '/book';

  useEffect(() => {
    // Nothing to watch on the booking page itself, and nothing worth deciding:
    // the button is not offered there at all.
    if (onBookingPage) return;

    const hero = document.getElementById('hero');
    // Nothing to watch means nothing sensible to decide, so stay away. This is
    // the case where a page has been built without an opening band — the button
    // would otherwise appear immediately, over whatever is at the top of it.
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting),
      {
        // A tenth of the element is enough to count as present. The hero is a
        // whole screen tall, so anything stricter would keep the button hidden
        // most of the way down it.
        threshold: 0.1,
      },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, [onBookingPage]);

  return (
    <Link
      href="/book"
      // `hidden` rather than opacity: an invisible link is still a tab stop and
      // still announced, and a screen reader user being offered a button that is
      // not on screen is the accessibility version of the bug this component
      // exists to avoid. It also keeps the control out of the way entirely from
      // `sm` up, where the masthead's own button is present.
      hidden={onBookingPage || !shown}
      className="fab fixed right-4 bottom-4 z-40 inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-5 text-body font-bold text-navy no-underline shadow-pop focus-visible:outline-gilt-deep sm:hidden"
    >
      <CalendarCheck size={19} aria-hidden />
      {t('nav.book')}
    </Link>
  );
}
