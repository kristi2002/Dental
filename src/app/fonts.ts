import { Poppins } from 'next/font/google';

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
