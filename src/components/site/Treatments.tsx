import { ViewTransition } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { TREATMENT_PHOTOS } from '@/components/site/photos';
import { GlowGrid } from '@/components/site/GlowGrid';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Watermark } from '@/components/site/Watermark';
import { Link } from '@/i18n/navigation';
import { TREATMENTS, treatmentPath, treatmentTransitionName } from '@/lib/site-content';
import { cn } from '@/lib/utils';

/**
 * What the practice does, as photographs.
 *
 * This section used to be built from the app's own dental chart — twenty-six
 * teeth modelled from millimetre measurements, each rendered in the state a
 * treatment leaves it in. It was the most technically interesting thing on the
 * page and the wrong thing to show a patient: exact anatomical drawings of a
 * root-filled molar read as a textbook plate, and the person looking at them is
 * usually nervous about the chair already. The chart is excellent at its job and
 * its job is helping a dentist record a finding.
 *
 * So: photographs, one per treatment, and the card is the picture. The type sits
 * *on* the image behind a gradient rather than beside it in a box, which is what
 * keeps eight cards from reading as a spreadsheet — at a glance the section is a
 * wall of images, and the words arrive as you look at each one.
 *
 * Eleven rather than six. Orthodontics and whitening arrived when photographs
 * replaced the chart — they were a footnote before only because the chart could
 * not draw them, which was a constraint of the medium and never of the practice
 * — and veneers, oral surgery and dentures arrived from the practice's own
 * printed list of services. `TREATMENT_KEYS` carries that argument in full.
 *
 * **Every card is a link now**, which is what the arrow in the corner has been
 * promising since it was drawn. Each treatment has a page of its own under
 * `/treatments/<slug>`, so this section is what it always looked like — a way in
 * — rather than the whole of what the site had to say about eleven treatments.
 *
 * The whole grid is server-rendered; the only client code is `Reveal`, which
 * staggers them in as you reach them.
 */
