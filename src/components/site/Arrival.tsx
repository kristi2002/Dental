import { Accessibility, Building2, BusFront, DoorOpen, SquareParking } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ComponentType } from 'react';
import { GhostWord } from '@/components/site/GhostWord';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { ARRIVAL_ANSWERED, type ArrivalKey, hasArrival } from '@/lib/site-content';

/**
 * The last hundred metres.
 *
 * `/visit` answers when the practice is open, and `ClinicMap` at the foot of it
 * answers which building. Between those two sits the part nobody on this site
 * has ever written down: where a car goes, which door it is, whether there are
 * stairs, and what a person looking up from a telephone should expect to see.
 *
 * **This is not `Directions`, and the difference is the scale.** That section
 * moved to `/abroad` with the rest of the travelling, and it is written for
 * somebody in Bari deciding between a ferry and a flight. A patient already
 * standing on Rruga e Re has a much smaller question and gets nothing from a
 * timetable of crossings. `/visit` gave the local reader the week and the pin
 * and then stopped one doorway short.
 *
 * ⚠️ **It renders nothing today, and that is the state it ships in.**
 * `ARRIVAL_ANSWERED` is empty — see the long note on it in `site-content.ts` —
 * because not one of the five facts is derivable from anything in this
 * repository and every one of them is acted on physically. A guessed price
 * costs an awkward conversation at a desk. A guessed doorway costs somebody
 * with a wheelchair or a pushchair their appointment, having been sent there by
 * this page. So the slot is built, wired and documented, and the answers are
 * the practice's to give: add the keys Dr. Shehu confirms to `ARRIVAL_ANSWERED`
 * and write their wording under `pages.visit.arrival.*` in all three message
 * files, and the section appears.
 *
 * A partial table is correct and expected. The parking answered and the lift
 * left out says something true; a section that hedges about both says nothing.
 *
 * Cream, and placed immediately above the map — the sentence, then the pin that
 * confirms it. See the note in `(site)/visit/page.tsx` on the order of the page.
 */

/** The five, in the order somebody arriving meets them. */
const ICONS: Record<ArrivalKey, ComponentType<{ size?: number }>> = {
  transport: BusFront,
  parking: SquareParking,
  landmark: Building2,
  door: DoorOpen,
  access: Accessibility,
};

export async function Arrival() {
  const t = await getTranslations('site');

  // Nothing confirmed, nothing rendered — the `Aftercare` guarantee block's
  // arrangement exactly, and for a sharper version of its reason.
  if (!hasArrival()) return null;

  return (
    <section
      id="arrival"
      // `clip` and never `hidden`, as everywhere on this storefront: see the
      // note under `.drift` in globals.css.
      className="relative scroll-mt-20 overflow-clip px-5 py-20 sm:px-8 sm:py-24"
    >
      {/* Latin, untranslated, one per section — the threshold. */}
      <GhostWord className="-left-[5vw] top-8 hidden text-navy/[0.045] lg:block">Limen</GhostWord>

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">
            {t('pages.visit.arrival.eyebrow')}
          </SectionEyebrow>

          <h2 className="type-section mt-5 max-w-[18ch] text-bone-ink">
            {t('pages.visit.arrival.title')}
          </h2>

          <p className="mt-5 max-w-[58ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('pages.visit.arrival.lede')}
          </p>
        </Reveal>

        {/* A ruled list rather than cards. These are answers to five questions
            rather than five offers, and the page already carries two grids of
            cards above this one — a third would make the route read as a
            catalogue of panels. */}
        <ul className="mt-11 grid gap-x-12 sm:grid-cols-2">
          {ARRIVAL_ANSWERED.map((key, index) => {
            const Icon = ICONS[key];

            return (
              <Reveal
                as="li"
                key={key}
                step={index}
                className="flex gap-4 border-b border-bone-deep py-6"
              >
                <span
                  aria-hidden
                  className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-gilt/50 bg-gilt-soft text-gilt-deep"
                >
                  <Icon size={17} />
                </span>

                <span className="min-w-0">
                  <h3 className="text-[1.08rem] font-bold text-bone-ink">
                    {t(`pages.visit.arrival.${key}.title`)}
                  </h3>
                  <p className="mt-1.5 text-[1rem] leading-relaxed text-bone-ink-soft">
                    {t(`pages.visit.arrival.${key}.body`)}
                  </p>
                </span>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
