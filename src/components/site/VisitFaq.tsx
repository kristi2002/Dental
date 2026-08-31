import { ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Watermark } from '@/components/site/Watermark';
import { hasVisitFaq, VISIT_FAQ_ANSWERED } from '@/lib/site-content';

/**
 * The questions people actually ask before walking in.
 *
 * ⚠️ **The first draft of this section was deleted, and why is worth keeping.**
 * It asked about languages, the written plan, the per-tooth record and
 * sterilisation — and every one of those four is already a card in `WhyUs`, two
 * hundred pixels up this same page. That is not a FAQ. That is the page asking
 * itself questions it has just finished answering, which is the exact complaint
 * `/visit` makes against `BrandStrip` in its own header and the reason that band
 * is not on this route.
 *
 * Take the four out and what is left is the genuinely unanswered set — can I
 * come without an appointment, what do I do if I am in pain today, how do I
 * pay, how long does a first appointment take, can I bring a child — and this
 * repository has never been told the answer to any of them. So the honest state
 * of a FAQ here is empty, and the honest thing to build is the slot.
 * `VISIT_FAQ_ANSWERED` is where it turns on, question by question.
 *
 * **`<details>` rather than an accordion component.** These are a heading and a
 * paragraph; the browser has had a disclosure widget for years that is keyboard
 * operable, announced correctly, searchable by the browser's own find, and open
 * on a printed page. A client component to reimplement it would ship JavaScript
 * to a public page to do worse. The same call `QuietenedAlerts` makes in the
 * clinic application.
 *
 * **Every answer here is also structured data, from the same array.** The page
 * feeds `VISIT_FAQ_ANSWERED` to `faqJsonLd` as well as to this section, so the
 * `FAQPage` markup and the visible text cannot drift into claiming different
 * things — which is the failure mode hand-written structured data always has.
 *
 * Navy, and it is the second dark band on the route. It sits between two cream
 * sections for the reason `OpeningHours` is dark: this page runs a long way in
 * cream, and the break has to fall where the page changes subject — here, from
 * how to reach the practice to what to expect of it.
 */
export async function VisitFaq() {
  const t = await getTranslations('site');

  // No questions answered, no section — the arrangement `Arrival` and the
  // `Aftercare` guarantee block both use.
  if (!hasVisitFaq()) return null;

  return (
    <section
      id="questions"
      // `seam` for the bronze wash at both edges every navy band on this site
      // carries; `clip` and never `hidden` for the reason given under `.drift`.
      className="seam relative scroll-mt-20 overflow-clip bg-navy px-5 py-band text-white sm:px-8"
    >
      <div className="relative mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-16">
        <Reveal>
          <SectionEyebrow className="text-gilt">{t('pages.visit.faq.eyebrow')}</SectionEyebrow>

          <h2 className="type-section mt-5 max-w-[15ch] text-white">
            {t('pages.visit.faq.title')}
          </h2>

          <p className="mt-5 max-w-[46ch] text-body leading-relaxed text-navy-ink">
            {t('pages.visit.faq.lede')}
          </p>
        </Reveal>

        <Reveal step={1} className="relative">
          {/* The tooth outline every navy panel on this site carries, at the
              same corner and the same weight. */}
          <Watermark className="-top-14 -right-10 w-[15rem] text-white/[0.04]" />

          <ul className="relative">
            {VISIT_FAQ_ANSWERED.map((key) => (
              <li key={key} className="border-b border-navy-line/60">
                <details className="group">
                  <summary
                    // `list-none` on both, because Safari draws its triangle
                    // through `::-webkit-details-marker` and Firefox through
                    // `list-style` — and the chevron below is the affordance.
                    className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-lead font-semibold text-white [&::-webkit-details-marker]:hidden"
                  >
                    {t(`pages.visit.faq.${key}.question`)}

                    <ChevronDown
                      size={19}
                      aria-hidden
                      className="shrink-0 text-gilt transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>

                  <p className="max-w-[62ch] pb-6 text-body leading-relaxed text-navy-ink-soft">
                    {t(`pages.visit.faq.${key}.answer`)}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
