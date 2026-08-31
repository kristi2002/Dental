import { Car, Plane, Ship } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PHOTOS, srcSetFor } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';

/**
 * How people actually get to Vlorë, for the ones who are not already here.
 *
 * A good share of this practice's patients fly or sail in, and the front page
 * says so in a single card — "coming from abroad? write to us before you
 * travel". That card is the offer; this is the part that was missing under it,
 * because the reader who is weighing up a trip is not asking whether the
 * practice will help, they are asking *how do I even get there*.
 *
 * ⚠️ **There is deliberately not a single number on this section, and that is
 * the whole design.** The obvious build is three cards reading "2h30 from Tirana
 * airport", "6h ferry from Brindisi", "€40 taxi" — and every one of those is a
 * figure nobody in this repository has sourced, on a page somebody is using to
 * book a flight. Road times change with the season and the roadworks, ferry
 * routes are added and dropped between summers, and a practice that publishes a
 * timetable it does not own is a practice fielding a telephone call from
 * somebody stranded in Brindisi.
 *
 * What each card says instead is the thing that is true whatever the timetable
 * does: which of the three ways in it is, and that the practice will fit the
 * appointments around the journey once it knows what the journey is. When Dr.
 * Shehu is willing to put his name to specific routes and times, they belong
 * here with the date they were checked — the same rule `TREATMENT_PRICES` sets
 * out for prices.
 *
 * **The dashed rule between the cards** is scroll-drawn like the swash and the
 * first-visit thread: three ways in, drawn as three points on one route. It is
 * `lg`-only, because below that the cards are stacked and a horizontal line
 * across them would be joining nothing. See `.route-draw` in globals.css.
 */

/** The three ways in, in the order most patients use them. */
const ROUTES = [
  { key: 'air', icon: Plane },
  { key: 'sea', icon: Ship },
  { key: 'road', icon: Car },
] as const;

export async function Directions() {
  const t = await getTranslations('site');

  return (
    <section
      id="getting-here"
      // `clip` and never `hidden`: the drawn rule and the drifting photograph
      // below are both on `view()` timelines. See the note on `.drift`.
      className="relative scroll-mt-20 overflow-clip px-5 py-band sm:px-8"
    >
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="type-section max-w-[18ch] text-bone-ink">
            {t('pages.abroad.getting.title')}
          </h2>
          <p className="mt-5 max-w-[56ch] text-body leading-relaxed text-bone-ink-soft">
            {t('pages.abroad.getting.lede')}
          </p>
        </Reveal>

        <div className="relative mt-12">
          {/* Sits behind the three nodes, at their vertical centre. `top` is the
              card's padding plus half the node, which is why it is a bracketed
              value rather than a utility — it has to line up with a 2.75rem
              circle and nothing in the scale does. */}
          <span aria-hidden className="route-draw top-[3.375rem] hidden lg:block" />

          <ol className="relative grid gap-5 lg:grid-cols-3 lg:gap-8">
            {ROUTES.map((route, index) => (
              <Reveal
                as="li"
                key={route.key}
                step={index}
                className="card flex flex-col p-6 transition-colors hover:border-gilt sm:p-7"
              >
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full border border-gilt/50 bg-gilt-soft text-gilt-deep"
                >
                  <route.icon size={20} />
                </span>

                <h3 className="mt-5 text-lead font-bold text-bone-ink">
                  {t(`pages.abroad.getting.${route.key}.title`)}
                </h3>
                <p className="mt-2.5 text-body leading-relaxed text-bone-ink-soft">
                  {t(`pages.abroad.getting.${route.key}.body`)}
                </p>
              </Reveal>
            ))}
          </ol>
        </div>

        {/*
         * The bay, wide, under the three routes — the one photograph on this
         * site that genuinely is of the right place. It is used where the page
         * talks about travelling here rather than as decoration, which is the
         * rule `photos.ts` sets for it.
         */}
        <Reveal as="figure" className="mt-12">
          <div className="drift-clip rounded-2xl border border-bone-deep shadow-lift">
            {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
            <img
              src={PHOTOS.vloreBay.src}
              srcSet={srcSetFor(PHOTOS.vloreBay)}
              sizes="(min-width: 1024px) 1152px, calc(100vw - 2.5rem)"
              width={PHOTOS.vloreBay.width}
              height={PHOTOS.vloreBay.height}
              alt={t('visit.bayAlt')}
              loading="lazy"
              decoding="async"
              className="drift block aspect-16/9 w-full object-cover sm:aspect-[21/9]"
            />
          </div>
          <figcaption className="mt-4 max-w-[62ch] text-body leading-relaxed text-bone-ink-soft">
            {t('pages.abroad.getting.bayCaption')}
          </figcaption>
        </Reveal>
      </div>
    </section>
  );
}
