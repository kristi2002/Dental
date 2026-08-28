/**
 * Cut the sixteen teeth in `public/teeth/` out of the poster they came from.
 *
 * The source is the Freepik render `ToothPhoto` records the provenance of — a
 * 5000×3250 JPEG of a thirty-two tooth chart, upper arch on one row and lower on
 * the next, each tooth drawn on white with a soft ellipse of shadow beneath it.
 * Only the poster's left half is cut: that is the patient's right, the side
 * `ToothPhoto` draws unflipped, and the right half is the same eight teeth
 * printed again rather than mirrored.
 *
 * **What this replaces.** The files that shipped before were the same artwork
 * cut by hand, downscaled to about 0.81 of what the poster holds, and saved as
 * lossy WebP with the alpha channel compressed alongside the colour. All three
 * of those cost something, and the third cost the most: every transparent pixel
 * still carried poster-white, the outermost rim of the silhouette *was* poster
 * white at a few per cent alpha, and the compressed alpha jittered pixel to
 * pixel. On the storefront's navy, downscaled into `DentalArch`, that read as a
 * dusting of white specks along every border. None of it can happen here — the
 * matte is derived rather than drawn, and no pixel outside a tooth keeps a
 * colour that was ever white.
 *
 * **Native scale, and no more.** `DentalArch` caps its container at 88rem and
 * gives a first molar 206 of its 2596 units, so the widest a molar is ever
 * painted is about 112 CSS pixels — 224 device pixels on a 2× display. The
 * poster holds that molar at 253 pixels. Cutting at the poster's own scale
 * therefore lands just above what the page can ever ask for, and anything beyond
 * it would be bytes no screen resolves. The `.eps` beside the JPEG is the true
 * vector and would rasterise to any size at all; it needs a PostScript
 * interpreter this machine does not have, and on the numbers above it would buy
 * nothing.
 *
 *     node scripts/cut-tooth-photos.mjs [poster.jpg]
 *
 * **Run by hand, not by the build**, for the reasons `resize-site-photos.mjs`
 * gives: `sharp` is here transitively via Next's image optimizer, which this app
 * does not use, and the input changes roughly never. The output is committed;
 * the poster need not be present for a build.
 *
 * It prints the `PHOTOS` map at the end. Those numbers are load bearing —
 * `DentalArch` sizes the whole arch from the relative widths — so paste them
 * into `ToothPhoto` whenever this is re-run, and `tests/tooth-photos.test.ts`
 * will hold you to it.
 */
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.join(import.meta.dirname, '..', 'public', 'teeth');
const ROOT = path.join(import.meta.dirname, '..');

/**
 * A quadrant, outermost tooth first — the order the poster lays one out in.
 *
 * `DentalArch` holds the same list for the same reason, and the two must agree:
 * the eighth file cut here is the one that component puts at the midline.
 */
const QUADRANT = [
  'THIRD_MOLAR',
  'SECOND_MOLAR',
  'FIRST_MOLAR',
  'SECOND_PREMOLAR',
  'FIRST_PREMOLAR',
  'CANINE',
  'LATERAL_INCISOR',
  'CENTRAL_INCISOR',
];

/**
 * What counts as ink, and what counts as a tooth.
 *
 * Everything here is stated as a *whiteness deficit* — 255 minus the darkest of
 * the three channels — because the ground is white and that is the one number
 * that says how far from it a pixel is. Flat poster white sits at 0 to 2 even
 * after JPEG; the palest highlight inside a crown reaches 0 as well, which is
 * the whole reason the silhouette cannot be a threshold and has to be a filled
 * region.
 *
 * `INK` is set well above the shadow ellipse and well below the tooth's own
 * outline, which the drawing keeps dark the whole way round — that unbroken rim
 * is what makes flood-filling the inside safe. `CHROMA` throws away the chart's
 * teal brackets and pink labels before any of the above: they are the only
 * saturated things on the page, and a tooth never exceeds about 30.
 *
 * `FEATHER` is how far outside the silhouette a pixel may still be part of the
 * edge. The poster's own edge is one pixel wide — 2 then 60 across a single
 * step — so two is already generous, and it is what keeps the shadow out: at
 * three or four the ellipse under a molar starts contributing a grey haze that
 * looks exactly like the fringe this cut exists to be rid of.
 */
const INK = 18;
const CHROMA = 50;
const FEATHER = 2;

/**
 * The floor under the colour an edge pixel is measured against.
 *
 * Coverage comes out as the edge pixel's deficit over the deficit of the tooth
 * colour behind it. Where that tooth colour is itself nearly white — a specular
 * highlight running out to the silhouette — the ratio is two small numbers
 * divided by each other and the result is noise. Below this the pixel takes the
 * silhouette's own answer instead.
 */
const FAINT = 12;

/** Bands shorter than this are the chart's labels rather than a row of teeth. */
const ROW = 300;
/** Columns narrower than this are the gap between two teeth, not a tooth. */
const GAP = 30;

