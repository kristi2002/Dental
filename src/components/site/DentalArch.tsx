import { TOOTH_PHOTOS, ToothPhoto } from '@/components/dental/ToothPhoto';
import { Ambience } from '@/components/site/Ambience';
import { type ToothKind } from '@/lib/teeth';

/**
 * A complete upper arch, ivory on navy, full width and saying nothing.
 *
 * **This page has turned teeth down three times and it was right every time.**
 * `Treatments.tsx` dropped the app's own chart from the public page,
 * `ConcernPicker` built a clickable odontogram and took it out again, and
 * `HeroStage` rejected `explaining.webp` — a cutaway of a decayed molar, exposed
 * pulp and black caries, which is the best-lit file on disk and the worst
 * possible thing to open a dental practice's front page with. The objection in
 * all three was the same: an anatomically exact drawing reads as a textbook
 * plate, and the person looking at it is usually nervous about the chair
 * already.
 *
 * None of that is what this is, and the difference is worth being precise about
 * rather than waving at:
 *
 * - **It is not a chart.** Nothing here is numbered, labelled, clickable or
 *   recordable. There is no FDI notation, no status, no legend and no tooltip.
 *   A chart asks the reader to find themselves in it; this asks nothing.
 * - **It is not pathology.** Sixteen healthy teeth. No caries, no cutaway, no
 *   restoration, nothing opened up. The register is a smile rather than a
 *   specimen.
 * - **It is not beside photography.** It is alone on its own ground, which is
 *   the whole of why the clip-art objection does not land — the failure the
 *   other three hit was a drawing sitting *next to* a photograph and losing to
 *   it.
 *
 * What is left is an ornament, and it earns its place because it is the only
 * thing on the front page that is a picture of what the practice actually works
 * on. Every other image is a room, an instrument, a face, or the bay at Vlorë.
 *
 * **Navy is not a preference, it is the only ground this artwork has.** The
 * teeth are ivory, roughly `#eee7e2` through the crowns; the storefront's cream
 * is `#f4efe7`. Composited on `bone` they very nearly vanish, and the shading
 * that does survive reads as a smudge rather than as a tooth. On `navy` the same
 * files are luminous. That was measured by compositing the cut files on both
 * grounds before a line of this was written, and it is the reason this is a band
 * of its own rather than a `Watermark`-style texture behind a cream section.
 *
 * **Full opacity, and that was tested too.** The instinct is to drop it to the
 * five per cent `Watermark` and `GhostWord` live at. At half strength the ivory
 * desaturates toward the navy and comes out grey-blue — the warmth is the only
 * thing distinguishing these from a diagram, and fading them removes exactly it.
 * A texture at 5% and an object at 100% are two different devices; this is the
 * second, used once on the page.
 *
 * **The whole arch or nothing.** Cropping to the front six or ten teeth was
 * tried for narrow screens and is much worse than it sounds: without the molars
 * anchoring the ends, a row of tapering incisor roots reads as fangs. The molars
 * are what make the shape a mouth. So there is one geometry at every width and a
 * phone simply gets it smaller — sixteen teeth across 390px is a fine hairline
 * frieze and still recognisably an arch.
 *
 * **Placeholder artwork, licensed — and the licence has one string attached.**
 * These are the sixteen files `ToothPhoto` documents, cut from a Freepik free
 * vector: *Dental anatomy chart with permanent human teeth*, asset 40274091.
 * Free use covers a practice's own website, and it is free **on condition of
 * attribution** — so `SiteFooter` prints "Tooth illustrations designed by
 * Freepik" and that line is load bearing. Delete it and this band is being used
 * outside its licence. The credit lifts if the practice takes a Premium plan or
 * the artwork is replaced, and nothing else here changes if it is: every number
 * below is computed from whatever `TOOTH_PHOTOS` holds. `ToothPhoto` carries the
 * full provenance note.
 */

/**
 * A quadrant, outermost tooth first.
 *
 * The order the poster itself lays a quadrant out in, and the order a mouth is
 * in: the wisdom tooth at the back, the central incisor at the midline. The arch
 * is this list, then the same list reversed and mirrored — which is what a
 * second quadrant *is*, and why sixteen teeth need only eight files.
 */
