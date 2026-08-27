import { getTranslations } from 'next-intl/server';
import { Flag } from '@/components/site/Flag';
import { Reveal } from '@/components/site/Reveal';
import { localeLabels, locales } from '@/i18n/routing';

/**
 * The three languages, given a section rather than a line in a table.
 *
 * On the front page this is one row of a definition list — "Languages · Shqip ·
 * Italiano · English" — and as a fact about a practice that is exactly the right
 * weight. On the practice's own page it is worth more than that, because for a
 * good share of the people reading it in Italian it is not a feature, it is the
 * reason they are reading at all: a treatment plan explained through a relative
 * on a video call is how a patient ends up agreeing to work they did not
 * understand.
 *
 * So each language gets a sentence about who actually speaks it here and what
 * that means in the chair. The flags are the drawn ones the language menu uses —
 * see `Flag` for why they are inline SVG rather than emoji, which is a Windows
 * story with a bad ending.
 *
 * The list is `locales`, so a fourth language added to the routing config gets a
 * card here rather than being missed. Its sentence would be missing, which
 * `tests/messages.test.ts` fails the build over — which is the right way round.
 */
export async function Languages() {
  const t = await getTranslations('site');

  return (
    <section className="bg-bone px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="type-section max-w-[20ch] text-bone-ink">
            {t('pages.practice.languages.title')}
          </h2>
          <p className="mt-5 max-w-[56ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('pages.practice.languages.lede')}
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-3 sm:gap-6">
          {locales.map((locale, index) => (
            <Reveal
              as="li"
              key={locale}
              step={index}
              className="card flex flex-col gap-4 p-6 transition-colors hover:border-gilt sm:p-7"
            >
              {/* A fixed height, and `self-start` because the card is a column
                  flexbox: a flex item's default `align-self: stretch` had the
                  flag's box running the full width of the card with the artwork
                  squeezed against the left edge of it. The height is set once
                  here because `Flag` sizes its artwork from the box — three
                  flags of different proportions would otherwise arrive at three
                  different sizes. */}
              <Flag locale={locale} className="h-8 self-start" />

              <div>
                {/* `lang` on the name itself, because the endonym is the one
                    word on this card that is not in the page's language — and a
                    screen reader reading "Shqip" with an English voice produces
                    something no Albanian speaker would recognise. */}
                <h3 lang={locale} className="font-display text-[1.5rem] text-bone-ink">
                  {localeLabels[locale]}
                </h3>
                <p className="mt-2.5 text-[1rem] leading-relaxed text-bone-ink-soft">
                  {t(`pages.practice.languages.${locale}`)}
                </p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
