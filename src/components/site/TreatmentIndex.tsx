'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { TREATMENT_KEYS, type TreatmentKey } from '@/lib/site-content';
import { cn } from '@/lib/utils';

/**
 * Eight treatments is one screen of pills and six screens of reading, and this
 * is the bar that keeps the two in touch.
 *
 * The treatments page is long by design — each entry is a photograph, a
 * paragraph, what it involves and how long it keeps you here — and a long page
 * has one characteristic failure: a reader four entries in has no idea how many
 * are left, and a reader who came for one specific thing has to scroll past
 * seven others to find it. A sticky index answers both, which is why nearly
 * every documentation site has one.
 *
 * **It follows the reading rather than the scroll position.** The observer's
 * root margin puts its band across the upper third of the viewport, so the entry
 * that is lit is the one being *read*, not the one nearest the top of the window
 * — which on a page of tall sections are two different things for most of the
 * time either is on screen.
 *
 * **The active pill is scrolled into view horizontally.** Eight names do not fit
 * across a phone, so the row scrolls sideways; without this the highlight
 * spends most of the page off the left-hand edge, which is worse than no
 * highlight at all because it looks broken rather than absent. `block: 'nearest'`
 * is what stops that horizontal nudge dragging the *page* around underneath the
 * reader, which is exactly what `scrollIntoView` does by default.
 *
 * **Plain fragment links.** Each entry has an id and this is eight `<a href="#…">`
 * — so it works with no JavaScript, it is in the HTML, and the browser's own
 * `scroll-behavior` and `scroll-margin` do the moving. The client code here does
 * nothing but decide which one is lit; nothing about navigating the page depends
 * on it.
 *
 * `top` is the compact masthead's height. The bar condenses on scroll, and by
 * the time this is stuck to anything it is condensed — see the `masthead-condense`
 * keyframes for the two figures.
 */
export function TreatmentIndex() {
  const t = useTranslations('site');
  const [current, setCurrent] = useState<TreatmentKey | null>(null);
  const row = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const sections = TREATMENT_KEYS.map((key) => document.getElementById(`t-${key}`)).filter(
      (node) => node !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setCurrent(entry.target.id.replace(/^t-/, '') as TreatmentKey);
          }
        }
      },
      {
        // A band across the upper third: an entry counts as "being read" from
        // the moment its top passes under the index bar until its top leaves the
        // top of the screen. Sections are taller than the viewport, so a
        // threshold-based rule would never fire for most of them.
        rootMargin: '-22% 0px -66% 0px',
        threshold: 0,
      },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Kept out of the observer's callback so it also runs on the first paint,
  // where a reader arriving on `/treatments#implants` has the right pill lit but
  // three screens to the left of where they can see it.
  useEffect(() => {
    if (!current) return;
    row.current
      ?.querySelector(`[data-key="${current}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [current]);

  return (
    <nav
      aria-label={t('pages.treatments.indexLabel')}
      className="sticky top-[3.4rem] z-30 border-y border-bone-deep bg-bone/88 backdrop-blur-md sm:top-[3.6rem]"
    >
      <ul
        ref={row}
        className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] sm:px-6"
      >
        {TREATMENT_KEYS.map((key) => {
          const active = key === current;

          return (
            <li key={key}>
              <a
                href={`#t-${key}`}
                data-key={key}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-caption font-semibold whitespace-nowrap no-underline transition-colors',
                  active
                    ? 'bg-gilt text-navy'
                    : 'text-bone-ink-soft hover:bg-gilt-soft hover:text-bone-ink',
                )}
              >
                {t(`topics.${key}`)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
