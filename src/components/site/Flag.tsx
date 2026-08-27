import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Three flags, drawn rather than fetched, typed rather than free-form.
 *
 * **Not emoji.** 🇦🇱 is the obvious implementation and it is broken on the one
 * platform this practice's own staff work on: Windows ships no glyphs for
 * regional-indicator pairs, so Chrome and Edge on Windows render `🇦🇱` as the
 * bare letters "AL" in a box. A flag menu whose flags are two grey letters is
 * worse than the row of language codes it replaced. Every other route to a
 * bitmap flag — an icon font, a sprite sheet, a CDN — is either a network
 * dependency this app's `Content-Security-Policy` forbids outright or a
 * kilobyte-per-flag download for something that is four rectangles.
 *
 * So: inline SVG, about 400 bytes each, correct on every platform, sharp at any
 * size, and inheriting the page's own rounding. The two simple ones are the
 * official constructions. The two that are not simple are honest
 * simplifications, and each says below exactly where it departs from the real
 * thing — a flag drawn approximately and *labelled* approximately is fine; one
 * drawn approximately and presented as exact is the kind of small dishonesty
 * that ends up on a printed leaflet.
 *
 * Every one is `aria-hidden`: the language's own name is written beside it in
 * `LocaleMenu`, and a screen reader announcing "flag of Albania, Shqip" is
 * saying the same thing twice.
 */

/** The proportions every flag here is drawn in. 3:2, the commonest ratio. */
const BOX = { width: 30, height: 20 };

function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      width={BOX.width}
      height={BOX.height}
      aria-hidden
      focusable="false"
      className={cn('block h-full w-auto', className)}
    >
      {children}
    </svg>
  );
}

/**
 * Albania — the black double-headed eagle on `#e41e20`.
 *
 * The eagle is drawn as one half and mirrored, which is both how the real
 * device is constructed and the only way to keep a hand-authored silhouette
 * symmetrical. It is a **simplification**: the state flag's eagle has
 * individually articulated primaries, a beaded eye and a defined tongue, none
 * of which survive being rendered eighteen pixels tall. What is kept is
 * everything that identifies it at that size — two outward-facing heads with
 * open beaks, the spread of the wings, the notched tail.
 */
function Albania() {
  return (
    <Field>
      <rect width={BOX.width} height={BOX.height} fill="#e41e20" />
      <g transform="translate(15 10.6)" fill="#000">
        <EagleHalf />
        <g transform="scale(-1 1)">
          <EagleHalf />
        </g>
      </g>
    </Field>
  );
}

/** One side of the bird, from the centre line outward. Mirrored by its caller. */
function EagleHalf() {
  return (
    <path
      d="M0 -5.1
         C0.5 -5.9 1.5 -6.3 2.3 -6.0
         L3.9 -6.5 L3.1 -5.6 L3.9 -5.2 L2.8 -5.0
         C3.0 -4.2 2.5 -3.5 1.7 -3.2
         C2.9 -3.0 4.0 -2.6 5.0 -2.0
         C6.1 -1.4 6.9 -0.6 7.3 0.2
         C6.5 0.0 5.8 -0.2 5.1 -0.4
         C5.7 0.2 6.1 0.9 6.3 1.6
         C5.6 1.2 4.9 0.8 4.2 0.5
         C4.5 1.2 4.7 1.9 4.6 2.5
         C4.0 1.9 3.3 1.4 2.6 1.0
         C2.7 1.8 2.5 2.6 2.1 3.3
         C1.8 2.6 1.5 2.0 1.2 1.5
         L1.0 3.2 L1.5 3.6 L0.7 4.0 L1.1 4.7 L0 5.2 Z"
    />
  );
}

/**
 * The United Kingdom, for English.
 *
 * A **simplification**, and the one worth naming: the real Union Flag
 * counterchanges its diagonals — the red saltire of St Patrick is offset from
 * the white saltire of St Andrew, differently in each quarter, so the white
 * shows wider on one side of every arm. That detail is invisible below about
 * forty pixels and costs four extra clipped paths to draw. This is the centred
 * version: correct in colour, ratio and structure, symmetrical where the
 * original is not.
 *
 * A stroked diagonal across a 3:2 rectangle overshoots its own corners, and
 * nothing here clips it: an `<svg>` element hides overflow by default, so the
 * viewBox is the clip. Worth saying because the obvious fix is a `<clipPath>`
 * with an id — and an id inside a component rendered twice on one page (the
 * menu's button and its list both show the same flag) is a duplicate id, which
 * is a validity error and, in a document that ever gets inlined into another,
 * a real collision.
 */
function UnitedKingdom() {
  return (
    <Field>
      <rect width={BOX.width} height={BOX.height} fill="#012169" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4.4" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" strokeWidth="2.2" />
      <path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth="6.6" />
      <path d="M15 0V20M0 10H30" stroke="#c8102e" strokeWidth="4" />
    </Field>
  );
}

/** Italy — three equal vertical bands. The construction, exactly. */
function Italy() {
  return (
    <Field>
      <rect width={10} height={BOX.height} fill="#009246" />
      <rect x={10} width={10} height={BOX.height} fill="#f1f2f1" />
      <rect x={20} width={10} height={BOX.height} fill="#ce2b37" />
    </Field>
  );
}

const FLAGS: Record<Locale, () => React.JSX.Element> = {
  sq: Albania,
  en: UnitedKingdom,
  it: Italy,
};

/**
 * The flag for a locale, sized by its container's height.
 *
 * A flag is a rectangle with hard edges and it looks like a sticker unless it
 * is given the same rounding as everything else on the page, so the clipping
 * lives here rather than being remembered at each use site. `ring-inset` is
 * what stops the white band of the Italian flag dissolving into a light
 * background — a 1px hairline of the page's own ink, drawn inside the box.
 */
export function Flag({ locale, className }: { locale: Locale; className?: string }) {
  const Artwork = FLAGS[locale];

  return (
    <span
      className={cn(
        'inline-block shrink-0 overflow-hidden rounded-[3px] ring-1 ring-current/25 ring-inset',
        className,
      )}
    >
      <Artwork />
    </span>
  );
}
