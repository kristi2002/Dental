'use client';

import { useTranslations } from 'next-intl';

/**
 * What fills the page area while the next screen is being fetched.
 *
 * Every page in this group is server-rendered against Postgres with no
 * streaming boundary of its own, so until this file existed, tapping *Patients*
 * on the clinic's mini-PC did nothing at all — no spinner, no dimming, no
 * change of any kind — until the whole page was ready. On a machine that takes
 * a second or two over a join, that is indistinguishable from a dead button,
 * and the honest response to a dead button is to press it again.
 *
 * One file covers the whole `(app)` group, because the fallback only ever
 * replaces the page area: the masthead and the rail are in the layout above it
 * and stay put, which is what makes this read as *this screen is coming* rather
 * than *the app has gone*.
 *
 * A skeleton rather than a spinner. The shape of every screen in here is the
 * same — a title, then cards — so blocking that shape out tells somebody where
 * the thing they are waiting for will appear, and a spinner tells them only
 * that they are waiting. It is deliberately colourless and borrows the card
 * border, so it reads as furniture rather than as content that failed to load.
 *
 * `aria-busy` with a live label, because none of the above reaches a screen
 * reader: without it the announcement on navigation is an empty document.
 * `motion-safe:` gates the pulse, so a person who has asked their machine to
 * stop animating things gets a still frame.
 */
export default function AppLoading() {
  const t = useTranslations('common');

  return (
    <div aria-busy="true" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">{t('loading')}</span>

      {/* The page header: a title, and the breadcrumb line under it. */}
      <div className="mb-6">
        <div className="h-4 w-40 rounded bg-line" />
        <div className="mt-3 h-8 w-64 rounded bg-line-strong" />
      </div>

      {/* Two cards, which is the shape of almost every screen here. The rows
          inside are what stops it reading as one large empty box. */}
      {[0, 1].map((card) => (
        <div key={card} className="card mb-4 p-5">
          <div className="h-5 w-48 rounded bg-line-strong" />
          <div className="mt-5 space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-line" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-1/3 rounded bg-line" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-line" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
