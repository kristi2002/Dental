import { type ToothKind } from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * A photographic tooth, for the places a drawing of one would be wrong.
 *
 * `ToothGlyph` models twenty-six teeth from millimetre measurements and renders
 * each in the state a finding leaves it in. That is the right instrument for the
 * chart and it stays there. This is the other thing: one tooth, rendered, with
 * nothing recorded on it — for a page that needs to *show* a molar rather than
 * let a dentist mark one.
 *
 * **All of it is placeholder, and the licence is now known.** The sixteen files
 * are cut by `scripts/cut-tooth-photos.mjs` — which finds the teeth on the page,
 * derives each matte from the poster's own white rather than tracing one, and
 * prints the map below to be pasted back here — out of a stock illustration that
 * arrived in the repository root as
 * `2301.i203.015.F.m004.c9 · human teeth dental anatomy realistic set` — a
 * 5000×3250 render, with the Illustrator EPS beside it. It is a Freepik free
 * vector, *Dental anatomy chart with permanent human teeth realistic vector
 * illustration*, asset 40274091:
 *
 *   https://www.freepik.com/free-vector/dental-anatomy-chart-with-permanent-human-teeth-realistic-vector-illustration_40274091.htm
 *
 * (Freepik has since rebranded and that address redirects to `magnific.com`.
 * The freepik.com form is kept here because it is the one the credit line and
 * every other reference in the wild still use.)
 *
 * **The free licence permits this use and requires a credit for it.** Putting it
 * on the practice's own site is fine — the restriction that reads like it might
 * bite, on content used as "the main element" of something "aimed to be
 * resold", is about products for sale rather than about a clinic's front page.
 * What is not optional is attribution: the terms make free use "conditioned upon
 * any use by the User being duly attributed", so `SiteFooter` prints "Tooth
 * illustrations designed by Freepik" for as long as these files are in the
 * repository. A Premium plan is what removes that line; deleting it is not.
 *
 * Same rule as `photos.ts`: the provenance lives next to the artwork so it
 * cannot quietly become the practice's own.
 *
 * **There are sixteen files for thirty-two teeth, because the source only ever
 * drew sixteen.** Tooth 16 and tooth 26 in it differ by 0.6 of 255 across the
 * 154,000 pixels they share, where mirroring one onto the other is 13.7 out —
 * the same picture placed twice, not mirrored. So
 * the files are named for what they are, `<arch>-<kind>`, and `side` flips the
 * left half. Anatomically that flip is required rather than cosmetic: 16 and 26
 * *are* mirror images, and shipping the same bitmap for both puts mesial where
 * distal belongs on one side of every pair. The drawing is only about 6%
 * asymmetric, so the flip is subtle — which is why it is done here once instead
 * of being left to each use site to remember.
 *
 * **The proportions are a poster's, not a mouth's**, and that is the reason this
 * is not the chart. Every tooth in the source is drawn to nearly one length —
 * longest over shortest is 1.09×, where the drawn set is 1.63× — so the canine
 * comes out shorter than the central incisor beside it rather than the longest
 * tooth in the arch, and the upper lateral incisor is drawn 155 wide against the
 * canine's 151, which is backwards. None of that matters for one tooth at
 * 200px on a page; all of it matters in a row of thirty-two being read for
 * findings.
 *
 * **Permanent teeth only.** The stock set has none of the twenty primary teeth,
 * which is the single reason the chart cannot be built out of it; the props
 * below take a `ToothKind` from the permanent list and there is deliberately no
 * way to ask this component for a deciduous molar.
 *
 * Sizes and format are baked in for the reason `photos.ts` gives: these are
 * fixed assets the app ships with, `output: 'standalone'` is a self-contained
 * server, and an image pipeline at runtime would be one more moving part
 * earning nothing.
 */

/** Which arch a tooth is drawn for. The upper set has its roots at the top, the
 *  lower set at the bottom, so the two are not interchangeable — an upper molar
 *  flipped vertically reads as a lower one that has been dropped. */
export type ToothArch = 'upper' | 'lower';

/** Which side of the mouth, in the patient's terms — quadrants 1 and 4 are their
 *  right, which is the half the files were cut from and therefore the one that
 *  needs no flip. */
export type ToothSide = 'right' | 'left';

type PhotoFile = { src: string; width: number; height: number };

