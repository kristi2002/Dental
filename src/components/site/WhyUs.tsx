import { ArrowRight, ClipboardList, Languages, ShieldCheck, Star, Stethoscope } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { GhostWord } from '@/components/site/GhostWord';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Link } from '@/i18n/navigation';

/**
 * The practice's case for itself, on the page where somebody is deciding.
 *
 * The visit page was, until this section, entirely logistics: hours, a
 * telephone number, three ways into the city and a form. That is the right
 * content for a reader who has already chosen the practice and is working out
 * how to get to it — and it is nothing at all for the far commoner reader who
 * arrived from a search for a dentist in Vlorë and is comparing three of them.
 * A contact page that only tells somebody *where* assumes a decision that has
 * not been made yet.
 *
 * ⚠️ **Every claim here is one the practice already makes elsewhere on this
 * site, and that is a constraint rather than an accident.** The four cards are
 * the plan in writing, the three languages, the tooth-by-tooth record and the
 * sterilisation — which are `strip`, `practice.bodyTwo`, `how.record` and
 * `how.clean` respectively. Nothing new is promised on a page whose job is to
 * get somebody through the door, because a promise made only in the place it
 * converts is a promise nobody upstream has checked. When the practice wants to
 * claim something new, it belongs in the sections that argue for it and this
 * one restates it.
 *
 * **The rating is quoted from the existing key rather than retyped.** It is
 * Google's figure, it is shown with Google's name attached, and there is now
 * exactly one string in the message files carrying the number — so the day it
 * changes, it changes once. The same reasoning that keeps `aggregateRating` out
 * of the front page's structured data: a number worth quoting is worth quoting
 * honestly, in one place.
 *
 * **`BrandStrip` is deliberately not on this page any more.** It is the same six
 * phrases as a marquee, and a page that states its case in four cards and then
 * slides the same case past in a band is a page arguing with itself.
 */

/** The four, in the order they answer a stranger's questions. */
const POINTS = [
  { key: 'plan', icon: ClipboardList },
  { key: 'languages', icon: Languages },
  { key: 'record', icon: Stethoscope },
  { key: 'clean', icon: ShieldCheck },
] as const;

export async function WhyUs() {
  const t = await getTranslations('site');

  return (
    <section
      // `clip` and never `hidden`, as everywhere on this storefront: see the
      // note under `.drift`. Nothing inside is on a scroll timeline today and
      // the next thing put here must not have to discover why that matters.
      className="relative overflow-clip px-5 py-20 sm:px-8 sm:py-24"
    >
      {/* Latin, untranslated, one per section. Hung off the right edge, clear of
          the heading that sits on the left. */}
      <GhostWord className="-right-[5vw] top-8 text-navy/[0.045]">Cura</GhostWord>

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">
            {t('pages.visit.clinic.eyebrow')}
          </SectionEyebrow>
          <h2 className="type-section mt-5 max-w-[18ch] text-bone-ink">
            {t('pages.visit.clinic.title')}
          </h2>
          <p className="mt-5 max-w-[58ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('pages.visit.clinic.lede')}
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

              <h3 className="mt-5 text-[1.14rem] font-bold text-bone-ink">
                {t(`pages.visit.clinic.${point.key}.title`)}
              </h3>
              <p className="mt-2.5 text-[1rem] leading-relaxed text-bone-ink-soft">
                {t(`pages.visit.clinic.${point.key}.body`)}
              </p>
            </Reveal>
          ))}
        </ul>

        {/*
         * The rating and the way in, on one rule under the four cards.
         *
         * They are together rather than in two places because they are the same
         * move: somebody who has just read four reasons is either convinced or
         * not, and what they want next is either other people's opinion or the
         * button. Splitting them puts a section break between a claim and its
         * evidence.
         */}
        <Reveal
          step={2}
          className="mt-11 flex flex-wrap items-center justify-between gap-x-8 gap-y-6 border-t border-bone-deep pt-8"
        >
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[1rem] text-bone-ink-soft">
            {/* Decoration, and marked as such: the sentence beside it already
                says "4.9 out of 5" in words, so five drawn stars announced one
                by one would be five repetitions of a thing already read. */}
            <span aria-hidden className="flex gap-0.5 text-gilt">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} size={16} fill="currentColor" strokeWidth={0} />
              ))}
            </span>
            {t('practice.facts.ratingValue')}
          </p>

          <Link
            href="/book"
            // The storefront's one call to action, in the class that owns its
            // hover outright rather than in three utilities fighting over it.
            // See `.cta-fill` in globals.css.
            className="cta-fill group inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-7 text-[1rem] font-bold text-navy no-underline hover:text-bone focus-visible:text-bone"
          >
            {t('nav.book')}
            <ArrowRight
              size={17}
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
