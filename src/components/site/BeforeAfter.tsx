import { getTranslations } from 'next-intl/server';
import { Compare } from '@/components/site/Compare';
import { TREATMENT_PHOTOS } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';

/**
 * Drag across the picture and watch the shade change.
 *
 * ⚠️ **This is a simulation and the page says so, twice.** Both halves are the
 * *same photograph*; the left one is tinted by a CSS filter. Nobody in it is a
 * patient of this practice, nothing here is an outcome, and the caption under
 * the slider states that in every language rather than in a footnote.
 *
 * That is a deliberate second-best. The honest version of this section is a
 * consented pair of real photographs of one person, and the practice does not
 * have one yet — every image in `public/site/` is free-licence stock, as
 * `photos.ts` says at the top. Two *different* stock faces labelled before and
 * after would have been a fabricated clinical record, which is the one thing
 * `Compare` must never be used to build: the whole rhetorical force of a
 * before-and-after is that it happened to somebody here.
 *
 * Dental before-and-after advertising is also regulated across the EU and the
 * UK — the three markets this page is translated for — and the rules generally
 * require documented consent, comparable lighting and conditions, and no
 * retouching. Those are the practice's obligations rather than this component's,
 * and they are the reason to replace this the day real cases exist.
 *
 * **To replace it**: put the consented pair in `public/site/`, add both to
 * `photos.ts` with `source: null`, drop `simulated`, and write the alt text and
 * caption for the real case. Nothing else here changes.
 */
export async function BeforeAfter() {
  const t = await getTranslations('site');
  const photo = TREATMENT_PHOTOS.whitening;

  return (
    <section id="compare" className="scroll-mt-20 bg-bone px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-16">
        <Reveal>
          <h2 className="type-section max-w-[16ch] text-bone-ink">{t('compare.title')}</h2>
          <p className="mt-5 max-w-[46ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('compare.lede')}
          </p>
        </Reveal>

        <Reveal step={1}>
          <Compare
            before={photo}
            after={photo}
            simulated
            // Both describe the same photograph, because it *is* the same
            // photograph — the alt text is not the place to imply two.
            beforeAlt={t('compare.simulatedAlt')}
            afterAlt={t('compare.simulatedAlt')}
            caption={t('compare.simulatedCaption')}
          />
        </Reveal>
      </div>
    </section>
  );
}
