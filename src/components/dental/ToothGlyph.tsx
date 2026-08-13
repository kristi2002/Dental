import {
  isRightSide,
  isUpperArch,
  toothShape,
  type ToothShape,
  type ToothStatus,
  type ToothSurface,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * A tooth rendered rather than drawn — and rendered *in the state it is in*.
 *
 * The chart is the one screen where the picture **is** the interface: a dentist
 * reads "which tooth, which face of it, and what is wrong with it" off the
 * shape, and a grid of numbered squares makes them count along the row to find
 * out. So each tooth is modelled as itself and then the finding is drawn *as the
 * thing it is*, not as a coloured dot on top of it:
 *
 *   caries      a dark cavity eaten into the enamel, on the faces recorded
 *   filled      a restoration, metallic and lit, sitting in the tooth
 *   crown       a gold cap over the whole crown, with a rim at the neck
 *   root canal  the canals filled down each root, and the access cavity sealed
 *   implant     a titanium screw where the roots were, carrying a ceramic crown
 *   extracted   the tooth ghosted, struck through
 *   missing     the outline only — the tooth that never came
 *
 * Two things make it read as a photograph of a tooth rather than a clipart one:
 *
 *  - **The silhouettes are the real outlines, at their real relative sizes.** A
 *    molar's buccal view is two cusps with the buccal groove notched between
 *    them, on a crown a third wider than an incisor's; a premolar comes to one
 *    point; a canine's root is the longest in the mouth. A row of same-sized
 *    lozenges is the single loudest tell that a chart was drawn rather than
 *    observed, and getting the widths right fixes it before any shading lands.
 *  - **Every tooth is lit from one place** — above and to the left. Enamel is
 *    glassy, so what sells it is the value range: a warm dentin core glowing
 *    through, the silhouette thickened into a form shadow so each edge turns
 *    away, a bounce rim down the shadow side, and a hard little specular. Flat
 *    fills with an outline look like a diagram no matter how correct they are.
 *
 * There are only five distinct silhouettes (four shapes, and molars differ by
 * arch), so each is built once in `ToothDefs` and every tooth on the page is a
 * `<use>` of one. That is what pays for shading this deep: the layers are
 * authored once, and the whole page costs five drawings plus thirty-two
 * references. The soft passes are also grouped so each tooth blurs three times
 * rather than once per layer.
 */

/**
 * The band the drawing lives in: roots up at `y`, biting edge down at `y + h`,
 * the crown's facial width across `x`. Cropped close, because a tooth is a long
 * thin thing and the padding a square viewBox adds is padding the cell cannot
 * spare.
 */
const VIEW = { x: 6, y: 24, w: 88, h: 222 };

/**
 * The lower arch is the same drawing stood on its head — mirrored about the
 * centre of the band, so a flipped tooth lands exactly where an upright one
 * does. The shading goes with it, which is right: on both arches the crown stays
 * the lit end and the root the dull one, which is what the eye actually reads.
 */
const FLIP = `translate(0, ${VIEW.y * 2 + VIEW.h}) scale(1, -1)`;

type Silhouette = {
  /** Drawn back to front — a palatal root belongs behind the buccal pair. */
  roots: string[];
  crown: string;
  /** The crown's cervical edge alone, shaded into the gum line. */
  neck: string;
  /** Developmental grooves: the buccal groove of a molar, the depressions
   *  flanking a premolar's ridge, the divisions between an incisor's lobes.
   *  Cut into the surface, so they are drawn dark. */
  grooves: string[];
  /** Ridges standing proud of the surface, so they catch the light. */
  ridges: string[];
  /** The translucent biting edge — enamel with no dentin behind it, which goes
   *  cool and slightly grey. Anterior teeth only. */
  incisal?: string;
  /** Cusps and lobes, which round up towards the light individually. */
  cusps: Array<[number, number, number]>;
  /** The dentin body glowing through the enamel, as [cx, cy, rx, ry]. */
  core: [number, number, number, number];
  /** The main specular, as [cx, cy, rx, ry, rotation]. */
  shine: [number, number, number, number, number];
  /** How far the crown's widest point reaches, for sizing the marks. */
  spread: number;
  /** Centre line of each root, in root order: the canal for endodontics, and
   *  the highlight that turns each root into a cylinder. */
  canals: string[];
};

/* A tooth is one form, not a box with spikes on it. Each crown is therefore
 * drawn narrower at the neck than at its contact points, and each root starts
 * *inside* the crown — the overlap is what hides the join and makes the two read
 * as one carved thing. */

/**
 * A molar from the cheek side: widest of the four, and the only one whose
 * biting edge is not a single form — two buccal cusps with the buccal groove
 * notched between them. That notch is what says "molar" at thumbnail size.
 */
const MOLAR_CROWN =
  'M25 158 C16 174 11 194 12 208 C12 219 15 227 20 231 C25 236 30 239 34 236 ' +
  'C40 232 44 226 50 224 C56 226 60 232 66 236 C70 239 75 236 80 231 ' +
  'C85 227 88 219 88 208 C89 194 84 174 75 158 C66 151 34 151 25 158 Z';

/** One buccal cusp, so the crown comes to a point on the midline. */
const PREMOLAR_CROWN =
  'M29 162 C23 180 21 200 23 212 C25 222 28 228 32 231 C37 233 43 236 47 240 ' +
  'C48.5 241.5 51.5 241.5 53 240 C57 236 63 233 68 231 C72 228 75 222 77 212 ' +
  'C79 200 77 180 71 162 C63 155 37 155 29 162 Z';

/** The same point, sharper and longer — a canine's crown is the tallest. */
const CANINE_CROWN =
  'M30 142 C25 164 23 192 26 210 C27.5 219 29 224 31 227 C36 231 45 237 48 241 ' +
  'C49 242 51 242 52 241 C55 237 64 231 69 227 C71 224 72.5 219 74 210 ' +
  'C77 192 75 164 70 142 C61 135 39 135 30 142 Z';

/** A chisel: the incisal edge is straight across, and the crown tapers to the
 *  neck rather than bulging, which is what keeps it from reading as a premolar. */
const INCISOR_CROWN =
  'M28 146 C23 166 21 194 23 213 C24 224 27 231 33 233 C40 234.5 60 234.5 67 233 ' +
  'C73 231 76 224 77 213 C79 194 77 166 72 146 C63 139 37 139 28 146 Z';

/**
 * Roots taper the whole way — narrow at the neck already and finer at every
 * millimetre after it. A root drawn at a constant width is the other loud tell
 * of a diagram: it turns the tooth into a lollipop on a plank, and no amount of
 * shading recovers from it.
 *
 * Upper molars carry three, lower molars two. Drawing both with three is the
 * single most obvious way to get a dental illustration wrong. The three overlap
 * for the first few millimetres, because a real furcation starts below the neck
 * and not at it.
 */
const UPPER_MOLAR_ROOTS = [
  'M35 172 C34 152 35 116 42 88 C45 76 55 76 58 88 C65 116 66 152 65 172 Z', // palatal, behind
  'M13 172 C10 152 12 116 19 86 C22 74 30 75 33 88 C37 116 41 152 45 172 Z', // mesiobuccal
  'M87 172 C90 152 88 116 81 86 C78 74 70 75 67 88 C63 116 59 152 55 172 Z', // distobuccal
];

const LOWER_MOLAR_ROOTS = [
  'M17 172 C14 150 16 112 26 84 C29 72 37 73 40 86 C44 116 50 150 54 172 Z',
  'M83 172 C86 150 84 112 74 84 C71 72 63 73 60 86 C56 116 50 150 46 172 Z',
];

function silhouette(shape: ToothShape, upper: boolean): Silhouette {
  switch (shape) {
    case 'MOLAR':
      return {
        roots: upper ? UPPER_MOLAR_ROOTS : LOWER_MOLAR_ROOTS,
        crown: MOLAR_CROWN,
        neck: 'M25 158 C34 151 66 151 75 158',
        grooves: ['M50 224 C50 214 49 206 49 198'],
        ridges: [
          'M33 235 C33 222 33 208 34 194',
          'M67 235 C67 222 67 208 66 194',
        ],
        cusps: [
          [33, 229, 12],
          [67, 229, 12],
        ],
        core: [50, 198, 26, 32],
        shine: [30, 192, 13, 26, -8],
        spread: 32,
        canals: upper
          ? ['M50 164 L50 92', 'M27 164 L24 92', 'M73 164 L76 92']
          : ['M34 164 L31 90', 'M66 164 L69 90'],
      };
    case 'PREMOLAR':
      return {
        roots: ['M31 166 C33 138 35 102 41 72 C44 58 56 58 59 72 C65 102 67 138 69 166 Z'],
        crown: PREMOLAR_CROWN,
        neck: 'M29 162 C37 155 63 155 71 162',
        grooves: [
          'M38 226 C38 214 38 204 39 194',
          'M62 226 C62 214 62 204 61 194',
        ],
        ridges: ['M50 237 C50 220 50 206 50 188'],
        cusps: [[50, 231, 13]],
        core: [50, 198, 20, 30],
        shine: [35, 192, 11, 26, -7],
        spread: 26,
        canals: ['M50 162 L50 60'],
      };
    case 'CANINE':
      return {
        roots: ['M31 148 C33 118 35 78 41 50 C44 36 56 36 59 50 C65 78 67 118 69 148 Z'],
        crown: CANINE_CROWN,
        neck: 'M30 142 C39 135 61 135 70 142',
        grooves: [
          'M37 218 C36 204 36 192 37 178',
          'M63 218 C64 204 64 192 63 178',
        ],
        // The labial ridge running off the cusp tip — what makes a canine read
        // as a canine rather than a fat incisor.
        ridges: ['M50 238 C50 220 50 200 50 182'],
        incisal: 'M34 224 C40 230 60 230 66 224',
        cusps: [[50, 232, 11]],
        core: [50, 190, 18, 32],
        shine: [34, 184, 10, 28, -6],
        spread: 24,
        canals: ['M50 146 L50 42'],
      };
    case 'INCISOR':
      return {
        roots: ['M30 156 C32 130 34 96 40 66 C43 52 57 52 60 66 C66 96 68 130 70 156 Z'],
        crown: INCISOR_CROWN,
        neck: 'M28 146 C37 139 63 139 72 146',
        // The two developmental grooves that divide a young incisor's face into
        // three lobes. Faint, but they are why a real incisor is not a slab.
        grooves: [
          'M38 166 C36 194 37 214 38 228',
          'M62 166 C64 194 63 214 62 228',
        ],
        ridges: [],
        incisal: 'M30 226 C40 231 60 231 70 226',
        // The mamelons themselves, rounding up between those grooves.
        cusps: [
          [31, 212, 9],
          [50, 214, 10],
          [69, 212, 9],
        ],
        core: [50, 190, 19, 32],
        shine: [35, 186, 11, 30, -5],
        spread: 25,
        canals: ['M50 152 L50 58'],
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
 * The faces a surface-borne finding covers when none was recorded.
 *
 * Not all five: the lingual mark sits up at the neck, and painting it as well
 * leaves the tooth solid-red from root to biting edge, which says "the whole
 * tooth is gone" rather than "somebody did not write down where".
 */
const DEFAULT_FACES: readonly ToothSurface[] = ['O', 'B', 'M', 'D'];

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
      return { cx: 50, cy: 194, r: spread * 0.7 };
    case 'L':
      return { cx: 50, cy: 172, r: spread * 0.58 };
    case 'M':
      return { cx: mesialIsRight ? 50 + outward : 50 - outward, cy: 198, r: spread * 0.55 };
    case 'D':
      return { cx: mesialIsRight ? 50 - outward : 50 + outward, cy: 198, r: spread * 0.55 };
  }
}

export function ToothGlyph({
  toothNum,
  status = 'HEALTHY',
  surfaces = [],
  className,
}: {
  toothNum: number;
  /** What is recorded on this tooth. Decides how the whole glyph is drawn. */
  status?: ToothStatus;
  /** Surfaces to mark, for the statuses where a surface makes sense. */
  surfaces?: ToothSurface[];
  className?: string;
}) {
  const upper = isUpperArch(toothNum);
  const key = variantKey(toothNum);
  const shape = toothShape(toothNum);
  const { spread, crown, canals, roots } = silhouette(shape, upper);

  // A restoration and a cavity are drawn as opposite materials, and a
  // root-treated tooth whose surfaces were also restored is both at once.
  const restorative = status === 'FILLED' || status === 'ROOT_CANAL';

  const patches: readonly ToothSurface[] =
    status === 'CARIES' || status === 'FILLED'
      ? // A finding with no surface recorded still has to be visible — it covers
        // the crown rather than leaving a flagged tooth looking untouched.
        surfaces.length > 0
        ? surfaces
        : DEFAULT_FACES
      : status === 'ROOT_CANAL'
        ? // Only what was actually written down: the filled canals already say
          // the tooth was treated, so nothing has to be invented on top.
          surfaces
        : [];

  const flip = upper ? undefined : FLIP;

  // Everything made of a material — the tooth and whatever has been done to it.
  // It all goes under the one light, so a gold cap and an amalgam are lit by the
  // same lamp as the enamel around them rather than sitting on top as decals.
  const body = (
    <g transform={flip}>
      <use href={status === 'IMPLANT' ? `#lt-implant-${key}` : `#lt-form-${key}`} />

      {/* Endodontics: the canals obturated down each root, and the access
            cavity sealed on top. Drawn under the crown work, so a root-treated
            tooth that then took a crown reads as both. */}
        {status === 'ROOT_CANAL' ? (
          <g clipPath={`url(#lt-clip-${key})`}>
            {canals.map((d) => (
              <g key={d}>
                <path
                  d={d}
                  fill="none"
                  stroke="#5B21B6"
                  strokeWidth="7"
                  strokeLinecap="round"
                  opacity="0.85"
                />
                <path
                  d={d}
                  fill="none"
                  stroke="#C4B5FD"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </g>
            ))}
            <circle cx="50" cy="216" r={spread * 0.5} fill="url(#lt-endo-access)" />
          </g>
        ) : null}

        {/* A cap, not a colour: gold over the crown only, stopping at the neck
            where a real one does. */}
        {status === 'CROWN' ? (
          <g clipPath={`url(#lt-crown-clip-${key})`}>
            <path d={crown} fill="url(#lt-gold)" />
            <path
              d={crown}
              fill="none"
              stroke="#FDE68A"
              strokeWidth="3"
              opacity="0.55"
              transform="translate(2.5 -2)"
            />
            <path d={crown} fill="none" stroke="#92400E" strokeWidth="1.6" opacity="0.7" />
          </g>
        ) : null}

        {patches.map((surface) => {
          const { cx, cy, r } = markAt(surface, toothNum, spread);
          if (restorative) {
            return (
              <g key={surface} clipPath={`url(#lt-clip-${key})`}>
                {/* A restoration is a solid body set *into* the tooth: a dark
                    seam where it meets enamel, a lit face, one specular. */}
                <circle cx={cx} cy={cy} r={r} fill="url(#lt-amalgam)" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#0C4A6E"
                  strokeWidth="1.8"
                  opacity="0.75"
                />
                <ellipse
                  cx={cx - r * 0.3}
                  cy={cy - r * 0.35}
                  rx={r * 0.34}
                  ry={r * 0.24}
                  fill="#F0F9FF"
                  opacity="0.75"
                  filter="url(#lt-crisp)"
                />
              </g>
            );
          }

          // Caries: a hole, so it is darkest in the middle and fades into the
          // enamel around it rather than stopping at a rim.
          return (
            <g key={surface} clipPath={`url(#lt-clip-${key})`}>
              <circle cx={cx} cy={cy} r={r * 1.15} fill="url(#lt-caries-halo)" />
              <circle cx={cx} cy={cy} r={r * 0.72} fill="url(#lt-caries)" />
            </g>
          );
        })}
    </g>
  );

  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      className={cn('h-full w-full overflow-visible', className)}
      aria-hidden
    >
      {status === 'MISSING' ? (
        // Never erupted, or long gone: the shape of the gap, not a tooth. No
        // light on it either — there is no surface there to catch any.
        <g transform={flip}>
          <path
            d={crown}
            fill="#f1f5f9"
            fillOpacity="0.5"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeDasharray="7 6"
            strokeLinejoin="round"
          />
          {roots.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#94A3B8"
              strokeWidth="1.6"
              strokeDasharray="5 7"
              opacity="0.6"
            />
          ))}
        </g>
      ) : (
        // The lamp sits outside the flip, so both arches are lit from the same
        // corner of the screen. Inside it, the lower arch would be lit from
        // below — which is the one thing that would give the trick away.
        <g filter="url(#lt-relief)" opacity={status === 'EXTRACTED' ? 0.32 : undefined}>
          {body}
        </g>
      )}

      {/* Struck through, over everything, because the point of the mark is that
          there is nothing left to read underneath it — and flat, because it is
          notation rather than a thing in the mouth. */}
      {status === 'EXTRACTED' ? (
        <g
          transform={flip}
          stroke="#475569"
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.9"
        >
          <path d="M24 152 L76 234" />
          <path d="M76 152 L24 234" />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * One fully modelled tooth, built once and pointed at by every instance.
 *
 * The order is the order a painter would work in: roots finished before the
 * crown lands on them, then the crown flooded with enamel and everything after
 * it painted broadly and blurred, cut back to the tooth's own outline. Shading
 * that follows the silhouette is what separates a rendered form from a shape
 * with a gradient on it.
 */
function ToothForm({ variant }: { variant: Variant }) {
  const { roots, crown, neck, grooves, ridges, incisal, cusps, core, shine } = silhouette(
    variant.shape,
    variant.upper,
  );
  const [shineX, shineY, shineRx, shineRy, shineRotate] = shine;
  const [coreX, coreY, coreRx, coreRy] = core;
  const shineTransform = `rotate(${shineRotate} ${shineX} ${shineY})`;

  return (
    <g id={`lt-form-${variant.key}`}>
      {/* Roots and crown are laid down as *materials* only — cementum and
          enamel, flat but for their own gradients. Nothing here tries to make
          them look round; that is the light's job, one level up, and painting
          the form twice only muddies it. */}
      {roots.map((d) => (
        <path key={d} d={d} fill="url(#lt-root)" />
      ))}
      {/* The one shadow the height map cannot know about: crown and root are a
          single silhouette to it, so it has no way to see that the crown
          overhangs and casts down onto the neck. Without this they meet at a
          flat ledge and read as two pieces glued together. */}
      <g clipPath={`url(#lt-root-clip-${variant.key})`}>
        <g filter="url(#lt-soft)">
          <path d={neck} fill="none" stroke="#4c3813" strokeWidth="15" opacity="0.36" />
        </g>
      </g>

      <path d={crown} fill="url(#lt-enamel)" />

      {/* Two passes for the surface detail — what is *on* the enamel rather than
          what shape it is. Grouped, so each tooth costs two filter regions here
          rather than one per layer. */}
      <g clipPath={`url(#lt-crown-clip-${variant.key})`}>
        {/* Dentin, warmer and duller, glowing up through the enamel — the one
            thing that stops a white shape reading as plastic. A radial gradient
            rather than a blurred ellipse: same haze, no filter pass. */}
        <ellipse cx={coreX} cy={coreY} rx={coreRx} ry={coreRy} fill="url(#lt-dentin)" />

        <g filter="url(#lt-soft)">
          {/* The cervical third, sunk into the gum's shade. */}
          <path d={neck} fill="none" stroke="#5e4718" strokeWidth="16" opacity="0.3" />

          {/* Enamel with no dentin behind it: the biting edge of a front tooth
              goes cool and slightly grey. Nothing else reads as enamel. */}
          {incisal ? (
            <path
              d={incisal}
              fill="none"
              stroke="#a7b9c7"
              strokeWidth="11"
              strokeLinecap="round"
              opacity="0.34"
            />
          ) : null}

          {ridges.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#fffdf2"
              strokeWidth="10"
              strokeLinecap="round"
              opacity="0.34"
            />
          ))}

          {cusps.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#fffdf4" opacity="0.38" />
          ))}
        </g>

        <g filter="url(#lt-crisp)">
          {grooves.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#8a6b2e"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.2"
            />
          ))}

          {/* The hard little catchlight, placed rather than computed. The lit
              highlight above is broad by nature; this is the pin of light that
              says the surface is wet. */}
          <ellipse
            cx={shineX + 2}
            cy={shineY - 8}
            rx={shineRx * 0.28}
            ry={shineRy * 0.34}
            fill="#ffffff"
            opacity="0.5"
            transform={shineTransform}
          />
        </g>
      </g>

      {/* Barely there. Enamel transmits light at a thin edge, so a tooth has no
          drawn outline — this is only enough to keep the silhouette from
          dissolving into a white page. */}
      <path
        d={crown}
        fill="none"
        stroke="#8a7040"
        strokeOpacity="0.26"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** The implant fixture — shared by every variant, since a screw is a screw. */
