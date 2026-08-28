/**
 * Repair the white fringe the tooth cut-outs came off the poster with.
 *
 * The sixteen files in `public/teeth/` were cut from one Freepik render — the
 * provenance is in `src/components/dental/ToothPhoto.tsx` — and the cut left
 * three things behind. At 1:1 on white none of them shows. On `DentalArch`'s
 * navy, at the ~80px each tooth actually gets, all three read as the same
 * defect: a dusting of white specks along every border.
 *
 *  1. **Every transparent pixel still carries near-white RGB.** Alpha says the
 *     pixel is not there; a resampling filter reads the colour underneath it
 *     anyway. The arch draws a 206px file at a third of that, so the browser
 *     averages poster-white into the visible edge on every downscale.
 *  2. **The outermost rim of the silhouette is itself white**, at 1–30% alpha —
 *     background the cut did not quite let go of, sitting one pixel proud of the
 *     tooth.
 *  3. **The alpha channel is lossy.** These were saved as lossy WebP and the
 *     `ALPH` chunk was compressed along with the colour: a column that should
 *     run 0, 128, 255 runs 0, 3, 189, 251 on one row and 0, 24, 145, 250 on the
 *     next. That per-pixel jitter is what turns a soft edge into speckle.
 *
 * So the edge is re-drawn from the silhouette rather than patched, and the
 * colour of every pixel outside the tooth is replaced with the colour of the
 * nearest pixel inside it. After that there is no white left anywhere for a
 * filter to find, and the alpha ramp is smooth. The silhouette itself does not
 * move — the mask is thresholded at half alpha, which is where the edge already
 * was; measured across the sixteen files, fewer than 35 pixels of some 40,000
 * change sides in the worst case.
 *
 * **Run by hand, not by the build**, for the reasons `resize-site-photos.mjs`
 * gives: `sharp` is here transitively via Next's image optimizer, which this app
 * does not use, and the inputs change roughly never.
 *
 *     node scripts/clean-tooth-cutouts.mjs
 *
 * **It rewrites the files in place, and it is a repair rather than a pipeline.**
 * Running it twice is harmless — the second pass thresholds an edge it drew
 * itself and redraws the same one — but nothing depends on it having run. Its
 * output is what is committed. The day the practice replaces this artwork with
 * its own, run it once over the new cut and check the result on navy rather than
 * on white.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const TEETH = path.join(import.meta.dirname, '..', 'public', 'teeth');

/**
 * The four numbers the repair is made of.
 *
 * `SOLID` is what counts as tooth for the purpose of *sampling colour* — a pixel
 * the cut and the compressor both agree is opaque. `CUT` is what counts as tooth
 * for the purpose of *shape*, and it is half alpha because that is the
 * definition of where an anti-aliased edge is; picking anything else moves the
 * silhouette in or out by a pixel.
 *
 * `SIGMA` and `EDGE` are one pair: the blur averages the compressor's jitter
 * away and the contrast puts back the ~1px ramp a cut edge should have. Drop
 * `EDGE` and the tooth gets a halo; raise it past about 3 and the edge goes back
 * to a hard staircase, which on a curve this shallow is worse than the speckle.
 */
const SOLID = 250;
const CUT = 128;
const SIGMA = 1;
const EDGE = 2.6;

/**
 * Quality, and why it is not lossless.
 *
 * Lossless triples these files — 9KB to 23KB apiece, sixteen of them, on a band
 * that is decoration. At 92 the re-encode moves the interior by half a level out
 * of 255 and the files come out a third *smaller* than the originals, because
 * most of what was being spent was on encoding the noise this removes.
 *
 * `alphaQuality: 100` is the one that must not be traded, and is the whole
 * lesson of the fringe: the alpha channel here is a shape, not a picture, and
 * compressing a shape is what produced the speckle in the first place.
 */
const WEBP = { quality: 92, alphaQuality: 100, effort: 6 };

/**
 * A clean anti-aliased alpha channel, from a noisy one.
 *
 * Threshold to the bare silhouette, blur, then put the contrast back. The blur
 * happens in `sharp` rather than by hand because a separable Gaussian worth
 * writing out is exactly what `sharp` already is.
 */
