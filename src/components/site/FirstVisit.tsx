import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/site/Reveal';
import { Watermark } from '@/components/site/Watermark';

/**
 * What actually happens the first time somebody sits in the chair.
 *
 * This is the section a dental practice's website nearly always leaves out, and
 * it is the one the nervous half of its readers came for. The rest of the site
 * answers *what we do* and *what it costs in time*; nobody had answered **what
 * is going to happen to me in the next hour**, which is the question that
 * actually decides whether a person who has not been to a dentist in six years
 * rings or closes the tab.
 *
 * Five steps, and the last one is the point of the other four: nothing starts
 * until the patient says so. That is the practice's own stated rule — it is
 * written on the front page as "nobody leaves without knowing what is going to
 * be done, how many visits it takes and what it costs" — and this is that
 * sentence taken apart into the order it happens in.
 *
 * **The line draws itself as you read.** A bronze hairline runs down the left of
 * the list and is walked from nothing to its full height across the section's
 * pass through the viewport, and each numbered node warms from cream to bronze
 * as it arrives. Both are scroll-*driven* rather than scroll-*triggered*: scroll
 * back up and the line un-draws, which is the difference between a mechanism and
 * a film of one. There is no JavaScript in either, and a browser without
 * scroll-driven animations draws the finished line and the finished nodes —
 * every effect on this site fails to the completed state rather than to an
 * invisible one. See `.thread` in globals.css.
 *
 * **An ordered list, because it is one.** The numbers are in the markup as
 * numbers rather than drawn in a pseudo-element, so a screen reader announces
 * "list of 5 items" and reads them in order, which is the whole content of the
 * section.
 */

/** The five, in the order they happen. Wording lives in `messages`. */
const STEPS = ['listen', 'examine', 'record', 'plan', 'decide'] as const;

export async function FirstVisit() {
  const t = await getTranslations('site');

  return (
    <section
      id="first-visit"
      // `clip` and never `hidden`: the line and every node inside are on
      // `view()` timelines, and `hidden` would make this section their scroll
      // container and freeze all six. See the note on `.drift` in globals.css.
      className="relative scroll-mt-20 overflow-clip bg-bone px-5 py-20 sm:px-8 sm:py-24"
    >
      <Watermark className="-top-24 -left-28 w-[30rem] text-gilt/[0.05]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="type-section max-w-[18ch] text-bone-ink">
            {t('pages.practice.first.title')}
          </h2>
          <p className="mt-5 max-w-[54ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('pages.practice.first.lede')}
          </p>
        </Reveal>

        {/* A wrapper rather than the list itself, because the drawn line has to
            be a sibling of the steps and an `<ol>` may only contain `<li>`. The
            positioning context is this box: the grey track is its `::before` and
            the bronze is the span below, both hung off the same corner. */}
        <div className="thread mt-14 max-w-[52rem]">
          {/* A real element rather than a second pseudo-element: a pseudo's own
              `view()` timeline resolves against its originating box, and this
              one needs the whole list's. */}
          <span aria-hidden className="thread-draw" />

          <ol>
            {STEPS.map((step, index) => (
              <li key={step} className="thread-step">
                <span aria-hidden className="thread-node">
                  {index + 1}
                </span>

                <div className="min-w-0 pb-10">
                  <h3 className="text-[1.16rem] font-bold text-bone-ink">
                    {t(`pages.practice.first.steps.${step}.title`)}
                  </h3>
                  <p className="mt-2.5 max-w-[52ch] text-[1.01rem] leading-relaxed text-bone-ink-soft">
                    {t(`pages.practice.first.steps.${step}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
