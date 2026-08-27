/**
 * The Instagram mark, drawn here because the icon set no longer carries it.
 *
 * `lucide-react` ships 6,068 icons and not one brand: they were removed from
 * Lucide deliberately, since a trademark is not something an icon library can
 * license onward. The alternative — reaching for `Camera` or `AtSign` — makes
 * the one link on this page that everybody recognises at a glance into one
 * nobody recognises at all.
 *
 * So it is drawn: the rounded square, the lens, the flash. Meta's own brand
 * guidelines permit the glyph for linking to an account you hold, which is the
 * only thing it is used for here. It is stroked rather than filled, at
 * `currentColor` and `1.75` weight, so it sits in a row beside the Lucide icons
 * used everywhere else in this app without looking like it was pasted in.
 */
export function InstagramGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
