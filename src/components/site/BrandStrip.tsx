import { getTranslations } from 'next-intl/server';
import { ClinicMark } from '@/components/brand/ClinicLogo';

/**
 * The practice's own words, sliding past, ruled off from the page above and
 * below it.
 *
 * It does two jobs. The obvious one is that a page with a moving band in it
 * reads as alive rather than as a printed brochure. The less obvious one is that
 * it puts the practice's mark back in front of the reader six more times without
 * a single one of them being a logo parked in a corner.
 *
 * **It used to be navy, and that is what was wrong with it.** The header of this
 * file called it "the page's one band of deep navy", which had stopped being
 * true some time ago — `HowWeWork` is navy and sits two sections earlier, and
 * the hero is a film loop rather than the still this was once the antidote to.
 * What was left was ninety-eight pixels of dark stripe dropped between two cream
 * sections: too short to read as a section of its own, and exactly tall enough
 * to cut the middle of the page in half. It was the single most divisive thing
 * in the document, in the literal sense.
 *
 * On cream it is a rule with words travelling along it — which is what a strip
 * of six phrases actually is — and the run from the practice through the gallery
 * to the comparison is now one continuous sheet. The motion, which was the point
 * of it, is untouched.
 *
 * The two hairlines are what keep it from dissolving into the sections it now
 * shares a ground with. `bone-deep` is the palette's decorative rule and carries
 * nothing readable; the words themselves are `bone-ink` at 12.7:1.
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
    <div aria-hidden className="border-y border-bone-deep py-5 sm:py-6">
      {/* One transform, one constant lap, and nothing reading the scroll
          position. A wrapper used to sit here adding a second translation driven
          by the band's pass across the viewport; it made the words reverse when
          the page was scrolled up and stutter on every overscroll bounce. See
          `.marquee` in `globals.css`. */}
      <div className="marquee">
        <div className="marquee-track">
          {run.map((phrase, index) => (
            <span
              // The list is fixed and repeats by design, so the index *is* the
              // identity here — there is nothing else to key on and nothing
              // reorders.
              key={`${phrase}-${index}`}
              className="flex shrink-0 items-center gap-6 pr-6 sm:gap-9 sm:pr-9"
            >
              <span className="font-display text-[1.35rem] whitespace-nowrap text-bone-ink sm:text-[1.7rem]">
                {phrase}
              </span>
              {/* The mark as the separator rather than a bullet — the one place
                  on the page the tooth appears at small size and often.
                  `ink` rather than `inverse` now the band is cream; at 40% it
                  is a soft grey tooth rather than a row of black stamps. */}
              <ClinicMark variant="ink" alt="" className="h-5 w-auto opacity-40 sm:h-6" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
