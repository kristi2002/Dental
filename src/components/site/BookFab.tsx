'use client';

import { CalendarCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * The way to book from anywhere on the page, on the screens that had none.
 *
 * The masthead's own "book a visit" is `hidden … sm:inline-flex`, and that was
 * the right call for the reason `SiteHeader` gives: the lockup, the language
 * menu and a third control came to more than a 390px bar has to give, and the
 * page went into a sideways scroll. The justification offered for dropping it —
 * that the hero's own button is a thumb's width below — is true at the top of
 * the page and false everywhere else. A visitor on a phone who has read the
 * treatments and looked at the gallery is four screens from any way of getting
 * in touch, on a page whose entire purpose is getting them to.
 *
 * So: a button that appears once the hero has gone by and disappears again when
 * the form it points at is on screen. Both halves matter. Floating a permanent
 * button over the hero would cover the composition the hero was rebuilt to fit
 * exactly one screen; leaving it up over the form would sit it on top of the
 * form's own full-width submit button, which is worse than not having it.
 *
 * **Why an observer and not CSS.** The rest of this page's motion is
 * scroll-driven CSS with no JavaScript in it, and that rule is worth keeping
 * where the thing being animated is decoration. This is not decoration — it is
 * whether a control exists — and the CSS version needs `timeline-scope` to
 * reach an element in a different subtree, which lands the fallback in the worst
 * possible state: a browser that does not support it would show the button
 * permanently, over the hero and over the form. An `IntersectionObserver` is
 * supported everywhere this page runs and fails to *absent*, which is the safe
 * direction for a floating control.
 *
 * **It scrolls to the form rather than opening it in a drawer.** A modal was the
 * obvious ask and it is the wrong shape here. `#request` is a server-rendered
 * form with a real anchor: it works with no JavaScript, it is where a browser's
 * back button expects to return, and `RequestForm` swaps itself for a
 * confirmation in place and moves focus to it — behaviour a dialog would have to
 * re-implement along with focus trapping and scroll locking. The drawer would
 * buy a smoother transition and cost the form's independence from this
 * component.
 */

/** The two elements whose presence means this button is not needed. */
const HIDE_NEAR = ['hero', 'request'];

export function BookFab() {
  const t = useTranslations('site');
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const targets = HIDE_NEAR.map((id) => document.getElementById(id)).filter(
      (node) => node !== null,
    );
    // Nothing to watch means nothing sensible to decide, so stay away. This is
    // the case where somebody has moved the form to another page: the button
    // would otherwise sit there pointing at an anchor that is not in the
    // document.
    if (targets.length === 0) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setShown(visible.size === 0);
      },
      {
        // A tenth of the element is enough to count as present. The hero is a
        // whole screen tall, so anything stricter would keep the button hidden
        // most of the way down it; the form is roughly a screen too.
        threshold: 0.1,
      },
    );

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href="#request"
      // `hidden` rather than opacity: an invisible link is still a tab stop and
      // still announced, and a screen reader user being offered a button that is
      // not on screen is the accessibility version of the bug this component
      // exists to avoid. It also keeps the control out of the way entirely from
      // `sm` up, where the masthead's own button is present.
      hidden={!shown}
      className="fab fixed right-4 bottom-4 z-40 inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-5 text-[0.95rem] font-bold text-navy no-underline shadow-pop focus-visible:outline-gilt-deep sm:hidden"
    >
      <CalendarCheck size={19} aria-hidden />
      {t('nav.book')}
    </a>
  );
}
