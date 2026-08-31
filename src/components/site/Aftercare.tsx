import { CalendarClock, FileText, MessageCircleHeart, ShieldCheck, Stethoscope } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { GhostWord } from '@/components/site/GhostWord';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import {
  GUARANTEES_REVIEWED,
  hasGuarantees,
  TREATMENT_GUARANTEES,
  TREATMENT_KEYS,
  type TreatmentKey,
} from '@/lib/site-content';

/**
 * What happens after the work is done and the patient is on a ferry.
 *
 * This is the hole the storefront had. The site could tell somebody flying in
 * from Bari how many appointments an implant takes, how many days it keeps them
 * in Vlorë and which of three ways into the city is theirs — and then stopped,
 * at exactly the question that decides whether they book: *and if it goes wrong
 * when I am four hundred miles away?* A dental-tourism page that answers the
 * journey and not the return is answering the easy half.
 *
 * **Three of the four claims here are already made elsewhere on this site**, and
 * that is the constraint `WhyUs` sets out at length rather than a shortage of
 * ideas. The written instructions are `pages.practice.languages.lede` ("the
 * instructions for afterwards") and the closing line of `treatments.extraction`;
 * the record that travels is `practice.facts.recordsValue` and
 * `pages.visit.clinic.record`; the open line back is the sentence the practice's
 * own follow-up message already ends on. Nothing is promised here that is not
 * promised upstream.
 *
 * **The fourth is new to the storefront and is not new to the practice.** The
 * clinic application has shipped a follow-up board and the message that goes
 * with it for as long as it has had patients — `messages.followUpWhatsapp` and
 * `followUpEmailBody`, sent a set number of days after treatment, asking how
 * somebody is getting on and telling them to reply if it hurts. The practice
 * does this. The website has simply never said so, which is the worst place for
 * a real reassurance to sit: in the software, invisible to the person it is
 * meant to reassure.
 *
 * ⚠️ **There is no guarantee here until Dr. Shehu writes one.** The block below
 * renders from `TREATMENT_GUARANTEES`, which is empty and ships empty — see the
 * note on it in `site-content.ts`. A warranty is a contract term rather than a
 * marketing line, and a section about standing behind your work is the single
 * worst place on a website to invent something. Until the table is filled in
 * this section says what the practice *does*, which is all of it true, and
 * claims nothing about what it *owes*.
 */

/**
 * The four, in the order the questions actually arrive: before you leave, a few
 * days later, whenever you need it, and if something is wrong.
 */
const POINTS = [
  { key: 'instructions', icon: FileText },
  { key: 'checkIn', icon: MessageCircleHeart },
  { key: 'record', icon: Stethoscope },
  { key: 'wrong', icon: CalendarClock },
] as const;

export async function Aftercare() {
  const t = await getTranslations('site');

  // Walked in `TREATMENT_KEYS` order rather than `Object.keys` order, so the
  // rows read in the clinical sequence the rest of the site is in whatever
  // order somebody happens to type the table in.
  const guaranteed = hasGuarantees()
    ? TREATMENT_KEYS.filter((key: TreatmentKey) => TREATMENT_GUARANTEES[key] !== undefined)
    : [];

  return (
    <section
      id="aftercare"
      // `clip` and never `hidden`, as everywhere on this storefront — see the
      // note under `.drift` in globals.css.
      className="relative scroll-mt-20 overflow-clip px-5 py-band sm:px-8"
    >
      {/* Latin, untranslated, one per section — the going home. */}
      <GhostWord className="-right-[5vw] top-8 text-navy/[0.045]">Reditus</GhostWord>

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">{t('aftercare.eyebrow')}</SectionEyebrow>

          <h2 className="type-section mt-5 max-w-[18ch] text-bone-ink">
            {t('aftercare.title')}
          </h2>

          <p className="mt-5 max-w-[58ch] text-body leading-relaxed text-bone-ink-soft">
            {t('aftercare.lede')}
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:gap-6">
          {POINTS.map((point, index) => (
            <Reveal
              as="li"
              key={point.key}
              step={index}
              className="card flex flex-col p-6 transition-colors hover:border-gilt sm:p-7"
            >
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-full border border-gilt/50 bg-gilt-soft text-gilt-deep"
              >
                <point.icon size={20} />
              </span>

              <h3 className="mt-5 text-lead font-bold text-bone-ink">
                {t(`aftercare.${point.key}.title`)}
              </h3>
              <p className="mt-2.5 text-body leading-relaxed text-bone-ink-soft">
                {t(`aftercare.${point.key}.body`)}
              </p>
            </Reveal>
          ))}
        </ul>

        {/*
         * The warranty table, which does not exist yet and therefore does not
         * render. See the note at the top of this file and the longer one on
         * `TREATMENT_GUARANTEES` — this is the `TripPlanner` price row's
         * arrangement exactly: the slot is built, the facts are the practice's
         * to supply, and an empty table prints nothing rather than a hedge.
         */}
        {guaranteed.length > 0 ? (
          <Reveal step={2} className="mt-11 border-t border-bone-deep pt-8">
            <h3 className="flex items-center gap-2.5 text-lead font-bold text-bone-ink">
              <ShieldCheck size={20} aria-hidden className="shrink-0 text-gilt-deep" />
              {t('aftercare.guaranteeTitle')}
            </h3>

            <p className="mt-2.5 max-w-[58ch] text-body leading-relaxed text-bone-ink-soft">
              {t('aftercare.guaranteeLede')}
            </p>

            <ul className="mt-7 grid gap-x-10 gap-y-3 sm:grid-cols-2">
              {guaranteed.map((key) => (
                <li
                  key={key}
                  className="flex items-baseline justify-between gap-4 border-b border-bone-deep pb-3"
                >
                  <span className="text-body font-semibold text-bone-ink">
                    {t(`treatments.${key}.title`)}
                  </span>
                  <span className="shrink-0 text-body text-bone-ink-soft tabular-nums">
                    {t('aftercare.years', { count: TREATMENT_GUARANTEES[key]!.years })}
                  </span>
                </li>
              ))}
            </ul>

            {/* The date, for the reason the price line carries one: a term with
                nothing saying when it was last confirmed is a term nobody can
                rely on. `hasGuarantees` has already established it is set. */}
            <p className="mt-6 text-meta text-bone-ink-faint">
              {t('aftercare.guaranteeReviewed', { date: GUARANTEES_REVIEWED! })}
            </p>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
