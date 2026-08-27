import { getTranslations } from 'next-intl/server';
import { ClinicMark } from '@/components/brand/ClinicLogo';

/**
 * The practice's own words, sliding past, on the page's one band of deep navy.
 *
 * It does two jobs. The obvious one is that a page with a moving band in it
 * reads as alive rather than as a printed brochure — this is the first thing on
 * the page that moves on its own, and it lands right where the hero's stillness
 * would otherwise become a lull. The less obvious one is that it puts the
 * practice's mark back in front of the reader six more times without a single
 * one of them being a logo parked in a corner.
 *
 * The list is short and repeats twice in the DOM, which is what makes the loop
 * seamless — see `.marquee` in `globals.css` for why, and for why nothing here
 * needs JavaScript.
 *
 * **`aria-hidden`, deliberately.** Every word in it appears properly a screen
 * further down, in the treatments grid, with a description attached; and the
 * markup holds each phrase twice. A screen reader that read this would announce
 * twelve fragments with no context before reaching the first real heading.
 * Hiding a duplicate is not hiding content.
 */
export async function BrandStrip() {
  const t = await getTranslations('site');

  const phrases = [
    t('strip.one'),
    t('strip.two'),
    t('strip.three'),
    t('strip.four'),
    t('strip.five'),
    t('strip.six'),
  ];

  // Twice, because the animation travels exactly −50% and the second copy has to
  // be standing where the first started at the moment it resets.
  const run = [...phrases, ...phrases];

  return (
    <div aria-hidden className="border-y border-navy-line bg-navy py-5 sm:py-6">
      <div className="marquee">
        {/* The scroll push, under the loop. The track keeps its own constant
            thirty-eight second lap; this wrapper adds a slower translation
            driven by the band's pass across the viewport, so the words speed up
            while you scroll and hand themselves back to their own pace when you
            stop. Two nested transforms, both on the compositor. See
            `.marquee-drag`. */}
        <div className="marquee-drag">
          <div className="marquee-track">
            {run.map((phrase, index) => (
              <span
                // The list is fixed and repeats by design, so the index *is* the
                // identity here — there is nothing else to key on and nothing
                // reorders.
                key={`${phrase}-${index}`}
                className="flex shrink-0 items-center gap-6 pr-6 sm:gap-9 sm:pr-9"
              >
                <span className="font-display text-[1.35rem] whitespace-nowrap text-navy-ink sm:text-[1.7rem]">
                  {phrase}
                </span>
                {/* The mark as the separator rather than a bullet — the one place
                    on the page the tooth appears at small size and often. */}
                <ClinicMark variant="inverse" alt="" className="h-5 w-auto opacity-45 sm:h-6" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
