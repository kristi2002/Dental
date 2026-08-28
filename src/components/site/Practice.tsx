import { getTranslations } from 'next-intl/server';
import { PHOTOS, srcSetFor } from '@/components/site/photos';
import { GhostWord } from '@/components/site/GhostWord';
import { GlowGrid } from '@/components/site/GlowGrid';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Swash } from '@/components/site/Swash';
import { localeLabels, locales } from '@/i18n/routing';

/**
 * Who does the work, and what the room is like.
 *
 * The section a clinic page normally spends on a grid of smiling headshots and
 * a paragraph about passion. There is no headshot here because there is no
 * photograph of Dr. Shehu — see `photos.ts` — and the honest version of that
 * constraint turned out to be the better section anyway: the dentist is named in
 * the display face, at size, which is what a wordmark-led identity should do
 * with a person's name.
 *
 * The three facts underneath are the only claims on this page a reader could
 * check, and each is sourced. Two come from the practice's own records; the
 * rating is Google's and is labelled as Google's, which is the difference
 * between a citation and a boast.
 */
export async function Practice() {
  const t = await getTranslations('site');

  const facts = [
    {
      key: 'languages',
      value: locales.map((locale) => localeLabels[locale]).join(' · '),
    },
    { key: 'rating', value: t('practice.facts.ratingValue') },
    { key: 'records', value: t('practice.facts.recordsValue') },
  ];

  return (
    <section
      id="practice"
      // `overflow-clip` because the photograph below deliberately runs past the
      // right edge of the content column to the edge of the screen, and a
      // sub-pixel rounding error on that calculation would otherwise put the
      // whole document into a horizontal scroll. `clip` rather than `hidden`:
      // this section contains both the drifting photograph and the swash, and
      // `hidden` would make it their scroll container and freeze both.
      //
      // `relative` is `GhostWord`'s requirement rather than the photograph's:
      // it is absolutely positioned, and with no positioned ancestor here it
      // would hang itself off the page instead of off this section.
      //
      // No ground of its own any more. Every cream section on the storefront is
      // transparent now and the wrapper in `(site)/layout.tsx` carries the one
      // `bone` for all of them — which is what lets a single fixed light run
      // behind the lot without being cut into plates at each boundary.
      className="relative scroll-mt-20 overflow-clip px-5 py-20 sm:px-8 sm:py-24"
    >
      {/* Low and off the left edge, under the block of prose rather than behind
          the name. A grey word crossing a person's name reads as a printing
          fault, and this section's whole argument is that the name is the
          largest thing in it. */}
      <GhostWord className="-left-[4vw] bottom-6 text-navy/[0.045]">Medicus</GhostWord>

      {/* `relative` so the column paints over the light rather than under it —
          an absolutely positioned sibling paints above static in-flow content,
          which is the one way this layer can go wrong. */}
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div className="order-2 lg:order-1">
          <SectionEyebrow className="text-gilt-deep">{t('practice.eyebrow')}</SectionEyebrow>
          {/* The name in the wordmark's own serif, at the size a wordmark-led
              identity should give a person's name. */}
          <h2 className="type-lead mt-5 text-bone-ink">{t('practice.dentist')}</h2>
          <p className="mt-2 text-[1.02rem] font-semibold text-gilt-deep">
            {t('practice.dentistRole')}
          </p>

          <div className="mt-6 space-y-4 text-[1.05rem] leading-relaxed text-bone-ink-soft">
            <p>{t('practice.bodyOne')}</p>
            <p>{t('practice.bodyTwo')}</p>
          </div>

        </div>

        {/*
         * The one place on this page the content column is deliberately broken.
         *
         * Every section here sits inside the same centred 72rem box, which is
         * safe and is most of the reason the page read as a template: nothing
         * ever touches an edge, so the composition has no tension anywhere in
         * eight thousand pixels of scrolling. The practice section is the right
         * one to break, because it is the page's human moment — the dentist's
         * name set at display size — and a photograph running off the side of
         * the screen is what makes that read as a spread rather than a row.
         *
         * The negative margin is the exact distance from the container's right
         * edge to the viewport's, and it is the same expression `Gallery` uses
         * to bleed the carousel. Below `lg` it is dropped entirely and the
         * figure is an ordinary block, because on a phone there is no column to
         * break out of.
         */}
        <figure className="order-1 lg:order-2 lg:mr-[calc(-1*max(2rem,(100vw-72rem)/2))]">
          {/* The frame carries the corner, the border and the clip; the
              photograph inside it is a plain rectangle that drifts very slightly
              closer as the section crosses the screen. Splitting the two is what
              keeps a growing image inside a rounded corner — see `.drift` in
              globals, and note that a browser without scroll-driven animations
              simply draws it still. */}
          <div className="drift-clip rounded-2xl border border-bone-deep shadow-lift lg:rounded-r-none lg:border-r-0">
            {/* A fixed asset the app ships with, already at the width it is
                drawn at: nothing for the optimizer to earn, and one more moving
                part in a self-hosted deploy to lose. Same reasoning as
                `ClinicLogo`, set out in full in `components/site/photos.ts`. */}
            {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
            <img
              src={PHOTOS.surgery.src}
              srcSet={srcSetFor(PHOTOS.surgery)}
              sizes="(min-width: 1024px) 52vw, calc(100vw - 2.5rem)"
              width={PHOTOS.surgery.width}
              height={PHOTOS.surgery.height}
              alt={t('practice.surgeryAlt')}
              loading="lazy"
              decoding="async"
              className="drift block w-full object-cover lg:aspect-4/3"
            />
          </div>
          <figcaption className="mt-3 text-[0.88rem] text-bone-ink-faint">
            {t('practice.surgeryCaption')}
          </figcaption>
        </figure>
      </div>

      {/*
       * The three facts, as their own band across the full width.
       *
       * They were three bordered rows at the bottom of the left-hand column —
       * a definition list drawn as a table, in the narrower half of a
       * two-column spread, under four paragraphs. Everything about that placing
       * was working against them: they are the section's only *hard* content
       * (the languages spoken, the Google rating, what the record actually is)
       * and they were the smallest, greyest, most easily skipped thing in it.
       *
       * Given the whole width and set on glass they become the section's second
       * beat, and the column above is left as what it should have been all
       * along — a name, and two paragraphs about how the practice works.
       *
       * Still a `<dl>`. These are three terms and their definitions, whatever
       * they are drawn as, and a screen reader announcing "Languages, Albanian ·
       * English · Italiano" is the entire point of the markup.
       */}
      <div className="relative mx-auto mt-16 w-full max-w-6xl">
        {/* One `Reveal` on the row rather than one per card, and that is a
            constraint rather than a preference: `Reveal` animates a transform,
            `.tilt-panel` sets one, and the two on the same element means the
            lean never appears. Parent animates, children lean. */}
        <Reveal>
          <GlowGrid as="dl" className="grid gap-5 sm:grid-cols-3">
            {facts.map((fact) => (
              <div
                key={fact.key}
                data-tilt
                className="glass-card glass-card-bone tilt-panel px-6 py-6"
              >
                <dt className="text-[0.82rem] font-semibold tracking-[0.14em] text-bone-ink-faint uppercase">
                  {t(`practice.facts.${fact.key}`)}
                </dt>
                <dd className="mt-3 text-[1.06rem] leading-relaxed font-semibold text-bone-ink">
                  {fact.value}
                </dd>
              </div>
            ))}
          </GlowGrid>
        </Reveal>
      </div>

      {/* `relative` for the same reason the column above it has one: the light
          is an absolutely positioned sibling and would otherwise be painted
          over the top of this hairline. */}
      <div className="relative mx-auto mt-16 w-full max-w-6xl">
        <Swash />
      </div>
    </section>
  );
}