const QUADRANT: readonly ToothKind[] = [
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
 * The curve, in the artwork's own pixels.
 *
 * All four are in the native units of the files in `TOOTH_PHOTOS`, never in CSS
 * pixels, because every number this module emits is a percentage of a box whose
 * aspect ratio is computed from those same units. That is what makes one set of
 * constants correct from 360px to 1408px with no breakpoints in the geometry at
 * all, and it is why these must not be "tidied" into rem.
 *
 * `DROP` is how far below the ends the midline sits, and it is the whole effect:
 * at zero this is the poster again, a flat row of specimens, and the arch is the
 * only thing separating an ornament from a chart. `SPLAY` turns each tooth to
 * follow that curve, so the roots fan outward the way they do in a jaw instead
 * of standing parallel like a fence.
 *
 * `HEAD` and `FOOT` are the air above the highest root and below the lowest
 * crown. They are generous on purpose: the outer molars are rotated a full
 * `SPLAY`, which lifts one corner about twenty-five units clear of their own
 * box, and an ornament cropped tight against its own extremities reads as a
 * mistake rather than as a bleed.
 *
 * **All three are in the cut's units, so all three move when the cut does.**
 * They were 190, 126 and 72 against the hand-cut files; re-cutting at the
 * poster's native scale made every tooth 1.25× larger, and these are scaled by
 * exactly that. Left alone they would have been a fifth too small for the teeth
 * around them — not an error anything would report, just a flatter arch and a
 * tighter crop than the ones chosen here.
 */
const DROP = 237;
const SPLAY = 19;
const HEAD = 157;
const FOOT = 90;

/**
 * Every tooth's place in the arch, resolved once at module load.
 *
 * Positions come out as percentages of the container, and the container's
 * `aspect-ratio` is set from the same two totals — so the whole arch is one
 * shape that scales rather than sixteen elements that have to be kept in step.
 * No layout arithmetic is left at render time and none of it is in CSS.
 *
 * **The widths are load-bearing, and `ToothPhoto` explains why**: the sixteen
 * files came off one poster at one scale, so a first molar really is 257 wide
 * where a central incisor is 179. Laying the row out by width is what keeps a
 * molar molar-sized. Laying it out by an equal share of the container — the
 * obvious `flex-1` — would make every tooth the same width, which is both wrong
 * for a mouth and the exact tell that gives a diagram away.
 */
const ARCH = (() => {
  const sequence = [
    ...QUADRANT.map((kind) => ({ kind, side: 'right' as const })),
    // Reversed and mirrored: the second quadrant runs midline-outward, and
    // `ToothPhoto`'s `side` does the flip. That flip is anatomically required
    // rather than cosmetic — see that file on why 16 and 26 must not be the same
    // bitmap printed twice.
    ...QUADRANT.toReversed().map((kind) => ({ kind, side: 'left' as const })),
  ];

  const width = sequence.reduce((total, { kind }) => total + TOOTH_PHOTOS.upper[kind].width, 0);
  const half = (sequence.length - 1) / 2;

  let x = 0;
  const placed = sequence.map(({ kind, side }, index) => {
    const photo = TOOTH_PHOTOS.upper[kind];
    // −1 at the right third molar, 0 at the midline, +1 at the left one.
    const t = (index - half) / half;
    // A parabola rather than a circle: the midline sits `DROP` low and the ends
    // come back to zero, which is the shape of the smile line. A true arc would
    // put the molars on the same curve as the incisors, and a real arch is
    // flatter across the front than a circle is.
    const top = HEAD + DROP * (1 - t * t);
    const tooth = {
      kind,
      side,
      left: (x / width) * 100,
      span: (photo.width / width) * 100,
      top,
      // Tangent to that parabola, near enough: the rotation is linear in `t`,
      // which is exact at the midline and about half a degree out at the molars
      // — well under what the eye reads on a tooth this size.
      angle: -SPLAY * t,
      foot: top + photo.height,
    };
    x += photo.width;
    return tooth;
  });

  // Measured rather than assumed. The lowest point is the midline incisor —
  // tallest file, deepest drop — but that is a fact about this artwork, and
  // replacing the files should move the box rather than crop them.
  const height = Math.max(...placed.map((tooth) => tooth.foot)) + FOOT;

  return {
    width,
    height,
    // `top` only becomes a percentage once the box it is a fraction *of* is
    // known, which is why this is a second pass rather than one.
    teeth: placed.map((tooth) => ({
      kind: tooth.kind,
      side: tooth.side,
      left: tooth.left,
      span: tooth.span,
      angle: tooth.angle,
      top: (tooth.top / height) * 100,
    })),
  };
})();

/**
 * The band, between two cream sections.
 *
 * A `div` and not a `section`: it has no heading, and a landmark with nothing to
 * name it is worse for a screen reader than no landmark at all. `aria-hidden`
 * for the reason the marquee is — there is no information here, and the
 * `ToothPhoto`s inside are each already hidden on their own account.
 *
 * `seam` is the bronze wash the page's other navy sections carry at their edges,
 * and `Ambience` the light and grain every large flat field on this site gets.
 * Both are here so this reads as one of the page's dark bands rather than as a
 * plate dropped into it — see `Ambience` on why a screen's flat navy reads as a
 * hole where printed navy does not.
 *
 * `max-w-[88rem]` stops the arch growing without limit on a wide monitor, where
 * a fixed aspect ratio would otherwise make it half a screen tall. Past that
 * width it simply centres, and because `.dental-arch`'s fade ends in
 * transparency rather than in a colour, the navy either side of it is the same
 * navy — the cap is invisible.
 */
export function DentalArch() {
  return (
    <div
      aria-hidden
      // `relative` and `overflow-clip` are `Ambience`'s requirement: both its
      // layers are absolutely positioned and the light is deliberately
      // oversized. `clip` rather than `hidden`, as everywhere on this page.
      className="seam relative overflow-clip bg-navy py-10 sm:py-14"
    >
      <Ambience />

      <div
        className="dental-arch relative mx-auto w-full max-w-[88rem]"
        style={{ aspectRatio: `${ARCH.width} / ${ARCH.height}` }}
      >
        {ARCH.teeth.map((tooth) => (
          <span
            // Unique by construction: eight kinds on each side, once each.
            key={`${tooth.side}-${tooth.kind}`}
            className="absolute"
            style={{
              left: `${tooth.left}%`,
              width: `${tooth.span}%`,
              top: `${tooth.top}%`,
              transform: `rotate(${tooth.angle}deg)`,
            }}
          >
            {/* The rotation is on this wrapper rather than on the image, so that
                it composes with the mirror `ToothPhoto` applies to the left side
                instead of overwriting it: an inline `transform` on the image
                would replace the `-scale-x-100` class outright and quietly
                un-mirror half the arch. */}
            <ToothPhoto kind={tooth.kind} arch="upper" side={tooth.side} className="w-full" />
          </span>
        ))}
      </div>
    </div>
  );
}
