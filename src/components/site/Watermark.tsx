import { cn } from '@/lib/utils';

/**
 * The practice's tooth, very large and very faint, behind a section.
 *
 * The oldest trick in stationery design and still the right one here: the mark
 * is a single continuous hairline, which means it survives being blown up to
 * thirty rem and reduced to five per cent opacity — there is nothing to go muddy
 * because there are no fills. A logo treated this way stops being a logo parked
 * in a corner and becomes the texture of the page.
 *
 * Drawn as an inline SVG rather than as the PNG the rest of the app uses,
 * because that is what lets it take `currentColor`: the same component sits in
 * bronze on the cream sections and in white on the navy, tinted by whatever the
 * caller passes, instead of needing a third colourway of the artwork on disk.
 * The path is the tooth from the lockup, traced to the same proportions.
 *
 * `aria-hidden` and `pointer-events-none` throughout — it is a texture, it must
 * never be announced, and it must never swallow a click meant for the content
 * sitting on top of it.
 */
export function Watermark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 240"
      aria-hidden
      focusable="false"
      className={cn('pointer-events-none absolute select-none', className)}
    >
      <path
        d="M100 26c-16-14-38-20-56-12C24 23 14 44 16 68c2 22 10 40 14 62 4 20 2 42 10 60 5 12 18 18 28 12 9-5 11-18 13-30 3-16 6-33 19-33s16 17 19 33c2 12 4 25 13 30 10 6 23 0 28-12 8-18 6-40 10-60 4-22 12-40 14-62 2-24-8-45-28-54-18-8-40-2-56 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
