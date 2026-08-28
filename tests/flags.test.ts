import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { locales } from '../src/i18n/routing';

/**
 * The way a flag goes wrong quietly.
 *
 * `Flag` maps a locale to a file under `public/`. TypeScript covers one half of
 * that — the map is a `Record<Locale, string>`, so a fourth language added to
 * the routing config fails the build until somebody gives it a flag. It cannot
 * cover the other half: a path in that map with no file behind it is a perfectly
 * good string, and the first anyone hears of it is a broken image on the
 * practice's public site, in the language most of its patients read.
 *
 * So: every locale has a file, every file is really an SVG, and every file is
 * the ratio `Flag` normalises to. That last one is not pedantry — the component
 * sizes from height and lets width follow, so a flag that is secretly 1:2 does
 * not look wrong on its own, it silently pushes the word next to it out of line
 * with the two above it in `LocaleMenu`.
 */

const FLAGS = path.join(process.cwd(), 'public', 'flags');

/** What `RATIO` in `Flag.tsx` promises. Kept as a number so 750x500 passes too. */
const EXPECTED_RATIO = 30 / 20;

async function flag(locale: string) {
  return readFile(path.join(FLAGS, `${locale}.svg`), 'utf8');
}

describe('flags', () => {
  for (const locale of locales) {
    it(`${locale} has a flag file that is an svg`, async () => {
      const svg = await flag(locale);
      assert.match(svg, /<svg[^>]*>/, `${locale}.svg does not contain an <svg> root`);
      assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${locale}.svg has no namespace`);
    });

    it(`${locale} is drawn at the ratio Flag normalises to`, async () => {
      const svg = await flag(locale);
      const width = Number(/<svg[^>]*\bwidth="([\d.]+)"/.exec(svg)?.[1]);
      const height = Number(/<svg[^>]*\bheight="([\d.]+)"/.exec(svg)?.[1]);

      assert.ok(
        Number.isFinite(width) && Number.isFinite(height) && height > 0,
        `${locale}.svg needs a numeric width and height on its root, for the box to hold its shape before the file loads`,
      );
      assert.equal(
        (width / height).toFixed(3),
        EXPECTED_RATIO.toFixed(3),
        `${locale}.svg is ${width}x${height}; Flag sizes from height, so anything but 3:2 comes out a different width`,
      );
    });

    it(`${locale} carries nothing that should not be in an image`, async () => {
      const svg = await flag(locale);
      // Loaded through <img>, so a browser will not run any of this — but a
      // flag file is also the kind of thing that later gets inlined or opened
      // directly, and none of it belongs in artwork either way.
      assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+=|javascript:/i);
      // Nothing fetched from off this origin: `img-src 'self'` would block it,
      // and it would be a third party watching the practice's visitors.
      assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org)/i);
    });
  }
});
