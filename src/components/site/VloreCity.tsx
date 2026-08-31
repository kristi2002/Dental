import { getTranslations } from 'next-intl/server';
import { GhostWord } from '@/components/site/GhostWord';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';

/**
 * The town, for the reader who has never been to it.
 *
 * `Directions` answers *how do I get to Vlorë* and `TripPlanner` answers *how
 * long would it keep me there*. Between them they had the whole of a trip
 * covered except the part that decides whether somebody takes it: what the
 * place actually is. A patient weighing up flying to a coastal town in Albania
 * for a crown is not only pricing the crown.
 *
 * ⚠️ **Three facts, and not one of them is a number about a journey.** That is
 * the same rule `Directions` sets out at length and it matters more here, not
 * less: a section about a town is exactly where "20 minutes from the airport"
 * and "6 hours from Brindisi" want to be written, and this repository has
 * sourced neither. What is here instead is what does not change between
 * summers — the geography, what happened in the town in 1912, and where the
 * coast road goes. If Dr. Shehu wants to recommend a hotel or a beach, that is
 * his to put his name to, with the date it was checked.
 *
 * **No photograph, deliberately.** The bay is the one image on this site
 * genuinely taken here, and by the time a reader reaches this section the visit
 * page has already shown it to them three times — in the opening band, in the
 * "coming from abroad" card and full width under the three routes. A fourth
 * copy would not be illustrating the town, it would be admitting there is only
 * one picture of it. Set as type on navy, this reads as a note from somebody
 * who lives there, which is what it is.
 *
 * **Numerals rather than icons.** Three icon circles is what `WhyUs` and
 * `Directions` are already doing on this page, and a third grid of bronze
 * roundels a screen apart is a template showing through. A numbered list under
 * hairlines is the other thing an editorial page knows how to do.
 */

/** The three, in the order somebody would be told them. */
const FACTS = ['seas', 'history', 'riviera'] as const;

export async function VloreCity() {
  const t = await getTranslations('site');

  return (
    <section
      // `seam` for the bronze wash every navy band on this site carries at both
      // edges; `clip` and never `hidden` — see the note under `.drift`.
      className="seam relative overflow-clip bg-navy px-5 py-band text-white sm:px-8"
    >
      <GhostWord className="-right-[4vw] top-10 hidden text-white/[0.05] lg:block">Vlora</GhostWord>

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt">{t('pages.abroad.city.eyebrow')}</SectionEyebrow>
          <h2 className="type-section mt-5 max-w-[16ch] text-white">
            {t('pages.abroad.city.title')}
          </h2>
          <p className="mt-5 max-w-[58ch] text-body leading-relaxed text-navy-ink">
            {t('pages.abroad.city.lede')}
          </p>
        </Reveal>

        <ol className="mt-14 grid gap-x-8 gap-y-10 lg:grid-cols-3">
          {FACTS.map((key, index) => (
            <Reveal as="li" key={key} step={index} className="border-t border-navy-line/70 pt-6">
              {/* The numeral is ornament, not content: the list is already an
                  `<ol>`, so a screen reader is counting these anyway and a
                  spoken "zero one" before every heading is the count said
                  twice. */}
              <span
                aria-hidden
                className="font-display text-figure leading-none font-normal text-gilt"
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <h3 className="mt-4 text-lead font-bold text-white">
                {t(`pages.abroad.city.${key}.title`)}
              </h3>
              <p className="mt-2.5 text-body leading-relaxed text-navy-ink-soft">
                {t(`pages.abroad.city.${key}.body`)}
              </p>
            </Reveal>
          ))}
        </ol>

        <Reveal step={3}>
          <p className="mt-12 max-w-[62ch] text-body leading-relaxed text-navy-ink-soft">
            {t('pages.abroad.city.note')}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
