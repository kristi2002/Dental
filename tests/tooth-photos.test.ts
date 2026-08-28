import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { TOOTH_PHOTOS } from '../src/components/dental/ToothPhoto';

/**
 * The three ways a shipped tooth goes wrong quietly.
 *
 * `ToothPhoto` maps an arch and a kind to a file under `public/`. TypeScript
 * covers one half of that — the map is a `Record<ToothArch, Record<ToothKind,
 * …>>`, so a ninth kind fails the build until somebody cuts a picture for it.
 * It cannot cover any of the following, and each of them fails somewhere nobody
 * is looking rather than at the point of the mistake:
 *
 * - **A path with no file behind it** is a perfectly good string. The first
 *   anyone hears is a broken image on a page that gets reloaded twice a year.
 * - **Dimensions that drift from the file.** They are baked into the map so the
 *   page reserves the box before the bytes land; wrong, they reserve the wrong
 *   box and the layout jumps once the image arrives. Worse, the widths are load
 *   bearing — every file is at one common scale, so a row sized by width is in
 *   proportion *because of these numbers*. One re-exported at a different size
 *   silently makes that molar the wrong size next to its neighbour.
 * - **A file that lost its alpha.** A tooth is cut out of a white poster. Re-save
 *   one without the alpha channel and it is a white rectangle — invisible on a
 *   white panel, and a glaring white box on the bone-coloured public pages.
 */

const TEETH = path.join(process.cwd(), 'public', 'teeth');

/**
 * Enough of the WebP container to answer the two questions above.
 *
 * Every file here is the extended form — `RIFF….WEBPVP8X` — which is what an
 * encoder writes for a lossy image that carries alpha, and which states the
 * canvas size in its own header rather than leaving it to be dug out of the
 * codec bitstream. Anything else is a re-save that changed the format, and is
 * worth failing on rather than parsing around.
 */
function readWebp(buffer: Buffer) {
  assert.equal(buffer.subarray(0, 4).toString('latin1'), 'RIFF', 'not a RIFF container');
  assert.equal(buffer.subarray(8, 12).toString('latin1'), 'WEBP', 'not a WebP');
  assert.equal(
    buffer.subarray(12, 16).toString('latin1'),
    'VP8X',
    'not an extended WebP — a re-save has changed the format, and with it whether alpha survived',
  );

  const le24 = (at: number) => buffer[at] | (buffer[at + 1] << 8) | (buffer[at + 2] << 16);
  return {
    width: le24(24) + 1,
    height: le24(27) + 1,
    hasAlpha: (buffer[20] & 0x10) !== 0,
  };
}

describe('tooth photos', () => {
  for (const [arch, kinds] of Object.entries(TOOTH_PHOTOS)) {
    for (const [kind, photo] of Object.entries(kinds)) {
      const file = path.join(TEETH, path.basename(photo.src));

      it(`${arch} ${kind.toLowerCase().replace(/_/g, ' ')} is a WebP with alpha, at the size the map claims`, async () => {
        assert.ok(
          photo.src.startsWith('/teeth/'),
          `${arch}.${kind} points at ${photo.src}, which is not in the set`,
        );

        const buffer = await readFile(file);
        const image = readWebp(buffer);

        assert.equal(
          `${image.width}x${image.height}`,
          `${photo.width}x${photo.height}`,
          `${photo.src} is really ${image.width}x${image.height}; the map's numbers reserve the box and set the relative scale`,
        );
        assert.ok(
          image.hasAlpha,
          `${photo.src} has no alpha channel — it will render as a white rectangle`,
        );
      });
    }
  }

  /**
   * The invariant the widths exist for. These came off one poster at one scale,
   * and the whole reason `ToothPhoto` says "size a row by width" is that the
   * numbers are comparable. Re-export one file on its own and the scale is gone
   * — silently, because the picture still looks like a tooth.
   *
   * Molar wider than premolar wider than canine is the part of that ordering the
   * artwork actually honours. The canine against the lateral incisor is *not*
   * asserted, and deliberately: the source draws the upper lateral 123 wide
   * against the canine's 121, which is backwards for a mouth. That is a defect
   * in the stock illustration rather than in this map, it is recorded in
   * `ToothPhoto`, and a test asserting the correct ordering would fail on
   * artwork nobody here can fix.
   */
  for (const arch of ['upper', 'lower'] as const) {
    it(`${arch} widths are still to one scale`, () => {
      const photos = TOOTH_PHOTOS[arch];
      const order = ['FIRST_MOLAR', 'SECOND_PREMOLAR', 'CANINE'] as const;

      for (let i = 1; i < order.length; i += 1) {
        const wider = photos[order[i - 1]];
        const narrower = photos[order[i]];
        assert.ok(
          wider.width > narrower.width,
          `${arch} ${order[i - 1]} (${wider.width}) is not wider than ${order[i]} (${narrower.width}) — the files are no longer at one scale`,
        );
      }
    });
  }
});
