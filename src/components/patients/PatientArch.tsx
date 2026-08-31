import { TOOTH_PHOTOS, ToothPhoto } from '@/components/dental/ToothPhoto';
import {
  isRightSide,
  isUpperArch,
  PERMANENT_LOWER_LEFT,
  PERMANENT_LOWER_RIGHT,
  PERMANENT_UPPER_LEFT,
  PERMANENT_UPPER_RIGHT,
  toothKind,
  TOOTH_STATUS_STYLE,
  type ToothStatus,
} from '@/lib/teeth';

/**
 * Both arches, photographed, with a number pinned on the teeth being talked
 * about.
 *
 * This is the one drawing in the app aimed at the person in the chair rather
 * than the person holding the probe, and every decision in it follows from
 * that. `DentalChart` is an instrument: thirty-two cells, FDI numbers, a
 * five-surface target under each tooth, eight statuses in a legend. Turn that
 * screen round and the patient reads a spreadsheet of their own mouth. What
 * they need is the opposite — a picture of teeth, with *this many* of them
 * marked, and a sentence each.
 *
 * **Which is why the photographs are right here and wrong on the chart.**
 * `ToothPhoto` spells out at length why the stock artwork cannot be the
 * odontogram: no findings can be drawn into a bitmap, no primary teeth exist in
 * the set, and the poster's proportions are a poster's. Only the last of those
 * even applies to a picture nothing is recorded on — and the pin sits *beside*
 * the tooth rather than being painted into it, which is the whole reason this
 * works where a photographic chart does not.
 *
 * **Nothing here is clickable and nothing here is a record.** The list beside
 * it is the content; this is the illustration that tells the patient where to
 * look. That division is what keeps it honest about the teeth it cannot draw —
 * see `PatientView` on the primary ones.
 */

/** Outermost tooth first, which is the order a quadrant is laid out in and the
 *  order the arch is read from either end towards the midline. */
const UPPER = [...PERMANENT_UPPER_RIGHT, ...PERMANENT_UPPER_LEFT];
const LOWER = [...PERMANENT_LOWER_RIGHT, ...PERMANENT_LOWER_LEFT];

/**
 * The curve, in the artwork's own pixels — the same four numbers `DentalArch`
 * uses on the storefront, and for the same reason.
 *
 * `DROP` is the whole effect: at zero this is a row of specimens on a poster,
 * and the arch is the only thing separating a mouth from a chart. `SPLAY` turns
 * each tooth to follow it so the roots fan the way they do in a jaw.
 *
 * Gentler here than on the front page, which runs `DROP` at 237. That band is
 * an ornament a metre wide with nothing else in it; this one has to sit above a
 * list and stay legible on a laptop, and a deep curve at this size throws the
 * front teeth so far down the arch reads as a grin rather than as anatomy.
 *
 * `HEAD` and `FOOT` are the air above the highest root and below the lowest
 * crown, and they are tighter than the storefront's for the same reason. There
 * they stop a rotated molar's corner clipping an ornament that bleeds off the
 * page; here they are also the gap between the two arches, and every unit of
 * slack is a unit of navy between a patient and the list naming their teeth.
 * Both still clear the `SPLAY` rotation, which lifts an outer molar's corner
 * about twenty-five units past its own box.
 */
const DROP = 135;
const SPLAY = 14;
const HEAD = 74;
const FOOT = 44;

type Placed = {
  toothNum: number;
  left: number;
  span: number;
  top: number;
  angle: number;
};

/**
 * One arch, resolved once at module load.
 *
 * Positions come out as percentages of the container and the container's aspect
 * ratio is computed from the same totals, so the arch is one shape that scales
 * rather than sixteen elements that have to be kept in step. No layout
 * arithmetic is left at render time.
 *
 * **Laid out by width, never by an equal share.** The sixteen files came off
 * one poster at one scale, so a first molar really is 257 wide where a central
 * incisor is 179 — `ToothPhoto` documents that as load bearing. The obvious
 * `flex-1` would make every tooth the same width, which is both wrong for a
 * mouth and the exact tell that gives a diagram away.
 */
