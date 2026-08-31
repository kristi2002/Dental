import { IBM_Plex_Sans, Prata } from 'next/font/google';

/**
 * IBM Plex Sans — the humanist grotesque the whole product is drawn around.
 *
 * This was Poppins for most of the project's life, and the reasoning for that
 * was sound but load-bearing in the wrong place: the practice's wordmark sets
 * "Dental clinic" in a light geometric sans, so the interface took the same
 * shape and ran on it. The flaw is that the wordmark is a **baked image** —
 * `src/logo/*.jpeg`, emitted by `scripts/build-logo.mjs` and drawn by
 * `ClinicLogo` as a plain `<img>`. Nothing on any screen sets the practice's
 * name in a live typeface, so matching the logo's font bought nothing anybody
 * could see, and cost the two things below.
 *
 * **On the storefront it fought the serif.** Poppins is geometric: circular
 * bowls, near-closed apertures, an even monoline. Set under Prata — a
 * high-contrast transitional serif with bracketed, slightly slabbed feet — the
 * pairing reads as a display face borrowed onto a template rather than as one
 * voice. Bone, navy and bronze are an editorial palette, and they were being
 * spoken in the web's most-used geometric sans.
 *
 * **In the app it cost width.** Poppins' circular letterforms are wide, and
 * this software is a register of nine-column laboratory cases and dense
 * appointment rows. Plex is narrower at the same optical size, so the same
 * table fits more of itself before anything has to be cut.
 *
 * Plex earns the swap on its own terms rather than by not being Poppins: open
 * apertures and humanist proportions, which is what stays legible at `meta` and
 * `caption` in a table read at arm's length; a genuine text face rather than a
 * display one, so a paragraph on the practice page and a badge on a stock row
 * can be the same family without either looking borrowed; and true tabular
 * figures, which this codebase leans on in 170 places.
 *
 * Only the three weights the interface actually uses are fetched; nothing here
 * reaches for `font-medium` or the extremes.
 *
 * `latin-ext` is not optional: Albanian needs ë and ç, and without that subset
 * every "Përfunduar" and "Kyçu" falls back mid-word to a different typeface.
 *
 * The variable is named for the **role** rather than the family — `--font-body`
 * and not `--font-plex`. The last swap had to touch every file that named the
 * typeface out loud; the next one will not.
 */
export const bodyFont = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

/**
 * Prata — the serif the practice's own logo is set in, for the public page only.
 *
 * The mark is three things: a monoline tooth, a script `sh`, and "Shehu" set in
 * a high-contrast serif above "Dental clinic" in a light geometric sans. The
 * storefront needs the first half of that pairing back — a marketing page set
 * entirely in the interface's own workhorse sans reads as a screenshot of the
 * software, not as the practice's front door.
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