export async function Treatments() {
  const t = await getTranslations('site');

  return (
    <section
      id="treatments"
      className="relative scroll-mt-20 overflow-clip px-5 py-band-lead sm:px-8"
    >
      <Watermark className="-top-24 -right-32 w-[34rem] text-gilt/[0.05]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">{t('treatments.eyebrow')}</SectionEyebrow>
          <h2 className="type-lead mt-5 max-w-[16ch] text-bone-ink">{t('treatments.title')}</h2>
          <p className="mt-5 max-w-[54ch] text-body text-bone-ink-soft">
            {t('treatments.lede')}
          </p>
        </Reveal>

        {/*
         * Three columns, and the first card takes two of them.
         *
         * It was four equal columns before, which is the shape this page was
         * criticised for and deservedly: cards of identical size, identical crop
         * and identical treatment read as a wall rather than as a list of
         * different things, and the eye has nowhere to enter. Giving the
         * check-up a double-width card fixes both at once — it is a composition
         * rather than a grid, and the card that leads is the one every patient
         * actually starts with, which is what the copy under it already says.
         *
         * **The arithmetic is exact at both widths and has to stay that way.**
         * The lead card spans two columns wherever there are two or more, so the
         * section occupies `n + 1` cells: eleven treatments is twelve, which is
         * four full rows of three and six full rows of two with nothing left
         * over. A feature card that leaves a hole under it is worse than no
         * feature card.
         *
         * The span used to be `lg` only, which was correct for eight — eight
         * cards is four exact rows of two on their own. It is wrong for eleven,
         * where the same rule would strand a single card in the last row at
         * tablet width. `TREATMENT_KEYS` carries the other half of this note.
         */}
        <GlowGrid className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TREATMENTS.map((treatment, index) => {
            const photo = TREATMENT_PHOTOS[treatment.key];

            return (
              <Reveal
                as="li"
                key={treatment.key}
                // Across the row, not down the list: three cards arrive in
                // sequence and the fourth starts the sequence again, so the eye
                // reads a row landing rather than a queue of eight.
                step={index % 3}
                className={cn(
                  'glow-card group relative overflow-hidden rounded-2xl bg-navy',
                  index === 0 && 'sm:col-span-2',
                )}
              >
                {/*
                 * The whole card is the link, and the heading is inside it.
                 *
                 * Each of these now has a page of its own, and the thing a
                 * reader tries to press on a card that is a picture with a title
                 * on it is the picture. An anchor around only the title would
                 * leave nine tenths of the target inert — and the arrow in the
                 * corner, which has always been drawn here, would finally be
                 * telling the truth.
                 */}
                <Link href={treatmentPath(treatment.key)} className="block no-underline">
                {/*
                 * The plate the tilt is applied to, and it has to be an inner
                 * element rather than the card. The card is a `Reveal`, whose
                 * `view()` animation holds a transform for the whole life of the
                 * page — a second `transform` on the same element would lose the
                 * cascade to it and never appear at all. See `.tilt-plate`.
                 */}
                <div className="tilt-plate">
                  {/*
                   * The near end of the morph into the treatment's own page.
                   *
                   * The card and the hero it opens are two photographs of the
                   * same thing, and cutting between them made the reader check
                   * they had pressed the right one. Carrying the same
                   * `view-transition-name` on both sides, the browser animates a
                   * single object from this grid cell to the hero slot instead.
                   *
                   * **The plain CSS property rather than React's
                   * `<ViewTransition>`.** The component is the documented route
                   * and it does not work here: on this React it never stamps the
                   * name, so the only thing the browser is handed at navigation
                   * is `root` and the pair silently never forms. Next *does*
                   * wrap the navigation in `startViewTransition` — which is the
                   * whole mechanism — so naming the two elements directly gets
                   * the morph the component was going to ask for anyway, with
                   * nothing between us and the browser. See
                   * `treatmentTransitionName`.
                   *
                   * It goes on the `<img>` rather than on the tilt plate around
                   * it: the plate carries a hover transform, and a snapshot is
                   * taken of an element's *rendered* box — so the capture would
                   * happen mid-tilt for anybody whose pointer was still on the
                   * card as they pressed it, which is everybody.
                   */}
                  <ViewTransition
                    name={treatmentTransitionName(treatment.key)}
                    share="morph"
                    default="none"
                  >
                    {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                    <img
                      src={photo.src}
                      width={photo.width}
                      height={photo.height}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        'w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
                        // The lead card is two columns wide, so it gets a landscape
                        // crop. Left at 4:5 it would be a portrait stretched to
                        // twice the width — the one way to make a feature card look
                        // like a mistake. The breakpoint tracks the span exactly:
                        // both start at `sm`, and they have to, or the card is
                        // double width for one breakpoint while still cropped tall.
                        index === 0 ? 'aspect-4/5 sm:aspect-16/10' : 'aspect-4/5',
                      )}
                    />
                  </ViewTransition>

                  {/* Three stops rather than two, and the middle one moved down
                      the card. The first pass ran `via-navy/55` through the centre,
                      which put a wash over the whole photograph and turned the
                      darker images — a laboratory bench, a set of radiographs —
                      into flat rectangles. The type still needs real darkness
                      under it; the top two thirds do not. */}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-navy from-5% via-navy/70 via-32% to-transparent to-72%"
                  />

                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <h3 className="flex items-start gap-1.5 text-lead font-bold text-white">
                      {t(`treatments.${treatment.key}.title`)}
                      <ArrowUpRight
                        size={17}
                        aria-hidden
                        className="reveal-on-hover mt-1 shrink-0 text-gilt opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </h3>
                    <p className="mt-1.5 text-meta leading-relaxed text-navy-ink">
                      {t(`treatments.${treatment.key}.body`)}
                    </p>
                  </div>
                </div>
                </Link>
              </Reveal>
            );
          })}
        </GlowGrid>
      </div>
    </section>
  );
}
