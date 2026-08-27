'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { openStateAt, type LiveHours, type OpenState } from '@/lib/site-open';

/**
 * The one sentence on this page that has to be true at the minute it is read.
 *
 * Somebody arriving at twenty past six wants to know whether to ring now or
 * tomorrow, and that is the most useful line the storefront has. It is also the
 * only thing on the page that stops being true while nothing about the practice
 * changes, which is why the page was `force-dynamic` and why it no longer needs
 * to be: the server renders the answer that was true when it rendered, and this
 * component works it out again on the visitor's own machine.
 *
 * **The server's answer is in the HTML, not a placeholder.** `initial` is
 * rendered on the first pass, which is what the markup already contains, so
 * hydration matches and there is no flash of an empty rail. A reader whose
 * JavaScript never arrives keeps that answer — at most a few minutes stale,
 * which is the right trade for a sentence that is otherwise absent entirely.
 * The three states matter here: the middle one, shut *now* but opening again
 * later today, is what a practice with a lunch break looks like for two hours
 * every afternoon, and a flat "closed" would send that visitor to a competitor
 * over a break that ends at two.
 *
 * **It keeps ticking.** A minute's interval, plus a recheck when the tab is
 * brought back to the front — a phone put in a pocket at ten to seven and looked
 * at again at half past should not still be promising an open door. A minute is
 * the resolution the sentence is written to; anything finer would be spending
 * wake-ups to change nothing.
 *
 * All of the arithmetic is in `lib/site-open.ts`, which the server calls too.
 * Nothing about opening hours is implemented twice.
 */
export function OpenStatus({ live, initial }: { live: LiveHours; initial: OpenState }) {
  const t = useTranslations('site');
  const [state, setState] = useState(initial);

  useEffect(() => {
    const sync = () => {
      const fresh = openStateAt(live, new Date());
      // Null means the cached page has outlived what its closure window can
      // answer for. Keeping the server's answer is deliberate: the alternative
      // is a browser that cannot see a public holiday cheerfully writing "open
      // now" over the top of one.
      if (fresh) setState(fresh);
    };

    sync();

    const timer = setInterval(sync, 60_000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [live]);

  const line =
    state.tone === 'open'
      ? t('hours.openUntil', { time: state.closesAt ?? '' })
      : state.tone === 'later'
        ? t('hours.opensAt', { time: state.opensAt ?? '' })
        : t('hours.closedNow');

  return (
    <>
      {/*
       * `data-tone` rather than three sets of utility classes, because the
       * stylesheet needs to know this too now: the badge around the line is
       * tinted by whether the door is open, and a tone expressed only as a
       * ternary in JSX is a tone CSS cannot read. The dot keeps its classes —
       * it is the one thing here whose three states differ by a single colour.
       *
       * See `.status-line` in globals.css.
       */}
      <p className="status-line" data-tone={state.tone}>
        <span
          aria-hidden
          className={
            state.tone === 'open'
              ? // The one pulsing thing on the page, and it earns it: a dot that
                // breathes reads as live, which is exactly the claim being made.
                'relative size-2.5 rounded-full bg-clay before:absolute before:inset-0 before:animate-ping before:rounded-full before:bg-clay motion-reduce:before:animate-none'
              : state.tone === 'later'
                ? 'size-2.5 rounded-full bg-gilt'
                : 'size-2.5 rounded-full bg-bone-ink-faint'
          }
        />
        {line}
      </p>

      <p className="status-hours">
        {state.todayHours ? t('hours.todayIs', { hours: state.todayHours }) : t('hours.shutToday')}
      </p>

      {/* A closure the practice entered — a public holiday, the August week —
          says so by name rather than leaving "closed" unexplained. */}
      {state.closureReason ? (
        <p className="status-closure">{state.closureReason}</p>
      ) : null}
    </>
  );
}