/**
 * White kept around each tooth before it is matted.
 *
 * The bands and runs that locate a tooth are drawn at `INK`, so they stop a
 * pixel or two inside where the silhouette actually ends — and for whichever
 * tooth is tallest in its row, the band's own edge *is* that tooth, which
 * without a margin loses the tip of a root. It also gives the flood fill white
 * to start from on every side. Generous is free: the cut is trimmed to what is
 * drawn afterwards, and the shadow this pulls in is dropped by the fill.
 */
const MARGIN = 12;

const WEBP = { quality: 92, alphaQuality: 100, effort: 6 };

/**
 * The poster, as three flat arrays.
 *
 * `deficit` is what every later step reads; `rgb` is only ever sampled, never
 * scanned. `chrome` marks the teal and pink furniture so the row and column
 * detection can ignore it — a bracket is as far from white as a tooth is, and
 * spans the whole page.
 */
async function readPoster(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const deficit = new Uint8Array(width * height);
  const chrome = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const low = Math.min(r, g, b);
    deficit[i] = 255 - low;
    chrome[i] = Math.max(r, g, b) - low >= CHROMA ? 1 : 0;
  }
  return { rgb: data, deficit, chrome, width, height };
}

/** Runs of consecutive `true` in a projection, keeping only the long ones. */
function bands(counts, floor, least) {
  const found = [];
  let start = null;
  for (let i = 0; i <= counts.length; i++) {
    const on = i < counts.length && counts[i] > floor;
    if (on && start === null) start = i;
    if (!on && start !== null) {
      if (i - start >= least) found.push([start, i]);
      start = null;
    }
  }
  return found;
}

/**
 * Where the sixteen teeth of each arch sit on the page.
 *
 * Found rather than written down. Two projections do it: rows carrying ink give
 * the two arches (and the chart's title, which is short and drops out), and
 * within each arch the columns carrying ink give sixteen runs separated by white
 * gutters. Only the first eight of each row are wanted.
 *
 * Written down, these would be sixty-four numbers that agree with the artwork
 * until the day somebody re-exports the poster a hair differently, and then
 * disagree silently by cropping a root off.
 */
function findTeeth(poster) {
  const { deficit, chrome, width, height } = poster;
  const ink = (i) => (deficit[i] > INK && !chrome[i] ? 1 : 0);

  const perRow = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) n += ink(y * width + x);
    perRow[y] = n;
  }

  const arches = bands(perRow, 5, ROW);
  if (arches.length !== 2) {
    throw new Error(`expected an upper and a lower arch, found ${arches.length} bands of teeth`);
  }

  return arches.map(([top, bottom], index) => {
    const perColumn = new Int32Array(width);
    for (let y = top; y < bottom; y++) {
      for (let x = 0; x < width; x++) perColumn[x] += ink(y * width + x);
    }
    const columns = bands(perColumn, 2, GAP);
    if (columns.length !== 16) {
      throw new Error(`expected sixteen teeth in the ${index ? 'lower' : 'upper'} arch, found ${columns.length}`);
    }
    // The poster's left half is the patient's right, which is the side
    // `ToothPhoto` draws with no flip.
    return {
      arch: index === 0 ? 'upper' : 'lower',
      teeth: columns.slice(0, 8).map(([left, right], place) => ({
        kind: QUADRANT[place],
        left,
        right,
        top,
        bottom,
      })),
    };
  });
}

/**
 * The tooth, as a filled region, with the shadow left behind.
 *
 * Two steps and each drops one thing. Growing outward from the darkest pixel
 * keeps whatever is joined to it and abandons the shadow ellipse, which the
 * drawing floats a clear few pixels below the crown. Flooding white inward from
 * the border then reclaims every pale highlight the threshold cut a hole in,
 * while leaving the gaps between a molar's roots transparent — those open to the
 * outside, so the flood reaches them.
 */
function silhouette(deficit, width, height) {
  const stack = new Int32Array(width * height);
  const flood = (seed, admits) => {
    const seen = new Uint8Array(width * height);
    let top = 0;
    for (const start of seed) {
      if (!seen[start] && admits(start)) {
        seen[start] = 1;
        stack[top++] = start;
      }
    }
    while (top > 0) {
      const i = stack[--top];
      const x = i % width;
      const y = (i / width) | 0;
      for (const [stepX, stepY] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + stepX;
        const ny = y + stepY;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || !admits(next)) continue;
        seen[next] = 1;
        stack[top++] = next;
      }
    }
    return seen;
  };

  let darkest = 0;
  for (let i = 1; i < deficit.length; i++) if (deficit[i] > deficit[darkest]) darkest = i;
  const tooth = flood([darkest], (i) => deficit[i] > INK);

  const border = [];
  for (let x = 0; x < width; x++) {
    border.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    border.push(y * width, y * width + width - 1);
  }
  const outside = flood(border, (i) => !tooth[i]);

  const solid = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i++) solid[i] = outside[i] ? 0 : 1;
  return solid;
}

