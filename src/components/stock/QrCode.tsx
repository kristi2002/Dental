import { encodeQr, qrPath, type QrEcc } from '@/lib/qr';

/**
 * A QR symbol as inline SVG.
 *
 * Inline rather than an `<img>` pointing at an endpoint that renders one: a
 * label sheet is sixty symbols, which would be sixty requests on every load and
 * sixty more the moment somebody presses print. The symbol is a few hundred
 * bytes of path data and the server draws it in well under a millisecond, so it
 * simply travels with the page.
 *
 * Vector rather than a bitmap for the reason that matters on paper — a printer
 * renders this at its own resolution, so the modules land on exact device pixels
 * instead of being resampled into the grey fuzz that makes a small label
 * unreadable.
 *
 * No component here is a client component, so this runs on the server and ships
 * no JavaScript at all.
 */
export function QrCode({
  value,
  ecc = 'Q',
  quiet = 4,
  className,
  title,
}: {
  value: string;
  /**
   * `Q` — a quarter of the symbol can be destroyed and still read. A box in a
   * storage room gets scuffed, wet and stickered over, and the next level down
   * saves at most one version of module count for a good deal less tolerance.
   */
  ecc?: QrEcc;
  /**
   * The light margin, in modules. Four is what the specification requires and
   * what a decoder looks for; printing tighter to save paper is the single most
   * common reason a label scans on one phone and not another.
   */
  quiet?: number;
  className?: string;
  /** What a screen reader says. The symbol is decoration to anyone not holding a phone. */
  title?: string;
}) {
  const symbol = encodeQr(value, ecc);
  const span = symbol.size + quiet * 2;

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      className={className}
      role="img"
      aria-label={title}
      // Without this the browser antialiases the module edges, and a symbol
      // printed at 30mm loses its quiet-zone contrast to the blur.
      shapeRendering="crispEdges"
    >
      {/* Black on white, stated rather than themed. Every other surface in the
          app follows the reader's colour scheme; this one must not — a symbol
          rendered in the dark theme's ink on the dark theme's paper is a symbol
          no scanner will read, and it prints as a grey square. */}
      <rect width={span} height={span} fill="#ffffff" />
      <path d={qrPath(symbol)} fill="#000000" transform={`translate(${quiet} ${quiet})`} />
    </svg>
  );
}
