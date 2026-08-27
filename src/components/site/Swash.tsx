import { cn } from '@/lib/utils';

/**
 * The one line the practice already owns.
 *
 * The logo is drawn as a single continuous hairline: it traces a tooth, writes
 * the script `sh`, then leaves the lockup as a long shallow sweep that runs out
 * under "Shehu" and lifts at the end. That sweep is the most distinctive thing
 * in the mark and it appears nowhere in the software, because the software is a
 * grid of cards and a curve has no business in one.
 *
 * On the storefront it becomes the rule between sections — the same gesture,
 * drawn at page width, in place of the straight border a marketing page would
 * otherwise put there. It is used **twice on the whole page**: once where the
 * treatments end and the cream lifts, and once where the practice stops talking about
 * itself and starts telling you how to get there. Every other section boundary
 * is a plain hairline or nothing at all. A curve that turns up at every join
 * stops being a signature and becomes wallpaper, which is the failure this is
 * rationed against.
 *
 * Not traced from the PNG — the artwork ships as a flat bitmap and there is
 * nothing to extract. This is authored to match: one long sweep, one small
 * terminal lift, no second inflection.
 *
 * `preserveAspectRatio="none"` lets it span any width, and `non-scaling-stroke`
 * is what makes that safe: the curve stretches, the hairline does not, so it is
 * exactly as fine on a 1440px desktop as on a 360px phone. Without it the stroke
 * would fatten with the viewport and read as a swoosh.
 *
 * **It writes itself.** The stroke is dashed to its own length and the offset is
 * walked to zero across the section's entry into view, so the line is drawn
 * left-to-right at the speed the reader is scrolling — the mark's own gesture
 * performed rather than printed. It is scroll-*driven*, not scroll-*triggered*:
 * scroll back up and it un-draws, which is the difference between an animation
 * and a film of one.
 *
 * The dash only exists inside `@supports (animation-timeline: view())` — see
 * `.swash-draw` in globals. A browser that cannot animate it gets the finished
 * line rather than an invisible one, which is the same rule every other effect
 * on this page follows and the reason none of them can fail to nothing.
 *
 * `pathLength` is what makes one dash length correct at every width. Without it
 * the dasharray would be in user units on a path that is being stretched from
 * 360px to 1440px, and the same `1400` would over- or under-shoot the line at
 * every viewport. Declaring the path to be 1400 units long tells the browser to
 * scale the dash arithmetic to whatever the geometry actually measures.
 */
export function Swash({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 48"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      // `overflow-clip` rather than the `overflow: hidden` an `<svg>` root has by
      // default. `hidden` makes this element a scroll container, and the stroke
      // inside it is animated on a `view()` timeline — which then measures
      // against this box instead of against the page, freezing the draw halfway
      // and never advancing it. See the note on `.drift` in globals.css.
      className={cn('block h-8 w-full overflow-clip text-gilt sm:h-11', className)}
    >
      <path
        d="M2 30C180 8 420 6 640 18c180 10 370 12 510-4 26-3 42 0 46 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1400}
        className="swash-draw"
      />
    </svg>
  );
}