/**
 * For every pixel, the nearest solid one.
 *
 * A two-pass chamfer sweep — the standard eight-point sequential distance
 * transform. Each pixel carries the offset to the nearest seed it has heard
 * about; a forward scan propagates that from the four neighbours already
 * visited, a backward scan from the four that were not. It answers both
 * questions this cut has: which colour a transparent pixel should carry, so that
 * nothing outside a tooth is ever white for a downscale to average in, and how
 * far out the edge is still allowed to reach.
 */
function nearestSolid(solid, width, height) {
  const FAR = Number.MAX_SAFE_INTEGER;
  const dx = new Int32Array(width * height);
  const dy = new Int32Array(width * height);
  const d2 = new Float64Array(width * height);
  for (let i = 0; i < d2.length; i++) d2[i] = solid[i] ? 0 : FAR;

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

  const seed = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      seed[i] = d2[i] === FAR ? -1 : (y - dy[i]) * width + (x - dx[i]);
    }
  }
  return { seed, d2 };
}

/**
 * One tooth, matted.
 *
 * The silhouette answers where the tooth is; the edge is measured rather than
 * drawn. A pixel just outside is white mixed with the tooth colour behind it, so
 * its coverage is how far it fell from white over how far that colour falls from
 * white — which recovers the render's own one-pixel edge instead of inventing a
 * ramp. Colour is taken from the nearest solid pixel everywhere the tooth is not
 * fully opaque, so the file holds no white anywhere outside the silhouette and a
 * downscale has none to find.
 */
function matte(poster, box) {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  // The chart's own furniture is read as white. A margin this generous can
  // reach the tip of a teal bracket above the arch, and a bracket is further
  // from white than any tooth — left in, it wins the seed and the cut comes back
  // as a nine-pixel scrap of a label.
  const deficit = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (box.top + y) * poster.width + box.left + x;
      deficit[y * width + x] = poster.chrome[from] ? 0 : poster.deficit[from];
    }
  }

  const solid = silhouette(deficit, width, height);
  const { seed, d2 } = nearestSolid(solid, width, height);
  const reach = FEATHER * FEATHER;

  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const source = solid[i] ? i : seed[i];
      if (source >= 0) {
        const from = ((box.top + ((source / width) | 0)) * poster.width + box.left + (source % width)) * 3;
        pixels[i * 4] = poster.rgb[from];
        pixels[i * 4 + 1] = poster.rgb[from + 1];
        pixels[i * 4 + 2] = poster.rgb[from + 2];
      }

      let alpha = 0;
      if (solid[i]) {
        alpha = 255;
      } else if (source >= 0 && d2[i] <= reach) {
        const behind = deficit[source];
        alpha = behind >= FAINT ? Math.round((deficit[i] / behind) * 255) : 0;
      }
      pixels[i * 4 + 3] = Math.max(0, Math.min(255, alpha));
    }
  }

  // Tight to what is actually drawn: the box the columns gave is generous, and a
  // reserved box with empty rows in it is a tooth that sits wrong in the arch.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const cut = Buffer.alloc((maxX - minX + 1) * (maxY - minY + 1) * 4);
  const span = maxX - minX + 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      pixels.copy(cut, ((y - minY) * span + (x - minX)) * 4, (y * width + x) * 4, (y * width + x) * 4 + 4);
    }
  }
  return { data: cut, width: span, height: maxY - minY + 1 };
}

const named = process.argv[2];
const poster =
  named ??
  path.join(
    ROOT,
    (await readdir(ROOT)).find((file) => /human teeth dental anatomy.*\.jpg$/i.test(file)) ?? '',
  );
if (!named && !poster.endsWith('.jpg')) {
  throw new Error('no poster found in the repository root — pass one as the first argument');
}

const page = await readPoster(poster);
console.log(`${path.basename(poster)}  ${page.width}x${page.height}`);

const map = { upper: {}, lower: {} };
for (const { arch, teeth } of findTeeth(page)) {
  for (const tooth of teeth) {
    const cut = matte(page, {
      left: Math.max(0, tooth.left - MARGIN),
      right: Math.min(page.width, tooth.right + MARGIN),
      top: Math.max(0, tooth.top - MARGIN),
      bottom: Math.min(page.height, tooth.bottom + MARGIN),
    });

    const name = `${arch}-${tooth.kind.toLowerCase().replace(/_/g, '-')}.webp`;
    const webp = await sharp(cut.data, {
      raw: { width: cut.width, height: cut.height, channels: 4 },
    })
      .webp(WEBP)
      .toBuffer();
    await writeFile(path.join(OUT, name), webp);

    map[arch][tooth.kind] = { name, width: cut.width, height: cut.height };
    console.log(`  ${name}  ${cut.width}x${cut.height}  ${webp.length} bytes`);
  }
}

console.log('\nfor ToothPhoto:');
for (const arch of ['upper', 'lower']) {
  console.log(`  ${arch}: {`);
  for (const kind of QUADRANT) {
    const { name, width, height } = map[arch][kind];
    console.log(`    ${kind}: { src: '/teeth/${name}', width: ${width}, height: ${height} },`);
  }
  console.log('  },');
}