function layout(teeth: readonly number[], upper: boolean) {
  const arch = upper ? 'upper' : 'lower';
  const widthOf = (toothNum: number) => TOOTH_PHOTOS[arch][toothKind(toothNum)!].width;
  const heightOf = (toothNum: number) => TOOTH_PHOTOS[arch][toothKind(toothNum)!].height;

  const width = teeth.reduce((total, n) => total + widthOf(n), 0);
  const half = (teeth.length - 1) / 2;

  let x = 0;
  const placed = teeth.map((toothNum) => {
    // −1 at the patient's right third molar, 0 at the midline, +1 at the left.
    const t = (teeth.indexOf(toothNum) - half) / half;
    // A parabola rather than an arc: the midline sits `DROP` low on the upper
    // arch and the ends come back to zero, which is the shape of the smile
    // line. A real arch is flatter across the front than a circle is.
    //
    // The lower arch is that curve turned over. Its crowns are at the top of
    // the file where the upper's are at the bottom, so leaving the two the same
    // would splay the lower one's *roots* towards the midline and put the two
    // rows of crowns further apart in the middle than at the molars — which is
    // the one place in a mouth they actually meet.
    const top = upper ? HEAD + DROP * (1 - t * t) : HEAD + DROP * t * t;
    const tooth = {
      toothNum,
      left: (x / width) * 100,
      span: (widthOf(toothNum) / width) * 100,
      top,
      // Tangent to the parabola, near enough — linear in `t`, exact at the
      // midline and about half a degree out at the molars, well under what the
      // eye reads on a tooth this size. Negated for the lower arch along with
      // the curve, for the same reason.
      angle: (upper ? -SPLAY : SPLAY) * t,
      foot: top + heightOf(toothNum),
    };
    x += widthOf(toothNum);
    return tooth;
  });

  // Measured rather than assumed: the lowest point is a fact about this
  // artwork, so replacing the files should move the box rather than crop them.
  const height = Math.max(...placed.map((tooth) => tooth.foot)) + FOOT;

  return {
    width,
    height,
    // `top` only becomes a percentage once the box it is a fraction *of* is
    // known, which is why this is a second pass rather than one.
    teeth: placed.map(
      (tooth): Placed => ({
        toothNum: tooth.toothNum,
        left: tooth.left,
        span: tooth.span,
        angle: tooth.angle,
        top: (tooth.top / height) * 100,
      }),
    ),
  };
}

const ARCHES = { upper: layout(UPPER, true), lower: layout(LOWER, false) };

/**
 * Where the pin goes, as a fraction down the tooth's own box.
 *
 * On the crown, which means the *bottom* of an upper tooth and the top of a
 * lower one — the files are drawn with the roots pointing away from the bite in
 * both arches. Pinning at a fixed fraction of the box rather than at the crown
 * edge keeps every marker on one line across the arch, which is what makes
 * three of them read as three of a set rather than as scattered dots.
 */
const PIN_UPPER = 0.82;
const PIN_LOWER = 0.2;

export type ArchMark = { toothNum: number; index: number; status: ToothStatus };

export function PatientArch({
  marks,
  label,
}: {
  /** Only the permanent teeth; `PatientView` keeps the primary ones in the
   *  list, because there is no artwork here to pin them to. */
  marks: readonly ArchMark[];
  /** Named for a screen reader, since the picture itself carries no text. */
  label: string;
}) {
  const byTooth = new Map(marks.map((mark) => [mark.toothNum, mark]));

  return (
    <figure aria-label={label} className="mx-auto w-full max-w-5xl space-y-2">
      {(['upper', 'lower'] as const).map((arch) => {
        const geometry = ARCHES[arch];
        return (
          <div
            key={arch}
            className="relative w-full"
            style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }}
          >
            {geometry.teeth.map((tooth) => {
              const mark = byTooth.get(tooth.toothNum);
              const kind = toothKind(tooth.toothNum)!;
              return (
                <span
                  key={tooth.toothNum}
                  className="absolute"
                  style={{
                    left: `${tooth.left}%`,
                    width: `${tooth.span}%`,
                    top: `${tooth.top}%`,
                    transform: `rotate(${tooth.angle}deg)`,
                  }}
                >
                  {/* The rotation is on this wrapper rather than on the image so
                      it composes with the mirror `ToothPhoto` applies to the
                      patient's left: an inline transform on the image itself
                      would replace the `-scale-x-100` class outright and quietly
                      un-mirror half of both arches. */}
                  <ToothPhoto
                    kind={kind}
                    arch={isUpperArch(tooth.toothNum) ? 'upper' : 'lower'}
                    side={isRightSide(tooth.toothNum) ? 'right' : 'left'}
                    className="w-full"
                  />

                  {mark ? (
                    // Counter-rotated, so a marker on a molar at the end of the
                    // arch is still upright. A number that leans with the tooth
                    // is the difference between a label and a sticker.
                    <span
                      aria-hidden
                      // The centring is left to the `translate` utilities and
                      // the inline style carries the rotation *only*, which is
                      // not a style choice — Tailwind v4 compiles
                      // `-translate-x-1/2` to the independent `translate`
                      // property rather than into `transform`. The two compose
                      // instead of one overriding the other, so an inline
                      // `transform: translate(-50%,-50%) rotate(…)` here moved
                      // every pin half its own width off its tooth: once from
                      // the class, once from the style. The bug is invisible on
                      // a big element and glaring on a 38px circle sitting on a
                      // 60px tooth, which is what this is.
                      className="absolute left-1/2 grid size-[1.9rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[0.95rem] font-bold text-white ring-[3px] ring-navy sm:size-9 sm:text-[1.1rem]"
                      style={{
                        top: `${(arch === 'upper' ? PIN_UPPER : PIN_LOWER) * 100}%`,
                        transform: `rotate(${-tooth.angle}deg)`,
                        backgroundColor: TOOTH_STATUS_STYLE[mark.status].hue,
                      }}
                    >
                      {mark.index}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        );
      })}
    </figure>
  );
}
