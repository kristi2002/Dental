import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/pure';
import { encodeQr, qrPath, QrTooLongError, type QrEcc, type QrSymbol } from '../src/lib/qr';
import { parseStockLabel, stockLabelPath, stockLabelUrl } from '../src/lib/stock-labels';

/**
 * The encoder is checked by decoding what it draws, with the very decoder the
 * scanner uses — `barcode-detector` is what `use-scanner.ts` loads for the
 * camera. Asserting the module grid against a copy of itself would only prove
 * the code is stable; this proves it is *right*, and it is the reason a QR
 * encoder is a reasonable thing to have written out by hand.
 *
 * The WebAssembly is read off disk rather than fetched, for the same reason
 * `scripts/copy-zxing-wasm.mjs` exists: a test suite that needs the network is a
 * test suite that fails on a train.
 */
const STAGED = path.join('public', 'zxing_reader.wasm');
const VENDORED = path.join('node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm');
// The staged copy first, because that is the exact binary the app serves.
const wasm = readFileSync(existsSync(STAGED) ? STAGED : VENDORED);
setZXingModuleOverrides({
  wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
});

/**
 * The ponyfill returns each result with a `boundingBox`, built from a geometry
 * class that only a browser has. Node has no reason to provide it and the
 * decoding never touches it, so the shim is purely there to let the result be
 * constructed — nothing under test is replaced by it.
 */
(globalThis as Record<string, unknown>).DOMRectReadOnly ??= class DOMRectReadOnly {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly width = 0,
    readonly height = 0,
  ) {}
  get top() {
    return this.y;
  }
  get left() {
    return this.x;
  }
  get right() {
    return this.x + this.width;
  }
  get bottom() {
    return this.y + this.height;
  }
};

const detector = new BarcodeDetector({ formats: ['qr_code'] });

/** Paint a symbol as an 8-bit greyscale bitmap, with the specified quiet zone. */
function raster(symbol: QrSymbol, scale = 4, quiet = 4) {
  const side = (symbol.size + quiet * 2) * scale;
  const pixels = new Uint8Array(side * side).fill(0xff);

  for (let row = 0; row < symbol.size; row += 1) {
    for (let col = 0; col < symbol.size; col += 1) {
      if (!symbol.modules[row][col]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const x = (col + quiet) * scale + dx;
          const y = (row + quiet) * scale + dy;
          pixels[y * side + x] = 0;
        }
      }
    }
  }

  return { pixels, side };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);

  return Buffer.concat([head, body, crc]);
}

/**
 * The bitmap as a greyscale PNG.
 *
 * `BarcodeDetector` type-checks its input against the browser's image sources,
 * and Node has none of them — but a `Blob` is one, and zxing decodes the bytes
 * itself. Which makes this the closest a test can get to the real path: the
 * pixels of a printed label, through the very ponyfill the camera loads.
 */
function png({ pixels, side }: { pixels: Uint8Array; side: number }): Blob {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale

  // One filter byte per scanline, filter type 0 — "none".
  const raw = Buffer.alloc((side + 1) * side);
  for (let y = 0; y < side; y += 1) {
    raw[y * (side + 1)] = 0;
    raw.set(pixels.subarray(y * side, (y + 1) * side), y * (side + 1) + 1);
  }

  return new Blob([
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', new Uint8Array(0)),
    ]),
  ]);
}

async function decode(text: string, ecc: QrEcc): Promise<string | undefined> {
  const found = await detector.detect(png(raster(encodeQr(text, ecc))));
  return found[0]?.rawValue;
}

describe('encodeQr', () => {
  it('draws a label URL that the app’s own decoder reads back exactly', async () => {
    // The case this whole file exists for: what gets printed on a box.
    const url = stockLabelUrl('https://dent.example.com', 'sq', 'item', '3f2a9c1e-4b7d-4f8a-9e21-0c5d6a8b1234');
    assert.equal(await decode(url, 'Q'), url);
  });

  it('round-trips at every error-correction level', async () => {
    for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
      assert.equal(await decode('DENT', ecc), 'DENT', `level ${ecc}`);
    }
  });

  it('round-trips the Albanian and Italian text a label actually carries', async () => {
    // Non-ASCII is the case byte mode exists for, and the one a naive
    // `charCodeAt` encoder silently mangles into question marks.
    const text = 'Kompozit Filtek Z250 — A2 · ngjyrë · Igjienë';
    assert.equal(await decode(text, 'Q'), text);
  });

  it('picks the smallest version that fits', () => {
    // Module size is what decides whether a phone reads a 25mm sticker, so a
    // symbol that is larger than it needs to be is a real defect.
    assert.equal(encodeQr('A', 'Q').version, 1);
    assert.equal(encodeQr('A', 'Q').size, 21);
    assert.ok(encodeQr('D'.repeat(200), 'M').version > encodeQr('D'.repeat(20), 'M').version);
  });

  it('refuses a payload no version 10 symbol can hold', () => {
    // A clear refusal, rather than a symbol that silently drops its tail.
    assert.throws(() => encodeQr('D'.repeat(300), 'Q'), QrTooLongError);
  });
});

