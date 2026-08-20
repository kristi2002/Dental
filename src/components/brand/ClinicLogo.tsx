/**
 * The practice's mark, in the two shapes and three colours the app asks for.
 *
 * `ClinicLogo` is the full lockup — the tooth, the script `sh`, and the name
 * set beside them. It needs about 240px of width before its second line stops
 * being a smudge, so it belongs where a sheet of paper or a page has room for
 * it: a letterhead, a signed-out screen, an error page.
 *
 * `ClinicMark` is the drawing on its own, cut out of the same artwork. It is
 * what the app's chrome wears — a 15rem rail that pinches to 4.5rem, a phone
 * top bar one row tall — with the practice's name written in text beside it
 * rather than left to a line of type six pixels high.
 *
 * A plain `<img>`, deliberately, on both counts it could have been something
 * else. Not `next/image`, because these are fixed assets the app ships with
 * rather than user content of unknown size, and the optimizer would earn
 * nothing while adding a moving part to a self-hosted deploy — the same reason
 * `DocumentGallery` and `PhotoTile` reach for `<img>`. And not a CSS
 * `background-image`, which matters more: browsers omit background images from
 * printouts by default, and the letterhead exists to be printed.
 *
 * One file per colour rather than one recoloured by `filter`. The mark is line
 * art in a single ink, so the white version is just the black one with a
 * different colour — but `filter: invert()` on a printed sheet is the kind of
 * thing a printer driver is entitled to ignore, and getting a black logo on the
 * teal rail because someone's browser dropped a filter is worse than shipping
 * the artwork three times. `scripts/build-logo.mjs` emits the whole family from
 * one source, pixel-registered.
 */

/**
 * The size of the files on disk, passed so the browser reserves the right box
 * before the image loads. Without it the letterhead reflows as each sheet
 * paints, which on a print preview is the difference between one page and two.
 *
 * These are the artwork's own proportions, not the scan's — `build-logo.mjs`
 * crops to the ink. Keep them in step with what that script prints if the logo
 * is ever rebuilt.
 */
const LOCKUP = { width: 1323, height: 387 };
const MARK = { width: 664, height: 387 };

export type LogoVariant =
  /** Black. For paper, and for a monochrome printer that has to read it. */
  | 'ink'
  /** White. For the teal navigation rail and anything else dark. */
  | 'inverse'
  /**
   * The app's own teal — `--color-brand-deep`, the one weight in the palette
   * that clears 4.5:1 on a light background. For the light surfaces *inside*
   * the app, where black artwork reads as a scan somebody pasted in and teal
   * reads as part of the room.
   */
  | 'brand';

const SUFFIX: Record<LogoVariant, string> = {
  ink: '',
  inverse: '-inverse',
  brand: '-brand',
};

type Props = {
  variant?: LogoVariant;
  className?: string;
  /**
   * What a screen reader says. Usually the practice's own name — the lockup
   * spells it out, so repeating it in a caption beside the image would have it
   * read twice. Pass `''` where the name is already written next to the mark,
   * which makes this decorative and skipped rather than duplicated.
   */
  alt: string;
};

function Artwork({
  file,
  size,
  variant = 'ink',
  className,
  alt,
}: Props & { file: string; size: { width: number; height: number } }) {
  return (
    // Fixed assets the app ships with, on sheets that exist to be printed:
    // nothing to gain from the optimizer, one more moving part to lose. The
    // reasoning in full is at the top of this file.
    // eslint-disable-next-line next/no-img-element, @next/next/no-img-element
    <img
      src={`/brand/${file}${SUFFIX[variant]}.png`}
      width={size.width}
      height={size.height}
      alt={alt}
      // Height is what every use site sets — a letterhead is specified in
      // millimetres of height, never of width, and so is a rail — so the width
      // follows from the aspect ratio and the `width` attribute is only a hint.
      className={className}
    />
  );
}

/** The full lockup, 3.4:1. Give it width, or give it `ClinicMark` instead. */
export function ClinicLogo(props: Props) {
  return <Artwork {...props} file="logo" size={LOCKUP} />;
}

/** The tooth and the script `sh` alone, 1.7:1. */
export function ClinicMark(props: Props) {
  return <Artwork {...props} file="mark" size={MARK} />;
}
