/**
 * Cut the storefront's above-the-fold photographs down to the sizes a phone
 * actually needs.
 *
 * The hero is three WebPs crossfading behind the headline, and the first of them
 * is what the browser measures Largest Contentful Paint against. They are stored
 * at the size a 1440px desktop panel wants — 1244px and 1400px wide — and until
 * this script existed a 390px phone downloaded exactly the same bytes and threw
 * four fifths of the pixels away. That is the single largest avoidable cost on
 * the page: 263KB of hero against 940KB for every image the site owns.
 *
 * **Run by hand, not by the build.** Two reasons, and both matter. `sharp` is
 * here transitively — Next pulls it in for its own image optimizer, which this
 * app does not use — so making the build depend on it would be building on a
 * package nothing declares. And the inputs change roughly never: the day the
 * practice replaces a stock photograph with its own. Generated files are
 * committed alongside their originals for the same reason the originals are, so
 * a deploy is a checkout and not a pipeline.
 *
 *     node scripts/resize-site-photos.mjs
 *
 * It is idempotent — an existing variant that is already newer than its source
 * is left alone — so running it after swapping one photograph regenerates that
 * one and nothing else.
 *
 * **Only the hero reel.** Everything below the fold is lazily loaded and already
 * under 37KB; a `srcset` there would trade real repository weight for bytes no
 * visitor waits on. `PHOTOS.<key>.variants` in `src/components/site/photos.ts`
 * is the list this script keeps in step, and a photograph with no `variants`
 * renders as a plain `<img>` exactly as it did before.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * The files that get variants, and the widths they get.
 *
 * 640 covers every phone at 2× (a 390px viewport asking for 100vw wants 780
 * device pixels, and 640 upscaled by 1.2 in a photograph nobody is inspecting is
 * invisible); 1024 covers tablets and the narrower half of the desktop panel.
 * Above that the original is already the right answer, so there is no third
 * variant — a `srcset` whose largest candidate is a downscale of the file you
 * would otherwise have served is pure overhead.
 *
 * Keep this in step with `variants` in `photos.ts`. The check at the foot of
 * this file fails loudly rather than letting the two drift.
 */
const TARGETS = [
  { file: 'surgery.webp', widths: [640, 1024] },
  { file: 'hero-smile.webp', widths: [640, 1024] },
  { file: 'vlore-bay.webp', widths: [640, 1024] },
];

/**
 * Matches `surgery-640.webp` — the shape of a name this script writes.
 *
 * **A match is not permission to delete anything.** The first version of this
 * script swept the directory with exactly this pattern and removed every file it
 * matched, which took `s-1.webp` through `s-6.webp` — the six squares of the
 * social grid, whose perfectly ordinary names happen to end in a hyphen and a
 * digit — with it. They were recoverable from a previous build's copy of
 * `public/`; had they not been, a maintenance script for three hero photographs
 * would have destroyed six unrelated assets that no commit had yet captured.
 *
 * So the sweep below only ever *reports*. A directory of hand-curated artwork is
 * not somewhere a pattern match gets to remove files, however tight the pattern
 * is made afterwards — the guard that matters is that nothing here deletes.
 */
const VARIANT = /^(.+)-(\d+)\.webp$/;

const DIR = path.join('public', 'site');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('[photos] sharp is not installed.');
  console.error('[photos] it normally arrives with next; try `npm install` first.');
  process.exit(1);
}

/** `surgery.webp` + 640 → `public/site/surgery-640.webp`. */
function variantPath(file, width) {
  return path.join(DIR, `${path.basename(file, '.webp')}-${width}.webp`);
}

let written = 0;
let skipped = 0;
const expected = new Set();

for (const { file, widths } of TARGETS) {
  const from = path.join(DIR, file);

  const source = await stat(from).catch(() => null);
  if (!source) {
    console.error(`[photos] ${from} is missing — is TARGETS out of date?`);
    process.exitCode = 1;
    continue;
  }

  const { width: sourceWidth } = await sharp(from).metadata();

  for (const width of widths) {
    const to = variantPath(file, width);
    expected.add(path.basename(to));

    // Never upscale. A variant wider than its source is bytes spent inventing
    // detail, and it would also make the `srcset` lie about what it is offering.
    if (width >= sourceWidth) {
      console.warn(`[photos] skipping ${path.basename(to)}: source is only ${sourceWidth}px wide`);
      continue;
    }

    // Regenerate only what is stale. `mtime` rather than a hash: the inputs are
    // replaced wholesale by a person dropping a file in, never edited in place.
    const existing = await stat(to).catch(() => null);
    if (existing && existing.mtimeMs >= source.mtimeMs) {
      skipped += 1;
      continue;
    }

    // `effort: 6` is slow and this runs three times a year. Quality 78 is where
    // the bay stops showing banding in its sky, which is the hardest of the
    // three — a flat gradient across 640px is what WebP is worst at.
    const info = await sharp(from)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78, effort: 6 })
      .toFile(to);

    console.log(`[photos] ${path.basename(to)} — ${(info.size / 1024).toFixed(0)}KB`);
    written += 1;
  }
}

/**
 * Name the variants whose source has left `TARGETS`, so they can be removed by
 * somebody who can see what they are removing.
 *
 * Dropping a photograph from the reel otherwise leaves its resized copies in
 * `public/` forever — served to nobody and impossible to tell apart from a file
 * something still references. Reporting is the whole of the job here; see the
 * note on `VARIANT` for why this does not do the removing itself.
 *
 * Two conditions before a file is even mentioned. It has to look like a variant,
 * *and* the name left after stripping the width has to be a photograph actually
 * sitting in this directory — which is what keeps `s-1.webp` out of the list,
 * there being no `s.webp` for it to be a variant of.
 */
const present = new Set(await readdir(DIR));
const orphans = [...present].filter((name) => {
  if (expected.has(name)) return false;
  const match = VARIANT.exec(name);
  return match !== null && present.has(`${match[1]}.webp`);
});

if (orphans.length > 0) {
  console.log(`[photos] ${orphans.length} variant(s) no longer in TARGETS:`);
  for (const name of orphans) console.log(`[photos]   ${path.join(DIR, name)}`);
  console.log('[photos] check them, then delete by hand. This script will not.');
}

console.log(`[photos] ${written} written, ${skipped} already current.`);