describe('the error-correction block table', () => {
  it('holds for every version at every level, packed to the last codeword', async () => {
    // The table is transcribed from the specification, and a single mistyped
    // digit in one row produces a symbol that is perfectly drawn and completely
    // unreadable — but only for the version and level that row describes, which
    // a handful of sample payloads would sail straight past.
    //
    // So: every version, every level, each at the *largest* payload it will
    // hold. The tightest packing is where an off-by-one in the block sizes has
    // nowhere left to hide, and the assertion is a decode rather than an
    // arithmetic identity, which is the only check that cannot agree with a
    // mistake in the encoder about what the answer should be.
    for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
      const largest = new Map<number, string>();

      for (let length = 1; length <= 271; length += 1) {
        const text = 'D'.repeat(length);
        try {
          largest.set(encodeQr(text, ecc).version, text);
        } catch (error) {
          assert.ok(error instanceof QrTooLongError);
          break;
        }
      }

      assert.equal(largest.size, 10, `level ${ecc} should reach all ten versions`);

      for (const [version, text] of largest) {
        assert.equal(await decode(text, ecc), text, `version ${version}, level ${ecc}`);
      }
    }
  });
});

describe('qrPath', () => {
  it('merges each horizontal run into one rectangle', () => {
    // A version 5 symbol is 1369 modules and a sheet holds sixty of them; one
    // rectangle per dark module would be megabytes of markup for the same ink.
    const symbol = encodeQr('https://dent.example.com/sq/stock/q/i/abc', 'Q');
    const drawn = qrPath(symbol);

    const dark = symbol.modules.flat().filter(Boolean).length;
    const rects = drawn.split('M').length - 1;
    assert.ok(rects > 0);
    assert.ok(rects < dark, 'runs should be merged, not one rectangle per module');

    // Every command is a closed rectangle in module units, so the path can be
    // dropped into any viewBox without scaling arithmetic.
    assert.match(drawn, /^(M\d+ \d+h\d+v1h-\d+z)+$/);
  });

  it('covers exactly the dark modules', () => {
    const symbol = encodeQr('DENT', 'M');
    let painted = 0;
    for (const run of qrPath(symbol).matchAll(/M\d+ \d+h(\d+)v1h-\d+z/g)) {
      painted += Number(run[1]);
    }
    assert.equal(painted, symbol.modules.flat().filter(Boolean).length);
  });
});

describe('stock labels', () => {
  const ID = '3f2a9c1e-4b7d-4f8a-9e21-0c5d6a8b1234';

  it('reads back the item a printed label names', () => {
    const url = stockLabelUrl('https://dent.example.com', 'sq', 'item', ID);
    assert.deepEqual(parseStockLabel(url), { kind: 'item', id: ID });
  });

  it('reads a product label', () => {
    const url = stockLabelUrl('https://dent.example.com', 'en', 'product', ID);
    assert.deepEqual(parseStockLabel(url), { kind: 'product', id: ID });
  });

  it('does not care which host or locale the label was printed under', () => {
    // The practice may reach the app by IP on the clinic LAN and by name from
    // outside, and a sticker printed under one has to work under the other.
    for (const url of [
      `http://192.168.1.14:3000/sq${stockLabelPath('item', ID)}`,
      `https://dent.example.com/it${stockLabelPath('item', ID)}`,
      `https://dent.example.com/en${stockLabelPath('item', ID)}/`,
    ]) {
      assert.deepEqual(parseStockLabel(url), { kind: 'item', id: ID }, url);
    }
  });

  it('ignores anything that is not one of our labels', () => {
    // A supplier's GS1 Digital Link is a URL too, and must fall through to the
    // barcode reader rather than being mistaken for a shelf label.
    assert.equal(parseStockLabel('https://ex.com/01/09506000134352/10/ABC'), null);
    assert.equal(parseStockLabel('5901234123457'), null);
    assert.equal(parseStockLabel(''), null);
    assert.equal(parseStockLabel('https://dent.example.com/sq/stock/q/i/not-a-uuid'), null);
    assert.equal(parseStockLabel('https://dent.example.com/sq/stock/q/x/' + ID), null);
  });
});
