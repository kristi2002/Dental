/**
 * The clinic's logo, from what the designer handed over to what the app can use.
 *
 * What arrived is two JPEGs of the same mark — black on white, and white on
 * black — in `src/logo/`. Neither is usable as-is. A JPEG has no transparency,
 * so the white-background one lays a white rectangle over any surface it is
 * dropped on, and the black-background one lays a black one; on a printed
 * prescription that rectangle is visible, and on the teal navigation rail it is
 * glaring. The line art also has to sit on paper *and* on teal *and* on the
 * app's white cards, which one baked-in colour cannot do.
 *
 * So the mark is separated from its background once, and that one coverage map
 * is then re-emitted in every shape and colour the app asks for:
 *
 *   public/brand/logo*.png    the full lockup — mark, "Shehu", "Dental clinic"
 *   public/brand/mark*.png    the monogram — the tooth and the script `sh`
 *   src/app/icon*.png         the browser tab and the phone home screen
 *   src/app/apple-icon.png    the same, for iOS
 *
 * Run with `node scripts/build-logo.mjs`; it is not part of `npm run build`,
 * because the logo changes about once a decade and the outputs are committed.
 * This file exists so that when it does change, nobody has to reverse-engineer
 * how the committed PNGs were made.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

/**
 * The white-on-black scan, not the black-on-white one.
 *
 * Both show the same artwork, but this one is 1449x1086 against the other's
 * 918x636 — and since every pixel of detail here becomes an alpha value, the
 * bigger scan is the one that keeps the hairlines of the script `sh` from
 * breaking up. Its luminance is also already the coverage map we want: bright
 * where the ink is, dark where it is not.
 */
const SOURCE = 'src/logo/logo black.jpeg';
const BRAND_DIR = 'public/brand';
/** Next's icon file convention wants these at the root of the app directory. */
const APP_DIR = 'src/app';

/**
 * Where to put the black and white points when reading luminance as coverage.
 *
 * A JPEG of line art is not clean: the "black" background sits around 8-16
 * rather than 0, and every stroke carries a halo of ringing artefacts. Mapping
 * luminance straight to alpha would keep all of that as a grey fog around the
 * mark, which shows up as a dirty rectangle the moment the logo is placed on a
 * surface that is not black.
 *
 * Clamping below FLOOR to fully transparent kills the fog and the ringing;
 * clamping above CEIL to fully opaque keeps the strokes solid instead of a
 * washed-out grey. The ramp between the two is what preserves the anti-aliased
 * edges, which is the whole reason not to just threshold this.
 */
const FLOOR = 60;
const CEIL = 190;

/**
 * The three inks, and the two teals the tile is mixed from.
 *
 * `TEAL` is `--color-brand-deep` from `globals.css` — the one teal in the
 * palette that clears 4.5:1 as text on a light background, which is the bar the
 * mark has to clear when it sits in the footer or on a signed-out card. The
 * brighter `--color-brand` would be prettier and would fail it.
 *
 * The gradient pair is the navigation rail's own, `--app-rail` read off the
 * same file: the icon on the home screen and the rail behind the app it opens
 * are then literally the same wash of teal.
 */
const INK = [0x00, 0x00, 0x00];
const PAPER = [0xff, 0xff, 0xff];
const TEAL = [0x0b, 0x6f, 0x6a];
const TILE_FROM = '#0b8f86';
const TILE_TO = '#34bdb2';

const { data, info } = await sharp(SOURCE)
  // Greyscale first: the source is neutral already, so this only collapses three
  // identical channels into the one that actually carries the coverage.
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const pixels = info.width * info.height;
const alpha = Buffer.allocUnsafe(pixels);
for (let i = 0; i < pixels; i += 1) {
  const luma = data[i];
  if (luma <= FLOOR) alpha[i] = 0;
  else if (luma >= CEIL) alpha[i] = 255;
  else alpha[i] = Math.round(((luma - FLOOR) / (CEIL - FLOOR)) * 255);
}

/**
 * The bounding box of the ink inside a window of the scan, measured rather than
 * guessed.
 *
 * The scan is a photograph of the artwork, so the mark floats inside a wide
 * black margin that has nothing to do with the logo's proportions — carrying it
 * would force every use site to compensate for the photographer's framing, and
 * would make `height: 2rem` mean two different things here than in the next
 * design that ships.
 *
 * `sharp`'s own `.trim()` is the obvious tool and does nothing useful here: it
 * derives what to trim from the corner pixel of the *composed* image, which is
 * transparent black in one output and transparent white in the other, and it
 * left both files uncropped at full size. Reading the extent off the alpha we
 * just computed is both exact and identical for every colour, which is what
 * guarantees the whole family stays registered to one another.
 *
 * No padding: a tight crop lets layout decide the breathing room, and a margin
 * baked into the file is one that cannot be taken back out.
 */
