import { getTranslations } from 'next-intl/server';
import type { SitePhoto } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';
import { TREATMENT_STEPS, type TreatmentKey } from '@/lib/site-content';

/**
 * A treatment's three steps, joined into one thing.
 *
 * **The complaint this answers is that they were three boxes.** Three cream
 * rectangles in a row, each with an ordinal in the corner, on every one of the
 * eleven treatment pages — which is a grid, and a grid says the three things in
 * it are alternatives. These are not alternatives. They are one appointment in
 * the order it happens, and the page never drew the line that says so.
 *
 * So there is a line, and it is the practice's own. `Swash` traces the sweep out
 * of the lockup as the rule between sections; this is the same hand and the same
 * hairline bent into a garland — it dips down to touch each step and lifts
 * between them, and it runs off both edges of the row, because the first step is
 * not the beginning of the patient's day and the third is not the end of their
 * treatment. The numbers sit *on* the line where it touches down, half over the
 * card they belong to, which is what makes them nodes on a chain rather than
 * labels in three corners.
 *
 * It draws itself with `.swash-draw`, reused verbatim rather than copied — same
 * dasharray, same scroll range, same keyframes as the swash — so the two lines
 * on this site cannot drift into two different speeds. `pathLength={1400}` is
 * what lets one dash length be correct at every viewport width; the note on
 * `Swash` has the whole argument.
 *
 * **The cards carry photographs now**, washed back under warm paper rather than
 * darkened under white type. Every other card on this site is a picture with a
 * gradient over it, which is right when the picture is the subject and wrong
 * here, where the subject is a paragraph about what happens to you. The
 * photograph gives the card a ground and a temperature and gets out of the way;
 * it lifts on hover, which is the whole of the interaction. See `.veil-photo`.
 *
 * ---
 *
 * **Two geometries, one component**, because below `lg` there is no row to
 * garland. The wide layout is the strip of curve above three columns; the narrow
 * one is a rail down the left with the nodes on it, which is the same statement
 * — these are consecutive — made in the only direction a phone has. Both are
 * always rendered and the breakpoint chooses; neither is a media query in
 * JavaScript, and there is no layout shift between them.
 *
 * The node positions in the curve are the column centres of a three-column grid,
 * which sit at a sixth, a half and five sixths of the width. The gap offsets the
 * two outer ones by a few pixels and the discs are 56 across, so the line lands
 * inside every one of them at every width this row is drawn at.
 */

/**
 * The garland, in a 1200×88 box stretched to whatever width the row is.
 *
 * It touches down at y=88 — the bottom edge of the strip, which is the top edge
 * of the cards — at the three node positions, and arcs up to y=22 between them
 * and at both ends. `preserveAspectRatio="none"` stretches it; the stroke is
 * held at a true hairline by `non-scaling-stroke`, exactly as the swash is.
 */
const GARLAND =
  'M0 22C90 22 110 88 200 88C300 88 300 22 400 22C500 22 500 88 600 88C700 88 700 22 800 22C900 22 900 88 1000 88C1090 88 1110 22 1200 22';

