import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Three flags, served as files from this origin.
 *
 * **Not emoji.** 🇦🇱 is the obvious implementation and it is broken on the one
 * platform this practice's own staff work on: Windows ships no glyphs for
 * regional-indicator pairs, so Chrome and Edge on Windows render `🇦🇱 🇬🇧 🇮🇹`
 * as the bare letters "AL GB IT". It looks correct on a Mac and on a phone,
 * which is exactly why it survives review; it was checked here, in Chrome on
 * the machine this was built on, and it is those letters.
 *
 * **Not a CDN either**, but not for the reason it first appears. The app's
 * `Content-Security-Policy` sets `img-src 'self' data: blob:` — that forbids
 * hotlinking somebody else's flag CDN, and says nothing at all about a file in
 * `public/`. Those two are worth keeping apart, because conflating them is how
 * this component spent a while hand-drawing artwork it could simply have
 * shipped.
 *
 * **Not inline SVG.** The Albanian eagle is six kilobytes of path data. Inline,
 * that is six kilobytes in the HTML of every page that renders it, times the
 * number of times it renders — `LocaleMenu` alone draws a flag on its button
 * and another in each row of its list — and none of it is ever cached. As a
 * file it is fetched once, cached, and shared by every use on every page. It
 * also gets its own id scope, which is what lets the eagle be stored once and
 * mirrored with `<use href="#h">`; inline, that id would collide with the copy
 * next to it. Inline SVG is the right answer for an icon and the wrong one for
 * a piece of artwork this size.
 *
 * The artwork is the official public-domain construction of each flag, from
 * Wikimedia Commons, normalised to one ratio (see `RATIO`) and stored under
 * `public/flags/`. Two deliberate departures, both recorded in the files:
 *
 * - The Albanian red is `#e41e20`, not the `#f00` the source ships. Pure sRGB
 *   red is a simplification of the flag's actual specified red, and it glares
 *   next to this site's bone-and-gilt palette.
 * - The Italian white is `#f1f2f1`, not `#fff`, for the same reason the ring
 *   below exists: a pure-white band dissolves into a pale page.
 *
 * Every one is `aria-hidden` with an empty `alt`: the language's own name is
 * written beside it in `LocaleMenu`, and a screen reader announcing "flag of
 * Albania, Shqip" is saying the same thing twice.
 */

/**
 * The ratio every flag is normalised to. 3:2, the commonest, and the one that
 * costs least here: Italy is natively 3:2, and Albania's official 7:5 is
 * reached by widening the red field rather than by touching the eagle. Only the
 * Union Flag is really stretched, from its official 1:2 — which is what every
 * fixed-box flag icon set does, and is invisible at the sizes below.
 *
 * Normalising at all is a choice, and it is the caller's needs that force it:
 * `LocaleMenu` puts a flag beside a word in a list, and three true ratios there
 * means three different widths and three places the words start.
 */
const RATIO = { width: 30, height: 20 };

/**
 * Locale to file. An explicit map rather than a template literal in the `src`,
 * so that a fourth language added to the routing config is a type error here
 * rather than a broken image on the public site. `tests/flags.test.ts` covers
 * the other half of that — a name in this map with no file behind it.
 */
const FLAGS: Record<Locale, string> = {
  sq: '/flags/sq.svg',
  en: '/flags/en.svg',
  it: '/flags/it.svg',
};

/**
 * The flag for a locale, sized by its container's height.
 *
 * A flag is a rectangle with hard edges and it looks like a sticker unless it
 * is given the same rounding as everything else on the page, so the clipping
 * lives here rather than being remembered at each use site. `ring-inset` is
 * what stops the white band of the Italian flag dissolving into a light
 * background — a 1px hairline of the page's own ink, drawn inside the box.
 *
 * `width` and `height` are the ratio rather than the rendered size: they are
 * there so the box holds its shape before the file arrives, and the height that
 * actually applies comes from `className`. `max-w-none` because a `max-width:
 * 100%` image reset would otherwise fight `w-auto` inside a narrow flex row.
 */
export function Flag({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 overflow-hidden rounded-[3px] ring-1 ring-current/25 ring-inset',
        className,
      )}
    >
      {/* Fixed assets the app ships with, and vector ones: the optimizer has no
          raster to resize and would need `dangerouslyAllowSVG` turned on
          app-wide to pass them through at all — a global loosening bought for
          three flags. Same call, and the same reasoning, as `ClinicLogo`. */}
      {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
      <img
        src={FLAGS[locale]}
        alt=""
        aria-hidden
        width={RATIO.width}
        height={RATIO.height}
        decoding="async"
        className="block h-full w-auto max-w-none"
      />
    </span>
  );
}