function inkBox(window) {
  const x0 = window?.left ?? 0;
  const y0 = window?.top ?? 0;
  const x1 = Math.min(info.width, x0 + (window?.width ?? info.width));
  const y1 = Math.min(info.height, y0 + (window?.height ?? info.height));

  let minX = x1;
  let minY = y1;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (alpha[y * info.width + x] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** The whole lockup: tooth, script `sh`, "Shehu", "Dental clinic". */
const lockup = inkBox();

/**
 * Where the monogram stops, counted from the left edge of the lockup.
 *
 * The rail is 15rem wide and pinches to 4.5rem, and a phone's top bar is one
 * row tall — nowhere near enough for a 3.4:1 lockup whose smallest line would
 * land at six pixels. So the chrome wears the drawing and writes the name in
 * text beside it, which means the drawing has to be cut out of the lockup.
 *
 * There is no gap to cut in: the swash under the mark runs unbroken from the
 * tooth into the `S` of Shehu. 664 is the last column that still reads as a
 * finished drawing — the `h` has closed its bowl and its downstroke leaves the
 * frame the way a signature does, and the `S` behind it has not yet begun. Cut
 * earlier and the `h` is visibly sliced; cut later and two letter fragments
 * float at the right-hand edge.
 */
const MONOGRAM_WIDTH = 664;
const monogram = inkBox({ ...lockup, width: MONOGRAM_WIDTH });

/**
 * One flat-coloured layer wearing that alpha as its mask.
 *
 * The colour is uniform on purpose. The mark is line art in a single ink, so
 * there is nothing to preserve from the source's own greys — they were only ever
 * anti-aliasing, and they now live in the alpha channel where they belong. This
 * is also what makes every output an exact overlay of every other rather than a
 * set of separate scans that might not line up.
 *
 */
function tint([r, g, b]) {
  // Assembled by hand rather than with `create` + `joinChannel`. That pairing
  // silently ignored the alpha passed to it and emitted a half-opaque
  // rectangle; writing the four channels out directly is both correct and
  // checkable, and the cost is one pass over an image this script runs on twice.
  const rgba = Buffer.allocUnsafe(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = alpha[i];
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });
}

/**
 * Fatten what the resampler thinned, after it has thinned it.
 *
 * At the size the tab icon is drawn, a hairline of the script lands on a third
 * of a pixel and comes out of the downscale at a third of its opacity — a grey
 * ghost on teal rather than a white line. Multiplying the coverage back up
 * restores the weight the drawing has at any honest size; a type designer would
 * call it hinting, and here it is one multiply.
 *
 * It has to happen *after* the resize. Applied to the full-resolution artwork it
 * does nothing at all — that alpha is already 255 nearly everywhere, and the
 * downscale then averages the thinness straight back in.
 */
async function thicken(png, boost) {
  if (boost === 1) return png;
  const { data: small, info: dim } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < dim.width * dim.height; i += 1) {
    small[i * 4 + 3] = Math.min(255, Math.round(small[i * 4 + 3] * boost));
  }
  return sharp(small, { raw: { width: dim.width, height: dim.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function report(path, buffer) {
  await writeFile(path, buffer);
  const meta = await sharp(buffer).metadata();
  console.log(`${path}  ${meta.width}x${meta.height}  ${(buffer.length / 1024).toFixed(1)} kB`);
}

/** One transparent PNG of `box`, inked in `colour`. */
async function emit(name, box, colour) {
  const buffer = await tint(colour).extract(box).png({ compressionLevel: 9 }).toBuffer();
  await report(`${BRAND_DIR}/${name}`, buffer);
}

/**
 * The app icon: the monogram in white, on a rounded tile of the rail's teal.
 *
 * A tile rather than the bare mark, because a transparent line drawing on a
 * browser tab is a few grey scratches on whatever the tab strip happens to be —
 * and on a phone home screen it is invisible. The tile is also the only place
 * in this family where the mark is asked to be recognisable rather than
 * legible: at 32 pixels nobody reads "sh", they recognise the teal square that
 * belongs to this practice.
 *
 * `radius` is a fraction rather than pixels so the corner keeps its shape at
 * every size. iOS applies its own mask to `apple-icon`, so that one is emitted
 * square and left to be rounded by the phone — a rounded tile inside the iOS
 * mask loses its corners twice and reads as a smaller icon.
 */
async function emitIcon(path, size, { pad, boost = 1, radius = 0.22 }) {
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0.45" y2="1">` +
      `<stop offset="0" stop-color="${TILE_FROM}"/><stop offset="1" stop-color="${TILE_TO}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${size}" height="${size}" rx="${Math.round(size * radius)}" fill="url(#g)"/>` +
      `</svg>`,
  );

  const inset = Math.round(size * pad);
  const mark = await thicken(
    await tint(PAPER)
      .extract(monogram)
      .resize({
        width: size - inset * 2,
        height: size - inset * 2,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer(),
    boost,
  );
  const { width, height } = await sharp(mark).metadata();

  const buffer = await sharp(tile)
    .composite([
      { input: mark, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await report(path, buffer);
}

await mkdir(BRAND_DIR, { recursive: true });

// The ink colour for paper and for the light theme.
await emit('logo.png', lockup, INK);
// The same mark for the teal chrome, where black on teal is invisible.
await emit('logo-inverse.png', lockup, PAPER);
// And in the app's own teal, for the light surfaces inside the app — a footer,
// a signed-out card — where black would read as a pasted-in scan and teal reads
// as part of the room.
await emit('logo-brand.png', lockup, TEAL);

await emit('mark.png', monogram, INK);
await emit('mark-inverse.png', monogram, PAPER);
await emit('mark-brand.png', monogram, TEAL);

// The tab. Small enough that the strokes need fattening to survive the
// resampler, and tight enough in the frame to use the pixels it has.
await emitIcon(`${APP_DIR}/icon.png`, 32, { pad: 0.08, boost: 2.6 });
// The home screen, and anything that wants a big one. No boost: at this size
// the hairlines are hairlines because that is what they are.
await emitIcon(`${APP_DIR}/icon1.png`, 512, { pad: 0.1 });
// iOS, which rounds the corners itself.
await emitIcon(`${APP_DIR}/apple-icon.png`, 180, { pad: 0.12, radius: 0 });
