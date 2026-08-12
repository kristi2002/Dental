import {
  isRightSide,
  isUpperArch,
  toothShape,
  type ToothShape,
  type ToothSurface,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * A drawn tooth, shaded rather than flat.
 *
 * The lab chart is the one screen where the picture *is* the interface: a
 * technician reads "which tooth, which face of it" off the shape, and a grid of
 * numbered squares makes them count along the row to find out. So each tooth is
 * drawn as itself — a molar has cusps and three roots, an incisor is a chisel on
 * a single spike — and the work is marked where it falls on the tooth.
 *
 * There are only five distinct drawings (four silhouettes, and molars differ by
 * arch), so each is built once in `ToothDefs` and every tooth on the page is a
 * `<use>` of one. That keeps the shading as deep as it needs to be — six layers
 * per tooth — without paying for it thirty-two times over in markup.
 */

/** Root at the top, crown at the bottom — the upper jaw as it hangs. */
const VIEW_HEIGHT = 240;

/** The lower arch is the same drawing stood on its head. The shading goes with
 *  it, which is right: on both arches the crown stays the lit end and the root
 *  the dull one, which is what the eye actually reads. */
const FLIP = `translate(0, ${VIEW_HEIGHT}) scale(1, -1)`;

type Silhouette = {
  /** Drawn back to front — a palatal root belongs behind the buccal pair. */
  roots: string[];
  crown: string;
  /** The crown's top edge alone, shaded into the gum line. */
  neck: string;
  /** Occlusal fissures and marginal ridges. */
  fissures: string[];
  /** Developmental grooves on the face of a front tooth. Drawn much fainter
   *  than a fissure — at this size, any darker and they read as cracks. */
  lobes?: string[];
  /** The translucent biting edge — enamel with no dentin behind it. Anterior
   *  teeth only; a molar's occlusal surface is not translucent. */
  incisal?: string;
  /** Cusp tips, which catch the light individually. */
  cusps: Array<[number, number, number]>;
  /** The main specular, as [cx, cy, rx, ry, rotation]. */
  shine: [number, number, number, number, number];
  /** How far the crown's widest point reaches, for sizing the marks. */
  spread: number;
};

/* A tooth is one form, not a box with spikes on it. Each crown is therefore
 * drawn narrower at the neck than at its belly, and each root starts *inside*
 * the crown — the overlap is what hides the join and makes the two read as one
 * carved thing. */

const MOLAR_CROWN =
  'M22 142 C13 158 9 186 14 206 C20 224 32 233 43 231 C47 230.2 47.5 224 50 224 ' +
  'C52.5 224 53 230.2 57 231 C68 233 80 224 86 206 C91 186 87 158 78 142 ' +
  'C68 134 32 134 22 142 Z';

const PREMOLAR_CROWN =
  'M28 144 C21 160 18 184 23 204 C28 222 37 231 45 230 C48 229.2 49 224 50 224 ' +
  'C51 224 52 229.2 55 230 C63 231 72 222 77 204 C82 184 79 160 72 144 ' +
  'C64 137 36 137 28 144 Z';

const CANINE_CROWN =
  'M30 142 C24 164 24 190 32 210 C38 226 45 236 50 236 C55 236 62 226 68 210 ' +
  'C76 190 76 164 70 142 C63 135 37 135 30 142 Z';

/* The incisal edge is a chisel, not a dome — flattened across the middle so an
 * incisor cannot be mistaken for a premolar at chart size. */
const INCISOR_CROWN =
  'M24 140 C19 162 19 194 24 212 C26 226 34 232 44 233 L56 233 ' +
  'C66 232 74 226 76 212 C81 194 81 162 76 140 C65 132 35 132 24 140 Z';

/** Upper molars carry three roots, lower molars two. Drawing both with three is
 *  the single most obvious way to get a dental illustration wrong. */
const UPPER_MOLAR_ROOTS = [
  'M40 158 C37 126 39 84 45 66 C47 60 53 60 55 66 C61 84 63 126 60 158 Z', // palatal, behind
  'M19 160 C14 128 14 84 22 62 C25 55 31 56 33 64 C37 90 38 128 38 158 Z', // mesiobuccal
  'M81 160 C86 128 86 84 78 62 C75 55 69 56 67 64 C63 90 62 128 62 158 Z', // distobuccal
];

const LOWER_MOLAR_ROOTS = [
  'M25 160 C19 128 20 82 29 60 C32 53 38 54 40 62 C43 88 44 128 44 158 Z',
  'M75 160 C81 128 80 82 71 60 C68 53 62 54 60 62 C57 88 56 128 56 158 Z',
];

function silhouette(shape: ToothShape, upper: boolean): Silhouette {
  switch (shape) {
    case 'MOLAR':
      return {
        roots: upper ? UPPER_MOLAR_ROOTS : LOWER_MOLAR_ROOTS,
        crown: MOLAR_CROWN,
        neck: 'M22 142 C32 134 68 134 78 142',
        // The central fissure with its branches — the pattern that tells the
        // eye it is looking at a chewing surface and not a blank pad.
        fissures: [
          'M26 212 Q50 202 74 212',
          'M50 206 L50 228',
          'M37 209 L33 221',
          'M63 209 L67 221',
        ],
        cusps: [
          [31, 210, 7],
          [69, 210, 7],
          [36, 223, 5.5],
          [64, 223, 5.5],
        ],
        shine: [33, 176, 11, 23, -9],
        spread: 34,
      };
    case 'PREMOLAR':
      return {
        roots: ['M30 160 C27 120 30 68 40 50 C44 43 56 43 60 50 C70 68 73 120 70 160 Z'],
        crown: PREMOLAR_CROWN,
        neck: 'M28 144 C36 137 64 137 72 144',
        fissures: ['M33 211 Q50 202 67 211'],
        cusps: [
          [38, 213, 7],
          [62, 213, 7],
        ],
        shine: [37, 179, 9, 22, -8],
        spread: 27,
      };
    case 'CANINE':
      return {
        roots: ['M31 158 C28 112 30 58 40 38 C44 30 56 30 60 38 C70 58 72 112 69 158 Z'],
        crown: CANINE_CROWN,
        neck: 'M30 142 C37 135 63 135 70 142',
        // The two ridges running off the cusp tip — what makes a canine read as
        // a canine rather than a fat incisor.
        fissures: ['M50 232 L38 206', 'M50 232 L62 206'],
        incisal: 'M39 224 L50 234 L61 224',
        cusps: [[50, 228, 7]],
        shine: [38, 181, 8, 24, -7],
        spread: 23,
      };
    case 'INCISOR':
      return {
        // Base as wide as the crown's neck. Any narrower and the crown reads as
        // a separate capsule perched on a stick.
        roots: ['M26 158 C24 118 30 68 40 50 C44 43 56 43 60 50 C70 68 76 118 74 158 Z'],
        crown: INCISOR_CROWN,
        neck: 'M24 140 C35 132 65 132 76 140',
        fissures: [],
        // The two developmental grooves that divide a young incisor's face into
        // three lobes. Faint, but they are why a real incisor is not a slab.
        lobes: ['M38 158 Q36 198 39 226', 'M62 158 Q64 198 61 226'],
        incisal: 'M29 227 Q50 233 71 227',
        cusps: [],
        shine: [36, 178, 10, 26, -6],
        spread: 25,
      };
  }
}

/** Five drawings cover the mouth: molars differ by arch, the rest do not. */
type Variant = { shape: ToothShape; upper: boolean; key: string };

const VARIANTS: Variant[] = [
  { shape: 'INCISOR', upper: true, key: 'incisor' },
  { shape: 'CANINE', upper: true, key: 'canine' },
  { shape: 'PREMOLAR', upper: true, key: 'premolar' },
  { shape: 'MOLAR', upper: true, key: 'molar-u' },
  { shape: 'MOLAR', upper: false, key: 'molar-l' },
];

function variantKey(toothNum: number): string {
  const shape = toothShape(toothNum);
  if (shape !== 'MOLAR') return shape.toLowerCase();
  return isUpperArch(toothNum) ? 'molar-u' : 'molar-l';
}

/**
 * Where on the crown each surface is marked. Only one face of a tooth can point
 * at the reader, so mesial and distal are shown at the edges and lingual up at
 * the neck — a convention, but a legible one, and the wheel underneath is what
 * makes the answer exact.
 */
function markAt(
  surface: ToothSurface,
  toothNum: number,
  spread: number,
): { cx: number; cy: number; r: number } {
  const outward = spread * 0.78;
  const mesialIsRight = isRightSide(toothNum);

  switch (surface) {
    case 'O':
      return { cx: 50, cy: 217, r: spread * 0.62 };
    case 'B':
      return { cx: 50, cy: 184, r: spread * 0.7 };
    case 'L':
      return { cx: 50, cy: 150, r: spread * 0.58 };
    case 'M':
      return { cx: mesialIsRight ? 50 + outward : 50 - outward, cy: 190, r: spread * 0.55 };
    case 'D':
      return { cx: mesialIsRight ? 50 - outward : 50 + outward, cy: 190, r: spread * 0.55 };
  }
}

export function ToothGlyph({
  toothNum,
  surfaces = [],
  whole = false,
  className,
}: {
  toothNum: number;
  /** Surfaces to mark. Empty with `whole` set marks the entire crown. */
  surfaces?: ToothSurface[];
  /** The work covers the tooth itself — a crown, an implant, an extraction. */
  whole?: boolean;
  className?: string;
}) {
  const upper = isUpperArch(toothNum);
  const key = variantKey(toothNum);
  const { spread } = silhouette(toothShape(toothNum), upper);

  return (
    <svg
      viewBox={`0 0 100 ${VIEW_HEIGHT}`}
      className={cn('h-full w-full overflow-visible', className)}
      aria-hidden
    >
      <g transform={upper ? undefined : FLIP}>
        <use href={`#lt-form-${key}`} />

        {whole ? (
          // Clipped to the tooth rather than painted over the crown alone: a
          // crown or an extraction is not a job on the biting surface.
          <g clipPath={`url(#lt-clip-${key})`}>
            <rect x="0" y="0" width="100" height={VIEW_HEIGHT} fill="url(#lt-mark-flood)" />
          </g>
        ) : (
          surfaces.map((surface) => {
            const { cx, cy, r } = markAt(surface, toothNum, spread);
            return <circle key={surface} cx={cx} cy={cy} r={r} fill="url(#lt-mark)" />;
          })
        )}
      </g>
    </svg>
  );
}

/** One fully shaded tooth, built once and pointed at by every instance. */
function ToothForm({ variant }: { variant: Variant }) {
  const { roots, crown, neck, fissures, lobes, incisal, cusps, shine } = silhouette(
    variant.shape,
    variant.upper,
  );
  const [shineX, shineY, shineRx, shineRy, shineRotate] = shine;

  return (
    <g id={`lt-form-${variant.key}`}>
      {/* Roots complete — fill *and* outline — before the crown goes on top of
          them. Outlining them afterwards draws each root's flat bottom edge
          straight across the crown, which reads as a dark line at the neck. */}
      {roots.map((d) => (
        <g key={d}>
          <path d={d} fill="url(#lt-root)" />
          <path d={d} fill="none" stroke="#a2854f" strokeOpacity="0.3" strokeWidth="1.1" />
        </g>
      ))}
      <path d={crown} fill="url(#lt-enamel)" />

      {/* Everything below is painted broadly and blurred, then cut back to the
          tooth's own outline. Shading that follows the silhouette is what
          separates a rendered form from a shape with a gradient on it. */}
      <g clipPath={`url(#lt-clip-${variant.key})`}>
        {/* Dentin, warmer and duller, showing through the enamel. */}
        <ellipse cx="50" cy="190" rx="23" ry="30" fill="#e5d0a4" opacity="0.22" filter="url(#lt-soft)" />

        {/* The form shadow: the outline itself, thickened and blurred, so every
            edge turns away from the light instead of stopping flat. */}
        <path d={crown} fill="none" stroke="#6d5326" strokeWidth="12" opacity="0.3" filter="url(#lt-soft)" />
        {roots.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#6d5326"
            strokeWidth="11"
            opacity="0.3"
            filter="url(#lt-soft)"
          />
        ))}

        {/* The gum line, where the crown casts back onto the root. */}
        <path d={neck} fill="none" stroke="#7d6230" strokeWidth="8" opacity="0.18" filter="url(#lt-soft)" />

        {/* Enamel with no dentin behind it: the biting edge of a front tooth
            goes cool and slightly grey. Nothing else reads as enamel. */}
        {incisal ? (
          <path
            d={incisal}
            fill="none"
            stroke="#aebecb"
            strokeWidth="13"
            strokeLinecap="round"
            opacity="0.5"
            filter="url(#lt-soft)"
          />
        ) : null}

        {cusps.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#fffdf6" opacity="0.5" filter="url(#lt-soft)" />
        ))}

        {fissures.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#7d6027"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.42"
            filter="url(#lt-crisp)"
          />
        ))}

        {lobes?.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#a08654"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.2"
            filter="url(#lt-soft)"
          />
        ))}

        <ellipse
          cx={shineX}
          cy={shineY}
          rx={shineRx}
          ry={shineRy}
          fill="#ffffff"
          opacity="0.72"
          filter="url(#lt-soft)"
          transform={`rotate(${shineRotate} ${shineX} ${shineY})`}
        />
        <ellipse
          cx={shineX + 1}
          cy={shineY - 6}
          rx={shineRx * 0.34}
          ry={shineRy * 0.42}
          fill="#ffffff"
          opacity="0.6"
          filter="url(#lt-crisp)"
          transform={`rotate(${shineRotate} ${shineX} ${shineY})`}
        />
      </g>

      <path d={crown} fill="none" stroke="#8a7146" strokeOpacity="0.45" strokeWidth="1.3" strokeLinejoin="round" />
    </g>
  );
}

