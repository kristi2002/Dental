import { getTranslations } from 'next-intl/server';
import { GALLERY } from '@/components/site/photos';
import { Ambience } from '@/components/site/Ambience';
import { GhostWord } from '@/components/site/GhostWord';
import { GlowGrid } from '@/components/site/GlowGrid';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';

/**
 * How the work is actually done: the record, and the instruments.
 *
 * The brief asked for a section proving the clinic's modern capabilities — a 3D
 * scanner, a sterilisation room — with the photographs scaling as the reader
 * scrolls. The scroll part is here. The proving part is deliberately narrower
 * than the brief, and it is worth saying why in the file rather than only in a
 * commit message.
 *
 * **Every photograph on this page is stock**, `photos.ts` says so at the top,
 * and a section captioned "our intraoral scanner" over a photograph of somebody
 * else's scanner is a claim about equipment this practice may or may not own.
 * That is a different kind of placeholder from a stock treatment room: one is
 * illustrative, the other is a specification. So the two panels here say only
 * things the page already asserts and the practice already stands behind — the
 * electronic record, tooth by tooth, which is what the software underneath this
 * site *is*, and sterilisation between patients, which is the floor every
 * practice works to rather than a boast.
 *
 * When Dr. Shehu confirms what is in the surgery, this is the section that gets
 * the specifics, and the photographs get replaced at the same time.
 */
export async function HowWeWork() {
  const t = await getTranslations('site');

  // Both already in the gallery, so nothing new is downloaded for this section
  // on a visitor who has scrolled past it.
  const scanner = GALLERY.find((photo) => photo.key === 'scanner');
  const sterile = GALLERY.find((photo) => photo.key === 'sterile');
  const panels = [
    { key: 'record', photo: scanner },
    { key: 'clean', photo: sterile },
  ].filter((panel) => panel.photo !== undefined);

  if (panels.length === 0) return null;

  return (
    <section
      id="how"
      // `clip`, never `hidden`: the photographs below are on `view()` timelines
      // and `hidden` would make this section their scroll container and freeze
      // them mid-drift. See the note on `.drift` in globals.css.
      // `relative` for `Ambience`, whose two layers are absolutely positioned
      // and would otherwise hang themselves off the page rather than off this
      // section.
      className="seam relative scroll-mt-20 overflow-clip bg-navy px-5 py-band text-white sm:px-8"
    >
      <Ambience />

      {/*
       * Top right, in the one piece of empty ground this section has: from `lg`
       * the panels sit side by side, the heading and its lede take the left half
       * and stop well short of the fold, and the quadrant above the right-hand
       * photograph is empty.
       *
       * It was at the foot of the section first, which was wrong twice: the word
       * came out clipped by the section's own bottom edge, so it read as a
       * fragment rather than as a bleed, and what it was hung behind was the
       * second panel's caption — the one thing in a section like this that
       * somebody is actually reading.
       *
       * **`lg` and up only, and that is the honest answer rather than a
       * shortcut.** Below `lg` this section is a single column: the heading, the
       * lede, then two photographs stacked, and there is no empty ground at all.
       * Every placement that fits puts the word behind the heading, which is
       * precisely the failure the effect is defined against — see `GhostWord`.
       * The aurora and the grain still give the phone its surface; they are what
       * this layer was ever an addition to. The other two words sit on cream
       * sections whose bottom band survives the collapse to one column, which is
       * why they stay.
       *
       * Two thirds of the usual size once it does appear. At the full clamp the
       * word is 887px wide and there is no placement at 1024px that clears both
       * the heading and the panels.
       */}
      <GhostWord className="top-14 -right-[3vw] hidden text-[7rem] text-white/[0.05] lg:block">
        Methodus
      </GhostWord>

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          {/* `gilt`, not `gilt-deep`: the bright bronze is 5.8:1 on this navy
              and the deep one is 1.4:1. The rule the other way about on cream. */}
          <SectionEyebrow className="text-gilt">{t('how.eyebrow')}</SectionEyebrow>
          <h2 className="type-section mt-5 max-w-[16ch] text-white">{t('how.title')}</h2>
          <p className="mt-5 max-w-[54ch] text-body leading-relaxed text-navy-ink">
            {t('how.lede')}
          </p>
        </Reveal>

        {/*
         * The caption sits *on* the photograph now rather than under it.
         *
         * It was a picture with two paragraphs printed below it, which is a
         * layout with a specific failure: at `lg` the two photographs line up
         * and the two captions do not, because one is a line longer than the
         * other — so the section read as two figures that had drifted out of
         * register. Putting the words on a glass panel inside the picture
         * removes the question entirely; both cards are the same object, and
         * the panel is bottom-aligned within each.
         *
         * It also gives the section the thing it was most obviously missing.
         * Two photographs and two paragraphs on flat navy is a page that does
         * not respond to being looked at — see `.glass-card` and `.tilt-plate`
         * for what the cursor now does to it.
         */}
        <GlowGrid className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {panels.map((panel, index) => (
            <Reveal
              as="li"
              key={panel.key}
              step={index}
              className="glow-card group relative overflow-hidden rounded-2xl border border-white/10"
            >
              {/* The plate the tilt is applied to, and it has to be an inner
                  element rather than the card: the card is a `Reveal`, whose
                  `view()` animation holds a transform for the whole life of the
                  page, and a second `transform` on the same element would lose
                  the cascade to it. Same reason as the treatment grid. */}
              <div className="tilt-plate">
                {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                <img
                  src={panel.photo!.src}
                  width={panel.photo!.width}
                  height={panel.photo!.height}
                  alt={t(`gallery.alt.${panel.key === 'record' ? 'scanner' : 'sterile'}`)}
                  loading="lazy"
                  decoding="async"
                  sizes="(min-width: 1024px) 560px, calc(100vw - 2.5rem)"
                  className="block aspect-4/3 w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:aspect-16/10 lg:aspect-4/3"
                />

                {/* A wash under the panel rather than behind the type. The glass
                    carries the contrast; this only stops a bright photograph
                    making the panel's own edge invisible. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-navy/85 from-2% via-navy/25 via-45% to-transparent to-75%"
                />

                {/*
                 * In the flow on a phone, floating over the picture from `sm`.
                 *
                 * Absolute at every width was wrong and obviously so the moment
                 * it was looked at on a 390px screen: the panel is four lines of
                 * body copy, the card at that width is about 260px tall, and a
                 * panel anchored to the bottom of a box shorter than itself
                 * grows upward straight out through the top edge — taking the
                 * heading with it. Both headings were clipped off.
                 *
                 * Sizing the type down or the card up would only move where it
                 * breaks, and it would break again in whichever language sets
                 * longest. In the flow the card is as tall as its contents and
                 * there is nothing to overflow.
                 */}
                <div className="glass-card relative m-3 p-5 sm:absolute sm:inset-x-5 sm:bottom-5 sm:m-0 sm:p-6">
                  <h3 className="text-lead font-bold text-white">
                    {t(`how.${panel.key}.title`)}
                  </h3>
                  <p className="mt-2 max-w-[46ch] text-body leading-relaxed text-white/85">
                    {t(`how.${panel.key}.body`)}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </GlowGrid>

        {/* The same note the practice section carries, for the same reason: these
            are not photographs of this surgery and the page says so where they
            appear rather than in a footer nobody reads. */}
        <p className="mt-10 text-meta text-navy-ink-soft">{t('how.illustrative')}</p>
      </div>
    </section>
  );
}