async function redrawEdge(pixels, width, height) {
  const mask = Buffer.alloc(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] >= CUT ? 255 : 0;

  // `toColourspace` is not optional: given one raw channel `sharp` decides it
  // has been handed greyscale and hands back three, and the buffer that comes
  // out is then read at a third of the stride it was written at — which looks
  // like a sheared, striped tooth rather than like an error.
  const soft = await sharp(mask, { raw: { width, height, channels: 1 } })
    .blur(SIGMA)
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  const alpha = Buffer.alloc(mask.length);
  for (let i = 0; i < alpha.length; i++) {
    const level = ((soft[i] / 255 - 0.5) * EDGE + 0.5) * 255;
    alpha[i] = Math.max(0, Math.min(255, Math.round(level)));
  }
  return alpha;
}

/**
 * Give every pixel the colour of the nearest solid one.
 *
 * A two-pass chamfer sweep — the standard eight-point sequential distance
 * transform. Each pixel carries the offset to the nearest seed it has heard
 * about; a forward scan propagates that from the four neighbours already
 * visited, a backward scan from the four that were not. Two passes is exact
 * everywhere the eye could tell, and it is linear in the pixel count where
 * growing the region one ring at a time is quadratic in its radius.
 *
 * Seeds are the pixels the *original* alpha called solid, not the ones the
 * re-drawn edge covers: the mask is the shape, but the file's own opacity is the
 * evidence about which pixels were ever really tooth rather than poster.
 */
function bleedColour(pixels, width, height) {
  const FAR = Number.MAX_SAFE_INTEGER;
  // The offset from each pixel to the nearest seed it knows of, and that
  // offset's squared length — squared because nothing here needs the root.
  const dx = new Int32Array(width * height);
  const dy = new Int32Array(width * height);
  const d2 = new Float64Array(width * height);

  for (let i = 0; i < width * height; i++) d2[i] = pixels[i * 4 + 3] >= SOLID ? 0 : FAR;

  const relax = (here, from, stepX, stepY) => {
    if (d2[from] === FAR) return;
    const offsetX = dx[from] + stepX;
    const offsetY = dy[from] + stepY;
    const reach = offsetX * offsetX + offsetY * offsetY;
    if (reach < d2[here]) {
      d2[here] = reach;
      dx[here] = offsetX;
      dy[here] = offsetY;
    }
  };

  // Forward: the four neighbours above and to the left, which this scan has
  // already settled.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (d2[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 1, 0);
      if (y > 0) relax(i, i - width, 0, 1);
      if (x > 0 && y > 0) relax(i, i - width - 1, 1, 1);
      if (x + 1 < width && y > 0) relax(i, i - width + 1, -1, 1);
    }
  }
  // Backward: the other four.
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (d2[i] === 0) continue;
      if (x + 1 < width) relax(i, i + 1, -1, 0);
      if (y + 1 < height) relax(i, i + width, 0, -1);
      if (x + 1 < width && y + 1 < height) relax(i, i + width + 1, -1, -1);
      if (x > 0 && y + 1 < height) relax(i, i + width - 1, 1, -1);
    }
  }

  const out = Buffer.from(pixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (d2[i] === 0 || d2[i] === FAR) continue;
      const seed = (y - dy[i]) * width + (x - dx[i]);
      out[i * 4] = pixels[seed * 4];
      out[i * 4 + 1] = pixels[seed * 4 + 1];
      out[i * 4 + 2] = pixels[seed * 4 + 2];
    }
  }
  return out;
}

const files = (await readdir(TEETH)).filter((file) => file.endsWith('.webp')).toSorted();

for (const name of files) {
  const file = path.join(TEETH, name);
  // Read to a buffer rather than handing `sharp` the path: libvips keeps the
  // input mapped for the lifetime of the pipeline, and on Windows that leaves
  // the file unopenable for the write back to it a few lines down.
  const { data, info } = await sharp(await readFile(file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const alpha = await redrawEdge(data, width, height);
  const repaired = bleedColour(data, width, height);
  for (let i = 0; i < width * height; i++) repaired[i * 4 + 3] = alpha[i];

  // Encoded whole before anything is written, so a failure leaves the original
  // in place rather than half a file.
  const webp = await sharp(repaired, { raw: { width, height, channels: 4 } })
    .webp(WEBP)
    .toBuffer();
  await writeFile(file, webp);

  console.log(`${name}  ${width}x${height}  ${webp.length} bytes`);
}