/**
 * Kind and arch to file, with the intrinsic size of each.
 *
 * An explicit map rather than a template literal in the `src`, for the reason
 * `Flag` gives: a ninth `ToothKind` is then a type error here rather than a
 * broken image on a page nobody reloads. `tests/tooth-photos.test.ts` covers the
 * other half — a path in this map with no file behind it.
 *
 * **Every file is at one common scale**, so the widths below are true relative
 * sizes: a first molar really is 257 wide where a lower central incisor is 135,
 * because that is the ratio in the source — and it is the source's own ratio
 * rather than a resampled one, since every file is cut at the poster's native
 * scale and none is resized on the way out. Size a row of these by *width* and
 * they stay in proportion to each other. Size them by height and they do not —
 * the source draws every tooth to nearly the same length, so equal heights make
 * an incisor and a third molar look the same size, which they are not.
 */
const PHOTOS: Record<ToothArch, Record<ToothKind, PhotoFile>> = {
  upper: {
    CENTRAL_INCISOR: { src: '/teeth/upper-central-incisor.webp', width: 179, height: 515 },
    LATERAL_INCISOR: { src: '/teeth/upper-lateral-incisor.webp', width: 155, height: 485 },
    CANINE: { src: '/teeth/upper-canine.webp', width: 151, height: 495 },
    FIRST_PREMOLAR: { src: '/teeth/upper-first-premolar.webp', width: 194, height: 488 },
    SECOND_PREMOLAR: { src: '/teeth/upper-second-premolar.webp', width: 185, height: 491 },
    FIRST_MOLAR: { src: '/teeth/upper-first-molar.webp', width: 257, height: 475 },
    SECOND_MOLAR: { src: '/teeth/upper-second-molar.webp', width: 257, height: 487 },
    THIRD_MOLAR: { src: '/teeth/upper-third-molar.webp', width: 244, height: 496 },
  },
  lower: {
    CENTRAL_INCISOR: { src: '/teeth/lower-central-incisor.webp', width: 135, height: 478 },
    LATERAL_INCISOR: { src: '/teeth/lower-lateral-incisor.webp', width: 127, height: 474 },
    CANINE: { src: '/teeth/lower-canine.webp', width: 151, height: 497 },
    FIRST_PREMOLAR: { src: '/teeth/lower-first-premolar.webp', width: 194, height: 488 },
    SECOND_PREMOLAR: { src: '/teeth/lower-second-premolar.webp', width: 185, height: 493 },
    FIRST_MOLAR: { src: '/teeth/lower-first-molar.webp', width: 257, height: 475 },
    SECOND_MOLAR: { src: '/teeth/lower-second-molar.webp', width: 257, height: 486 },
    THIRD_MOLAR: { src: '/teeth/lower-third-molar.webp', width: 244, height: 493 },
  },
};

/**
 * Exported for two callers, and the second is the reason the widths above are
 * documented as load bearing rather than as incidental metadata.
 *
 * `tests/tooth-photos.test.ts` walks every entry looking for the file behind it.
 * `DentalArch` lays sixteen of these out as a full upper arch and takes the
 * relative widths straight from here — so a file re-exported at a different
 * scale does not merely reserve the wrong box, it puts one wrong-sized tooth in
 * a row of fifteen correct ones.
 */
export const TOOTH_PHOTOS = PHOTOS;

/**
 * One tooth, sized by its container.
 *
 * `alt` is empty and the image `aria-hidden` by default, because a tooth beside
 * a heading that says which tooth it is has already been announced — the same
 * call `Flag` makes. Pass `alt` where the picture is the only thing saying it.
 *
 * From an FDI number, compose it with the helpers the rest of the app uses:
 *
 * ```tsx
 * const kind = toothKind(n);
 * kind && dentitionOf(n) === 'PERMANENT' && (
 *   <ToothPhoto
 *     kind={kind}
 *     arch={isUpperArch(n) ? 'upper' : 'lower'}
 *     side={isRightSide(n) ? 'right' : 'left'}
 *   />
 * )
 * ```
 */
export function ToothPhoto({
  kind,
  arch,
  side = 'right',
  alt,
  className,
}: {
  kind: ToothKind;
  arch: ToothArch;
  /** Defaults to the side the artwork was drawn on, which needs no flip. */
  side?: ToothSide;
  /** Left empty unless the picture is carrying the meaning on its own. */
  alt?: string;
  className?: string;
}) {
  const photo = PHOTOS[arch][kind];

  return (
    /* Fixed assets the app ships with, at a size chosen on disk rather than by
       an optimizer — same call, and the same reasoning, as `photos.ts`. */
    /* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */
    <img
      src={photo.src}
      width={photo.width}
      height={photo.height}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : true}
      loading="lazy"
      decoding="async"
      className={cn('block h-auto max-w-full', side === 'left' && '-scale-x-100', className)}
    />
  );
}
