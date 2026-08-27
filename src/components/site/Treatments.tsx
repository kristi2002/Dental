import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { TREATMENT_PHOTOS } from '@/components/site/photos';
import { GlowGrid } from '@/components/site/GlowGrid';
import { Reveal } from '@/components/site/Reveal';
import { Watermark } from '@/components/site/Watermark';
import { TREATMENTS } from '@/lib/site-content';
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
 * Eight rather than six now that orthodontics and whitening have pictures of
 * their own. They were a footnote before only because the chart could not draw
 * them, which was a constraint of the medium and never of the practice.
 *
 * The whole grid is server-rendered; the only client code is `Reveal`, which
 * staggers them in as you reach them.
 */
export async function Treatments() {
  const t = await getTranslations('site');

  return (
    <section
      id="treatments"
      className="relative scroll-mt-20 overflow-clip bg-bone px-5 py-20 sm:px-8 sm:py-28"
    >
      <Watermark className="-top-24 -right-32 w-[34rem] text-gilt/[0.05]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="type-lead max-w-[16ch] text-bone-ink">{t('treatments.title')}</h2>
          <p className="mt-5 max-w-[54ch] text-[1.05rem] text-bone-ink-soft">
            {t('treatments.lede')}
          </p>
        </Reveal>

        {/*
         * Three columns, and the first card takes two of them.
         *
         * It was four equal columns before, which is the shape this page was
         * criticised for and deservedly: eight cards of identical size,
         * identical crop and identical treatment read as a wall rather than as
         * a list of eight different things, and the eye has nowhere to enter.
         * Giving the check-up a double-width card fixes both at once — it is a
         * composition rather than a grid, and the card that leads is the one
         * every patient actually starts with, which is what the copy under it
         * already says.
         *
         * The arithmetic is exact and worth keeping that way: 2 + 7 = 9 = three
         * full rows of three, so there is no orphan cell at the end. Below
         * `lg` the span is dropped and eight cards fill four rows of two, which
         * is also exact. A feature card that leaves a hole under it is worse
         * than no feature card.
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
                  index === 0 && 'lg:col-span-2',
                )}
              >
                {/*
                 * The plate the tilt is applied to, and it has to be an inner
                 * element rather than the card. The card is a `Reveal`, whose
                 * `view()` animation holds a transform for the whole life of the
                 * page — a second `transform` on the same element would lose the
                 * cascade to it and never appear at all. See `.tilt-plate`.
                 */}
                <div className="tilt-plate">
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
                      // like a mistake.
                      index === 0 ? 'aspect-4/5 lg:aspect-16/10' : 'aspect-4/5',
                    )}
                  />

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
                    <h3 className="flex items-start gap-1.5 text-[1.1rem] font-bold text-white">
                      {t(`treatments.${treatment.key}.title`)}
                      <ArrowUpRight
                        size={17}
                        aria-hidden
                        className="mt-1 shrink-0 text-gilt opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </h3>
                    <p className="mt-1.5 text-[0.93rem] leading-relaxed text-navy-ink">
                      {t(`treatments.${treatment.key}.body`)}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </GlowGrid>
      </div>
    </section>
  );
}
