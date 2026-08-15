/**
 * Put the barcode decoder's WebAssembly binary where the app can serve it.
 *
 * Safari and Firefox have no `BarcodeDetector`, so camera scanning falls back to
 * the `barcode-detector` ponyfill, which runs the ZXing decoder as WebAssembly.
 * Left alone, `zxing-wasm` fetches that binary **from a public CDN** at the
 * moment somebody points a phone at a box:
 *
 *     https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.1/dist/reader/zxing_reader.wasm
 *
 * Which is wrong here three times over. The practice runs this on a mini-PC that
 * may have no internet at all; a clinic's browser reaching out to a third party
 * mid-treatment is a privacy question nobody asked for; and the failure mode is
 * the worst kind — the scanner simply stops working one morning, on one
 * browser, for a reason nothing on screen can explain.
 *
 * So the binary is copied out of `node_modules` at build time and served from
 * our own origin (see `WASM_PATH` in `src/lib/use-scanner.ts`). Copied rather
 * than committed, so it can never drift from the version of the JavaScript that
 * loads it — a mismatched pair fails with an unreadable WebAssembly error.
 *
 * Runs from `postinstall` (for a working `next dev`) and from `build` (which is
 * what the Docker image actually executes, after `COPY . .` has landed).
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const FILE = 'zxing_reader.wasm';
const from = path.join('node_modules', 'zxing-wasm', 'dist', 'reader', FILE);
const to = path.join('public', FILE);

try {
  const source = await stat(from);

  // Skip an identical copy: this runs on every build, and the file is 1.1 MB.
  const existing = await stat(to).catch(() => null);
  if (existing && existing.size === source.size) {
    process.exit(0);
  }

  await mkdir('public', { recursive: true });
  await copyFile(from, to);
  console.log(`[zxing] ${to} (${(source.size / 1024 / 1024).toFixed(1)} MB)`);
} catch (error) {
  // Never fail the build. Without the file, browsers with a native
  // `BarcodeDetector` are unaffected, and the rest report "camera unavailable"
  // and fall back to the handheld scanner or typing the code — which is a
  // degraded scanner, not a broken deploy.
  console.warn(`[zxing] could not stage ${FILE}: ${error.message}`);
  console.warn('[zxing] camera scanning will be unavailable on Safari and Firefox.');
}
