import { Poppins, Prata } from 'next/font/google';

/**
 * Poppins — the rounded geometric sans the interface is drawn around.
 *
 * Only the three weights the app actually uses are fetched (regular, semibold,
 * bold); nothing here reaches for `font-medium` or the extremes.
 *
 * `latin-ext` is not optional: Albanian needs ë and ç, and without that subset
 * every "Përfunduar" and "Kyçu" falls back mid-word to a different typeface.
 */
export const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

/**
 * Prata — the serif the practice's own logo is set in, for the public page only.
 *
 * The mark is three things: a monoline tooth, a script `sh`, and "Shehu" set in
 * a high-contrast serif above "Dental clinic" in a light geometric sans. The app
 * took the second half of that pairing and has run on Poppins ever since. The
 * storefront needs the first half back — a marketing page set entirely in the
 * interface's own workhorse sans reads as a screenshot of the software, not as
 * the practice's front door.
 *
 * Prata rather than the obvious Playfair: its serifs are bracketed and slightly
 * slabbed rather than hairline-flat, which is what the wordmark's own letters
 * do, and it carries the same calm width. One weight exists, which is a feature
 * here — hierarchy on that page comes from size and colour, and a display face
 * with no bold is a display face nobody can shout in.
 *
 * `latin` alone is enough, and not by luck: ë and ç are U+00EB and U+00E7, which
 * sit inside Latin-1 and therefore inside Google's `latin` subset. Prata ships
 * no `latin-ext` at all, so asking for one would fail the build rather than
 * quietly do nothing.
 *
 * Loaded in `(site)/layout.tsx` and nowhere else — no signed-in screen pays for
 * a font it never sets a word in.
 */
export const prata = Prata({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-prata',
});