/**
 * The shared drawings and paint. Rendered once by the chart — every
 * `ToothGlyph` on the page points into this by id, which browsers resolve
 * document-wide, the same way an icon sprite works.
 */
export function ToothDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        {/* Regions in user space, covering the whole tooth, rather than as a
            percentage of each element's own box. A percentage region is a trap
            here: the gum line is a wide, almost flat path, so its box is a few
            units tall and 150% of nothing still clips the blur — which shows up
            as a hard-edged rectangle straight across the neck. */}
        <filter id="lt-soft" filterUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="280">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="lt-crisp" filterUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="280">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>

        {/* Brightest across the belly, warmer at the neck, cooler and deeper at
            the biting edge — the way a real crown grades. */}
        <linearGradient id="lt-enamel" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#f4eddd" />
          <stop offset="38%" stopColor="#fdfaf3" />
          <stop offset="72%" stopColor="#f8f1e2" />
          <stop offset="92%" stopColor="#ece2cc" />
          <stop offset="100%" stopColor="#ddd1b5" />
        </linearGradient>

        {/* y=0 is the apex, y=1 where it meets the crown: dull at the tip,
            blending into enamel at the neck — but never *past* it. Taking the
            root lighter than the crown puts a bright strip across the neck,
            because the crown's top edge dips and leaves root showing above it. */}
        <linearGradient id="lt-root" x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#d5c096" />
          <stop offset="45%" stopColor="#e6d7b4" />
          <stop offset="100%" stopColor="#eee3ca" />
        </linearGradient>

        <radialGradient id="lt-mark" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ff3d00" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#ff5722" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ff7043" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="lt-mark-flood" cx="0.5" cy="0.6" r="0.66">
          <stop offset="0%" stopColor="#ff3d00" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ff5722" stopOpacity="0.12" />
        </radialGradient>

        {VARIANTS.map((variant) => {
          const { crown, roots } = silhouette(variant.shape, variant.upper);
          return (
            <clipPath key={variant.key} id={`lt-clip-${variant.key}`}>
              <path d={crown} />
              {roots.map((d) => (
                <path key={d} d={d} />
              ))}
            </clipPath>
          );
        })}

        {VARIANTS.map((variant) => (
          <ToothForm key={variant.key} variant={variant} />
        ))}
      </defs>
    </svg>
  );
}
