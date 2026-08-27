import { ArrowRight, Phone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { LocaleMenu } from '@/components/site/LocaleMenu';
import { SiteMenu } from '@/components/site/SiteMenu';
import { SiteNav } from '@/components/site/SiteNav';
import { Link } from '@/i18n/navigation';
import type { SiteContact } from '@/lib/site';

/**
 * The masthead — and it is a masthead now rather than a navigation bar.
 *
 * The old header put the lockup at 44px in the corner, three language buttons
 * beside it and a button on the end, which is the arrangement every clinic site
 * on the internet has and the reason none of them look like anything. The
 * practice's identity is a drawn wordmark; giving it 44px is spending the money
 * on the artwork and then printing it as a favicon.
 *
 * So the whole thing is built around one idea: **at the top of the page the
 * mark is a masthead, and by the time you are reading it is a bar.** At rest
 * the lockup stands 3.4rem tall on the hero film with nothing behind it — no
 * bar, no fill, the name simply set on the picture the way it would be on a
 * cover. Two hundred and forty pixels of scrolling later it has settled to
 * 2.1rem and a navy bar has faded in underneath it.
 *
 * Both figures came down when the hero grew a nameplate of its own. There is one
 * cover on a page and it is the large lockup in the middle of the film; a bar
 * carrying the same artwork at nearly the same size was competing with it rather
 * than answering it. What is here now is a running head, which is what a bar is
 * for — and it is why the hero's lockup lost its frame while this one kept one:
 * a mark small enough to be furniture needs the box, and a mark that fills a
 * screen does not.
 *
 * **Two tiers at rest, one when condensed.** From `lg` up the bar carries a
 * utility row — the telephone number, which is the highest-intent thing a
 * clinic's chrome can hold — above the section links, separated by a bronze
 * hairline that starts *after* the lockup rather than running under it. The
 * lockup sits in a gilt frame tall enough to cross that hairline, so it reads as
 * a plaque set into the bar rather than a logo parked beside it. As the page is
 * scrolled the utility row collapses to nothing, the frame fades, and what is
 * left is the compact single-row bar the header has always condensed to. Both
 * states are the same DOM; nothing is duplicated and nothing is toggled in
 * JavaScript.
 *
 * **The booking control is a pill, not a block.** It was a square slab of gilt
 * running full-height into the corner of the screen for one draft, on the
 * reasoning that a control outside the page's own margins reads as furniture
 * rather than as another button. In use it read as neither: 194 by 135 pixels
 * of flat bronze is the largest single mass of colour on a page whose whole
 * palette is rationed to one accent, and it took the corner of every screen
 * away from the practice's own film to give it to a word. The rule this page
 * has always followed is that gilt is spent, not spread.
 *
 * So it is the same button the hero uses — a gilt pill with an arrow that moves
 * on hover — sitting at the end of the bar beside the language menu. Being the
 * same control in both places is worth more than being a different one here:
 * a reader who has seen it once in the hero recognises it in the bar without
 * reading it again.
 *
 * Nothing here listens to a scroll event and there is no client component in
 * this file except the language menu. The condense is one CSS animation whose
 * timeline is the document's own scroll offset — see `.masthead` in
 * `globals.css`, and note that the *compact* state is the base state, so a
 * browser without scroll-driven animations gets an ordinary sticky bar rather
 * than a permanent two-tier letterhead across the top of the page.
 *
 * The section links are set in letterspaced small capitals rather than in
 * sentence case. It is the oldest signal in print for "this is the furniture,
 * the content is elsewhere", and it is what stops four navigation words
 * competing with the headline three centimetres below them.
 */
export async function SiteHeader({ contact }: { contact: SiteContact }) {
  const t = await getTranslations('site');

  return (
    <>
      {/* The first thing a keyboard reaches, and invisible until it does. The
          app's chrome has one of these; the front door had better too. */}
      <a
        href="#main"
        className="sr-only rounded-lg bg-bone px-4 py-2 font-semibold text-navy focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="masthead fixed inset-x-0 top-0 z-40">
        {/* The bar's ground, as a separate layer rather than a background on the
            header itself. It has to be able to fade independently of the type
            sitting on it — the lockup and the links are fully opaque from the
            first pixel, and only the navy behind them arrives on scroll. */}
        <div
          aria-hidden
          className="masthead-veil absolute inset-0 border-b border-navy-line/60 bg-navy/92 backdrop-blur-md"
        />

        <div className="relative flex items-stretch">
          {/*
           * Full-bleed rather than a centred `max-w-6xl`, and the left padding
           * does the aligning instead: `(100vw - 72rem) / 2 + 2rem` is exactly
           * where the page's own measure begins, so the lockup lines up with the
           * headline under it at every width while the row itself still runs to
           * both edges. The same `max()` idiom the gallery and the practice
           * section already use to hang a full-bleed element off the measure.
           *
           * The right gutter mirrors the left, so the booking pill finishes
           * exactly where the page's measure does and the bar reads as a band
           * across the top rather than as a row that ran out of screen.
           */}
          <div className="masthead-bar flex min-w-0 flex-1 items-stretch gap-4 px-5 sm:px-8 lg:pr-[max(2rem,calc((100vw-72rem)/2+2rem))] lg:pl-[max(2rem,calc((100vw-72rem)/2+2rem))]">
            {/* The artwork spells the practice's name, so nothing is written
                beside it — same reasoning as the sign-in screen. */}
            <Link
              href="/"
              aria-label={contact.name}
              className="masthead-plaque shrink-0 self-center"
            >
              <ClinicLogo
                variant="inverse"
                alt=""
                // `masthead-logo` sets the height from the scroll-driven custom
                // property. A Tailwind height class here would win the cascade
                // and freeze it.
                className="masthead-logo"
              />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              {/*
               * The utility row. It collapses to nothing as the bar condenses —
               * `height` and `opacity` both come from the same animation — which
               * is why the language menu is *not* in here: a control a reader
               * cannot reach any other way must not be able to scroll away.
               *
               * Only from `sm`. On a 390px screen the telephone number would be
               * competing with the lockup for a width that has none to give, and
               * the hero's own call button is a thumb's width below it.
               */}
              <div className="masthead-util hidden items-center justify-end gap-6 sm:flex">
                {contact.telHref ? (
                  <a
                    href={contact.telHref}
                    className="inline-flex items-center gap-2 text-[0.82rem] font-semibold whitespace-nowrap text-navy-ink no-underline transition-colors hover:text-white focus-visible:outline-white"
                  >
                    <Phone size={13} aria-hidden className="text-gilt" />
                    <span className="sr-only">{t('visit.callLabel')}</span>
                    {contact.phone}
                  </a>
                ) : null}
              </div>

              {/* The hairline between the tiers. It begins where the plaque ends
                  — it is inside this column, not across the bar — which is what
                  makes the lockup read as set *into* the rule rather than
                  sitting on top of one that runs behind it. */}
              <div aria-hidden className="masthead-rule hidden lg:block" />

              {/* Four routes rather than four fragments, and the current one is
                  lit — which is why this one row is a client component. See
                  `SiteNav`; everything else in this bar is server-rendered. */}
              <nav aria-label={t('nav.sections')} className="masthead-nav hidden lg:block">
                <SiteNav />
              </nav>
            </div>

            {/* Both outside the collapsing column on purpose. The language menu
                is the one control a reader cannot get to any other way and the
                booking pill is the page's whole point, so neither may scroll
                away with the utility row above them. */}
            <div className="flex shrink-0 items-center gap-2.5 lg:pl-6">
              <LocaleMenu />

              {/* Gone on the narrowest screens, and not reluctantly. The lockup,
                  the language menu and this came to more than a 390px viewport
                  has to give, which put the whole page into a sideways scroll —
                  and the thing being scrolled off was a duplicate: the hero's
                  own "book a visit" is a thumb's width below it on a phone.

                  `/visit#request` rather than the bare fragment it carried while
                  the form was on the only page there was: written this way it
                  works from every route with no JavaScript, and `BookDrawer`
                  still catches it and opens the panel in place. */}
              <Link href="/visit#request" className="masthead-cta group hidden sm:inline-flex">
                {t('nav.book')}
                <ArrowRight
                  size={15}
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </Link>

              {/* The four section links are `hidden lg:block`, so below that
                  width this is the only way to the rest of the site. */}
              <SiteMenu contact={contact} />
            </div>
          </div>
        </div>

        {/* How much of the page has been read, as a bronze hairline along the
            bottom of the bar. Outside the veil, so it is at full strength from
            the first pixel rather than fading in with the ground behind it —
            and it is the one indicator on this page whose *absent* state is the
            fallback rather than its finished one. See `.masthead-progress`. */}
        <div aria-hidden className="masthead-progress" />
      </header>
    </>
  );
}
