import { ClinicMark } from '@/components/brand/ClinicLogo';

/**
 * The mark, small, in the corner of a photograph.
 *
 * This is the visible half of "watermarked" and it is worth being precise about
 * what it is and is not. It brands the image on the page and makes a screenshot
 * of one recognisably the practice's; it does **not** protect the file, because
 * the file underneath is untouched and anybody can fetch it from `/site/` and
 * get a clean copy. Real protection means compositing the mark into the pixels
 * before they ship, which is a thing to do to the practice's own photographs
 * once there are some — there is no point burning a logo into stock images that
 * are about to be replaced.
 *
 * It sat inside `Gallery` while the carousel was the only place a photograph was
 * shown at size. The gallery page's wall marks its tiles the same way, and a
 * corner mark that is subtly different in two places is worse than none: the
 * whole point of it is that a screenshot taken anywhere on this site carries the
 * same badge.
 *
 * `mix-blend-screen` is what makes one white artwork work on every photograph in
 * the set — it lightens rather than paints, so the mark stays legible on a dark
 * treatment room and disappears politely into a bright one instead of sitting on
 * it as a white sticker.
 */
export function PhotoMark() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-3.5 bottom-3.5 opacity-70 mix-blend-screen"
    >
      <ClinicMark variant="inverse" alt="" className="h-7 w-auto drop-shadow-md sm:h-8" />
    </span>
  );
}