const IMPLANT_BODY =
  'M37 134 C37 106 36 78 41 62 C43 54 57 54 59 62 C64 78 63 106 63 134 Z';

/**
 * A tooth replaced rather than repaired: a titanium screw in the bone, an
 * abutment at the gum line, a ceramic crown on top.
 *
 * The screw is the whole point of the drawing. Nothing else in dentistry looks
 * like it, so an implant is identifiable on a chart at thumbnail size — which a
 * tooth tinted teal is not.
 */
function ImplantForm({ variant }: { variant: Variant }) {
  const { crown } = silhouette(variant.shape, variant.upper);

  // Ten V-threads down the body, cut as chevrons rather than as flat rungs —
  // flat ones read as a ladder, which is not what a screw looks like.
  const threads = Array.from({ length: 10 }, (_, index) => {
    const y = 66 + index * 6.8;
    const inset = 2 + index * 0.5;
    return `M${38 + inset} ${y} L50 ${y + 4} L${62 - inset} ${y}`;
  });

  return (
    <g id={`lt-implant-${variant.key}`}>
      {/* Body: tapered, apex up, the way a root-form implant is seated. */}
      <path d={IMPLANT_BODY} fill="url(#lt-titanium)" />
      <g clipPath="url(#lt-implant-body)">
        {threads.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#0F766E"
            strokeWidth="2.4"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
        ))}
        <ellipse cx="43" cy="98" rx="5" ry="32" fill="#FFFFFF" opacity="0.45" filter="url(#lt-soft)" />
      </g>
      <path d={IMPLANT_BODY} fill="none" stroke="#115E59" strokeWidth="1.4" strokeOpacity="0.6" />

      {/* Abutment — the collar the crown is cemented onto. Long enough to show
          below every crown shape, since a canine's neck sits higher than a
          molar's. */}
      <path d="M39 130 L61 130 L57 164 L43 164 Z" fill="url(#lt-titanium)" />
      <path
        d="M39 130 L61 130 L57 164 L43 164 Z"
        fill="none"
        stroke="#115E59"
        strokeWidth="1.3"
        strokeOpacity="0.6"
      />

      {/* Ceramic crown: the right tooth's own silhouette, cooler and glassier
          than enamel — an implant crown is whiter than what it replaces. */}
      <path d={crown} fill="url(#lt-ceramic)" />
      {/* Only the tint that says "ceramic, not enamel" — the rounding arrives
          with the same light as everything else. */}
      <g clipPath={`url(#lt-crown-clip-${variant.key})`}>
        <g filter="url(#lt-soft)">
          <path d={crown} fill="none" stroke="#0F766E" strokeWidth="13" opacity="0.14" />
        </g>
      </g>
      <path
        d={crown}
        fill="none"
        stroke="#0F766E"
        strokeOpacity="0.5"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
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
        <filter id="lt-soft" filterUnits="userSpaceOnUse" x="-30" y="-20" width="160" height="300">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="lt-crisp" filterUnits="userSpaceOnUse" x="-30" y="-20" width="160" height="300">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>

        {/*
          The form itself, lit rather than painted.

          Blurring the silhouette's alpha turns it into a height map: flat across
          the belly, ramping down at every edge. Lighting that map gives a normal
          at every pixel, so the shading follows the outline exactly and for free
          — a molar's cusps, the constriction at the neck, each root rounding
          into a cylinder. Hand-painted shadows can approximate it; they cannot
          match it, because a stroked outline knows the edge but not the slope.

          `sRGB` interpolation is deliberate. The default, linearRGB, is more
          physically correct and looks washed out at these values — the specular
          in particular loses its bite.
        */}
        {/*
          Region cropped to the drawing rather than given the generous margin the
          blur filters get. Lighting is by far the most expensive thing on this
          page and it costs per pixel of filter region, so the margin is not free
          — and it buys nothing here, because the result is composited back
          `in` the silhouette and everything outside it is discarded anyway.
        */}
        <filter
          id="lt-relief"
          filterUnits="userSpaceOnUse"
          x={VIEW.x}
          y={VIEW.y - 2}
          width={VIEW.w}
          height={VIEW.h + 4}
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="lt-bump" />

          {/* The body turning away from the light. `diffuseConstant` is set to
              1/sin(elevation) so a surface facing straight at the viewer comes
              back at exactly white and multiplies to nothing — anything less and
              the whole tooth is dimmed rather than modelled. */}
          <feDiffuseLighting
            in="lt-bump"
            surfaceScale="6.5"
            diffuseConstant="1.22"
            lightingColor="#fffaf0"
            result="lt-diffuse"
          >
            <feDistantLight azimuth="228" elevation="55" />
          </feDiffuseLighting>
          <feComposite in="lt-diffuse" in2="SourceAlpha" operator="in" result="lt-diffuse-cut" />
          <feBlend in="SourceGraphic" in2="lt-diffuse-cut" mode="multiply" result="lt-shaded" />

          {/* And the gloss.
              The lamp is thrown well off to the side, and that placement is the
              whole trick. A height map from a blurred silhouette is flat across
              the middle and only slopes at the edges, so a light anywhere near
              the viewing axis returns the *same* near-maximum specular over the
              entire interior — the crown goes uniformly white and the shading
              underneath is lost. Off to the side, the flat middle falls to
              almost nothing and only the surfaces rolling over towards the lamp
              light up, which is where enamel actually shines. */}
          <feSpecularLighting
            in="lt-bump"
            surfaceScale="6.5"
            specularConstant="0.62"
            specularExponent="28"
            lightingColor="#ffffff"
            result="lt-spec"
          >
            <fePointLight x="-30" y="70" z="110" />
          </feSpecularLighting>
          <feComposite in="lt-spec" in2="SourceAlpha" operator="in" result="lt-spec-cut" />
          <feComposite
            in="lt-shaded"
            in2="lt-spec-cut"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
          />
        </filter>

        {/* Warm and dark at the neck where the gum shades it, brightest across
            the belly, cooling to grey at the biting edge where the enamel has
            no dentin behind it — the way a real crown grades from top to
            bottom. The left-to-right modelling is light, not paint, so it is
            done with the form shadow rather than baked in here. */}
        <linearGradient id="lt-enamel" x1="0.34" y1="0" x2="0.66" y2="1">
          <stop offset="0%" stopColor="#d8cdb0" />
          <stop offset="16%" stopColor="#f2ecdd" />
          <stop offset="42%" stopColor="#ffffff" />
          <stop offset="66%" stopColor="#fbf7ee" />
          <stop offset="86%" stopColor="#ece8dc" />
          <stop offset="100%" stopColor="#d6dbdc" />
        </linearGradient>

        {/* y=0 is the apex, y=1 where it meets the crown: dull at the tip,
            blending into enamel at the neck — but never *past* it. Taking the
            root lighter than the crown puts a bright strip across the neck,
            because the crown's cervical edge dips and leaves root showing. */}
        <linearGradient id="lt-root" x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#c2b08c" />
          <stop offset="30%" stopColor="#d6c7a3" />
          <stop offset="65%" stopColor="#e9dec2" />
          <stop offset="100%" stopColor="#f3ecda" />
        </linearGradient>

        {/* Gold, as metal: several bands rather than two stops, because what
            makes a surface read as metal is the sharp light-to-dark turn. */}
        <linearGradient id="lt-gold" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="26%" stopColor="#FBBF24" />
          <stop offset="52%" stopColor="#D97706" />
          <stop offset="74%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>

        {/* A filling: cool, dense, and lit from the same side as the enamel. */}
        <linearGradient id="lt-amalgam" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#BAE6FD" />
          <stop offset="35%" stopColor="#38BDF8" />
          <stop offset="70%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#075985" />
        </linearGradient>

        {/* The dentin body seen through the enamel: warm in the middle, gone by
            the edges. A gradient rather than a blurred shape, so the haze costs
            no filter pass. */}
        <radialGradient id="lt-dentin" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#d9b672" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#dcbc7e" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#e2c68f" stopOpacity="0" />
        </radialGradient>

        {/* Decay: black at the centre of the cavity, rusting out to the enamel. */}
        <radialGradient id="lt-caries" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#450A0A" />
          <stop offset="55%" stopColor="#9F1239" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#DC2626" stopOpacity="0.7" />
        </radialGradient>
        <radialGradient id="lt-caries-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="45%" stopColor="#B45309" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>

        {/* The sealed access cavity on a root-treated tooth. */}
        <radialGradient id="lt-endo-access" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#DDD6FE" />
          <stop offset="55%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#4C1D95" />
        </radialGradient>

        <linearGradient id="lt-titanium" x1="0.1" y1="0" x2="0.9" y2="0">
          <stop offset="0%" stopColor="#CCFBF1" />
          <stop offset="28%" stopColor="#5EEAD4" />
          <stop offset="58%" stopColor="#14B8A6" />
          <stop offset="82%" stopColor="#0F766E" />
          <stop offset="100%" stopColor="#134E4A" />
        </linearGradient>

        <linearGradient id="lt-ceramic" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#F8FAFC" />
          <stop offset="80%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>

        <clipPath id="lt-implant-body">
          <path d={IMPLANT_BODY} />
        </clipPath>

        {/* The whole tooth — for a finding, which can sit anywhere on it. */}
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

        {/* The crown alone — a cap stops at the neck, and a filling in the root
            is not a thing. */}
        {VARIANTS.map((variant) => (
          <clipPath key={variant.key} id={`lt-crown-clip-${variant.key}`}>
            <path d={silhouette(variant.shape, variant.upper).crown} />
          </clipPath>
        ))}

        {/* The roots alone, so their own shading stops where the crown starts
            instead of washing a dark band across the neck. */}
        {VARIANTS.map((variant) => (
          <clipPath key={variant.key} id={`lt-root-clip-${variant.key}`}>
            {silhouette(variant.shape, variant.upper).roots.map((d) => (
              <path key={d} d={d} />
            ))}
          </clipPath>
        ))}

        {VARIANTS.map((variant) => (
          <ToothForm key={variant.key} variant={variant} />
        ))}
        {VARIANTS.map((variant) => (
          <ImplantForm key={`implant-${variant.key}`} variant={variant} />
        ))}
      </defs>
    </svg>
  );
}