export async function StepChain({
  treatmentKey,
  photos,
}: {
  treatmentKey: TreatmentKey;
  /** One ground per step, in step order — `TREATMENT_GALLERY[key].steps`. */
  photos: readonly [SitePhoto, SitePhoto, SitePhoto];
}) {
  const t = await getTranslations('site');

  return (
    <div className="isolate mt-14">
      {/*
       * The curve and its three nodes, at `lg` only.
       *
       * `overflow-visible` on the `<svg>` rather than the default clip: the
       * stroke is drawn at the very bottom edge of the box, and half of its
       * width would otherwise be shaved off along the whole touch-down.
       *
       * **`z-10`, against an `isolate` on the wrapper.** The discs hang half
       * their height below this strip and over the cards, and the cards come
       * after it in the document — so without a stacking order the top half of
       * every number is a disc and the bottom half is a card edge drawn across
       * it. The isolation is what keeps that `z-10` a private arrangement
       * between these two elements rather than a number competing with the
       * masthead's.
       */}
      <div aria-hidden className="relative z-10 hidden h-22 lg:block">
        <svg
          viewBox="0 0 1200 88"
          preserveAspectRatio="none"
          focusable="false"
          className="absolute inset-0 h-full w-full overflow-visible text-gilt"
        >
          <path
            d={GARLAND}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1400}
            className="swash-draw"
          />
        </svg>

        {/* The same three columns and the same gap as the cards below, so each
            disc is centred over the card it belongs to rather than over an
            approximation of it. */}
        <div className="absolute inset-0 grid grid-cols-3 gap-5">
          {TREATMENT_STEPS.map((step, index) => (
            <div key={step} className="relative flex justify-center">
              <span className="absolute bottom-0 flex h-14 w-14 translate-y-1/2 items-center justify-center rounded-full border border-gilt/55 bg-bone font-display text-lead text-gilt-deep shadow-lift">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ol className="relative grid gap-9 pl-14 sm:pl-16 lg:grid-cols-3 lg:gap-5 lg:pl-0">
        {/*
         * The rail, below `lg`. It starts at the first node and stops at the
         * last rather than running the height of the list: a line continuing
         * past the final step into empty space is a list that looks unfinished.
         */}
        <div
          aria-hidden
          className="absolute top-9 bottom-9 left-6 w-px bg-gilt/55 sm:left-7 lg:hidden"
        />

        {TREATMENT_STEPS.map((step, index) => (
          <Reveal as="li" key={step} step={index} className="relative">
            {/*
             * The node on the rail, at narrow widths only — the wide layout has
             * it above the card, on the curve.
             *
             * **This is why the `<li>` is not the clipped element.** The disc
             * hangs outside the card, in the gutter the list's padding opens for
             * the rail, and the card has to clip its own photograph to its
             * rounded corner — one box cannot do both, and the first draft that
             * tried put `overflow-clip` on the `<li>` and cut every number off
             * the page at every width below `lg`.
             */}
            <span
              aria-hidden
              className="absolute top-7 -left-8 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-gilt/55 bg-bone font-display text-body text-gilt-deep shadow-lift sm:-left-9 sm:h-12 sm:w-12 lg:hidden"
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            <div className="veil-card group relative h-full overflow-clip rounded-2xl border border-bone-deep bg-bone shadow-lift">
              {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
              <img
                src={photos[index].src}
                width={photos[index].width}
                height={photos[index].height}
                alt=""
                loading="lazy"
                decoding="async"
                sizes="(min-width: 1024px) 360px, calc(100vw - 6rem)"
                className="veil-photo absolute inset-0 h-full w-full object-cover"
              />

              {/*
               * The paper the words are on, and it is deliberately not a uniform
               * tint.
               *
               * The photograph is allowed to be a photograph across the top of the
               * card and dissolves into near-solid cream by the time the copy
               * starts. That ordering is the contrast argument: there is no
               * picture under the body text at either the resting or the hovered
               * opacity, so lifting the image on hover cannot take a word below
               * its ratio.
               */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-b from-bone/12 via-bone/88 via-42% to-bone/97"
              />

              <div className="relative px-6 pt-24 pb-7 lg:pt-28">
                <h3 className="text-lead font-bold text-bone-ink">
                  {t(`pages.treatment.steps.${treatmentKey}.${step}.title`)}
                </h3>

                {/* The bronze rule under the heading — the same piece of furniture
                    the eyebrow above every section on this site carries. */}
                <span aria-hidden className="mt-3.5 block h-px w-10 bg-gilt" />

                <p className="mt-3.5 text-body leading-relaxed text-bone-ink-soft">
                  {t(`pages.treatment.steps.${treatmentKey}.${step}.body`)}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
