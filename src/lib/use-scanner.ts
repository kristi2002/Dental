'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Getting a code off a box and into the page.
 *
 * Two devices, deliberately, because a practice has two places where stock is
 * touched. A delivery is opened in the storage room, where a desk scanner on a
 * cable is faster and works in bad light; a material is used at the chair, where
 * the only device anyone is holding is a phone. The parsing, the resolution and
 * the basket are identical either way — only the way the characters arrive
 * differs, so only that is what these hooks abstract.
 *
 * Neither of them decides anything. They hand a raw string to a callback; what
 * it means is `parseScan`'s problem, and what to do about it is the console's.
 */

/**
 * A hardware scanner is a keyboard that types very fast and presses Enter.
 *
 * That is the whole protocol, and it is why no driver, no pairing screen and no
 * permission prompt is involved: the browser cannot tell a wedge from a person
 * except by speed. Characters arriving closer together than a human hand can
 * manage are a scan; anything slower resets the buffer, which is what keeps
 * somebody typing a note from submitting a phantom barcode.
 *
 * Deliberately not a focused input: staff arrive at this screen holding a
 * carton in one hand and the scanner in the other, and "click the box first"
 * is exactly the instruction that gets forgotten. Typing into a real field
 * still goes to that field — the listener stands down whenever something
 * editable has focus.
 */
export function useWedgeScanner(onScan: (code: string) => void, enabled = true) {
  const buffer = useRef('');
  const lastKeyAt = useRef(0);
  // Held in a ref so a changing callback does not tear the listener down and
  // lose half a scan that is mid-flight.
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    /** Faster than a hand, slower than a scanner's own gaps. */
    const MAX_GAP_MS = 80;
    /** Shorter than this is a stray keypress, not a symbol. */
    const MIN_LENGTH = 4;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      const now = event.timeStamp || Date.now();
      if (now - lastKeyAt.current > MAX_GAP_MS) buffer.current = '';
      lastKeyAt.current = now;

      if (event.key === 'Enter') {
        const code = buffer.current;
        buffer.current = '';
        if (code.length >= MIN_LENGTH) {
          // A wedge's Enter would otherwise submit whatever form is on screen.
          event.preventDefault();
          handler.current(code);
        }
        return;
      }

      // Single characters only — modifiers, arrows and function keys are not
      // part of a symbol. The group separator GS1 uses between fields is one
      // character too, and arrives here exactly like any other.
      if (event.key.length === 1) buffer.current += event.key;
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}

/**
 * The subset of the `BarcodeDetector` API this needs. Not in `lib.dom` yet —
 * it is a browser API without a TypeScript home, not an invention.
 */
type DetectedBarcode = { rawValue: string; format: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/**
 * What a dental box actually carries. DataMatrix leads because that is what the
 * EU's UDI rules put on a medical device, and it is the one people call "the QR
 * code" without looking closely.
 */
const FORMATS = [
  'data_matrix',
  'qr_code',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
];

/**
 * Where our own copy of the decoder's WebAssembly lives.
 *
 * Served from this origin, never from a CDN — see `scripts/copy-zxing-wasm.mjs`
 * for why that matters on a clinic mini-PC.
 */
const WASM_PATH = '/zxing_reader.wasm';

/**
 * The decoder, native where there is one and WebAssembly where there is not.
 *
 * Chrome and Android Chrome implement `BarcodeDetector`; Safari and Firefox do
 * not, and an iPad at the chair is the single most likely device in a practice.
 * So the fallback is not optional — but it is 1.1 MB of WebAssembly, and making
 * every page load carry that to serve the browsers that do not need it would be
 * absurd. Hence: imported dynamically, only once the camera is actually asked
 * for, and only after the native implementation has been ruled out.
 *
 * Memoised on the promise rather than the result, so two rapid presses of "use
 * the camera" cannot start two downloads of the same binary.
 */
let detectorPromise: Promise<BarcodeDetectorCtor | null> | null = null;

function loadDetector(): Promise<BarcodeDetectorCtor | null> {
  detectorPromise ??= (async () => {
    const native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (typeof native === 'function') return native;

    try {
      const zxing = await import('barcode-detector/ponyfill');

      // Emscripten would otherwise resolve the binary against a hard-coded
      // jsDelivr URL baked into `zxing-wasm`. `prefix` is honoured for anything
      // that is not the wasm itself, so this redirects exactly one file.
      zxing.setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? WASM_PATH : `${prefix}${path}`,
      });

      return zxing.BarcodeDetector as unknown as BarcodeDetectorCtor;
    } catch {
      // The chunk or the binary could not be fetched. Reset, so plugging the
      // network back in and pressing the button again is all it takes.
      detectorPromise = null;
      return null;
    }
  })();

  return detectorPromise;
}

export type CameraState = 'idle' | 'starting' | 'running' | 'unsupported' | 'denied' | 'error';

/**
 * The camera path, for the phone at the chair.
 *
 * Reads straight off the `<video>` element rather than painting frames into a
 * canvas first: the detector accepts one, and the copy was pure cost on the
 * cheapest device anybody will actually use this on.
 *
 * Throttled well below the frame rate on purpose. Decoding every frame pins a
 * phone's CPU and empties its battery for no gain — a hand holding a box steady
 * gives the same symbol for a second or more, and eight looks at it are as good
 * as sixty.
 */
export function useCameraScanner(onScan: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The same box stays in front of the lens for a second or two after it is
  // read. Without this, one carton becomes fifteen scans.
  const lastCode = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const handler = useRef(onScan);
  handler.current = onScan;

  const [state, setState] = useState<CameraState>('idle');

  // Whether this device can hand us a camera at all — which, now that the
  // decoder is carried rather than borrowed from the browser, is the only thing
  // left that can rule the camera out. Settled after mount rather than during
  // render: `navigator` does not exist on the server, and deciding during
  // render would make the button's disabled state a hydration mismatch.
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }

    // Before the permission prompt, because on Safari this is where a megabyte
    // of WebAssembly gets fetched and "starting" is the honest thing to say.
    setState('starting');

    const Detector = await loadDetector();
    if (!Detector) {
      setState('unsupported');
      return;
    }

    let detector: BarcodeDetectorLike;
    try {
      detector = new Detector({ formats: FORMATS });
    } catch {
      // A browser that has the constructor but not these formats.
      detector = new Detector();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The back camera, and as much resolution as it will give: a DataMatrix
        // on a 15mm foil pouch is a handful of pixels at 640×480.
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        setState('idle');
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      setState('running');

      const DEDUPE_MS = 1500;
      timerRef.current = setInterval(async () => {
        const source = videoRef.current;
        if (!source || source.readyState < 2) return;

        let found: DetectedBarcode[];
        try {
          found = await detector.detect(source);
        } catch {
          // A frame the detector could not read is not an error worth showing.
          return;
        }

        const code = found[0]?.rawValue;
        if (!code) return;

        const now = Date.now();
        if (code === lastCode.current.value && now - lastCode.current.at < DEDUPE_MS) return;
        lastCode.current = { value: code, at: now };
        handler.current(code);
      }, 125);
    } catch (error) {
      setState(
        error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error',
      );
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // A camera left running behind a closed screen is a light on the back of a
  // phone and a flat battery by lunchtime.
  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop, supported };
}
