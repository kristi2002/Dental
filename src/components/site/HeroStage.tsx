import { HeroFilmPlayer } from '@/components/site/HeroFilmPlayer';
import { HERO_FILM, PHOTOS, srcSetFor } from '@/components/site/photos';

/**
 * The moving picture behind the headline: three photographs, crossfading.
 *
 * **A server component with no JavaScript in it at all.** The crossfade, the
 * drift and the hand-over are three CSS animations — see `.cinema-frame` in
 * `globals.css` — which means the loop is running before React has booted and
 * keeps running if React never does. A hero whose motion depends on hydration
 * is a hero that is a still photograph for the first second of every visit, on
 * exactly the connections where the first second is all you get.
 *
 * **Why stills and not a video, given the brief asked for one.** A twelve-second
 * loop at a size worth showing is two to three megabytes and would be, by a
 * factor of ten, the heaviest thing this deploy serves; it needs a poster frame
 * so the hero is not a grey rectangle while it buffers; `autoplay` is refused
 * outright by iOS unless the file is also muted and `playsInline`, and refused
 * by Data Saver regardless; and it is a second decode running for as long as the
 * page is open, on a phone, in a waiting room, on a practice's own front page.
 * Three WebPs already on disk cost 258KB between them at full size and 73KB at
 * the widths a phone actually picks off the `srcset` below — and only the first
 * of the three is fetched before a visitor has read the headline. That one is
 * the LCP element and paints immediately, and what a visitor perceives — a room
 * alive rather than photographed — is not distinguishable from the video at the
 * distance anybody actually looks at a hero. If the practice ever shoots real
 * footage of the surgery, this is the component to replace and the trade is
 * worth revisiting then; buying it now would be spending three megabytes to
 * animate stock photographs of somebody else's clinic.
 *
 * **Each frame is at least as large as the box it fills**, which is the whole
 * reason the hero is a right-hand panel on a wide screen rather than a
 * full-bleed backdrop. Full-bleed is the more obvious composition and it would
 * have meant blowing a 900px-wide file up to 1920, which no amount of gradient
 * over the top of it hides. The panel is about 54% of the viewport, so on a
 * 1440px screen the images are displayed at roughly 780×900 and every one of
 * these is bigger than that. On a phone the panel becomes the whole screen —
 * and the portrait crops are 900×1200, so that is oversampled too.
 *
 * **Decorative, and `aria-hidden` at the call site.** Three photographs
 * dissolving into one another are one impression, not three facts; a screen
 * reader announcing all three alt texts in a row would describe a slideshow
 * nobody can perceive. Everything the hero actually says is in the type beside
 * it, and every photograph on this page that carries information — the gallery,
 * the treatment grid — is described properly where it appears.
 */

/**
 * The reel, in order: **the room, the person, the place.**
 *
 * Three frames rather than two because a two-frame crossfade reads as a fault —
 * the eye catches the same pair swapping back and forth and starts waiting for
 * it. Three is the smallest number that reads as a loop instead of a toggle.
 *
 * The room is first for a reason beyond composition: it is what the browser
 * measures Largest Contentful Paint against, so it is the only image on this
 * page fetched at high priority and the only one not lazily loaded. The other
 * two are allowed to arrive in their own time — the earliest either is needed is
 * eight seconds in.
 *
 * **The shortlist was decided by pixels, not by taste**, and that is what ruled
 * most of the library out. The panel is roughly 780×900 on a 1440px screen, and
 * `object-fit: cover` on a 900×600 gallery crop means a 1.5× upscale — visibly
 * soft, and no amount of gradient over the top hides it. Only the five files
 * over 1200px in one dimension were eligible.
 *
 * Two candidates were rejected on their content rather than their size, and both
 * rejections are the same judgement this codebase has made before:
 *
 *   `surgeryWide` — the same treatment room as frame one, from a step back.
 *   Sharp, correct, and it made the loop look broken: two of the three frames
 *   were the same room, so the crossfade between them read as a rendering
 *   glitch rather than as a change of scene.
 *
 *   `explaining.webp` — an anatomical cutaway model of a decayed molar, held in
 *   a gloved hand. It is the single best-lit file on disk and it is the worst
 *   possible image to open a dental practice's front page with: exposed pulp,
 *   black caries and saturated yellow dentine, at full height, behind the
 *   sentence "your smile, in safe hands". `Treatments.tsx` reached exactly this
 *   conclusion when it dropped the app's own tooth chart from the public page —
 *   an anatomically exact drawing reads as a textbook plate, and the person
 *   looking at it is usually nervous about the chair already. The file is left
 *   in `public/site/` unreferenced; it is not in `photos.ts` because nothing
 *   uses it and its provenance was never recorded.
 *
 * The bay is a 1.14× upscale in the panel, which is the one stretch here and is
 * inside what a photograph tolerates. It is also the only image on this page
 * genuinely taken in Vlorë — every other file is a stock clinic somewhere else —
 * and on a page read in three languages by people deciding whether to fly in for
 * treatment, the third frame being the town itself is the argument.
 */
const REEL = [PHOTOS.surgery, PHOTOS.heroSmile, PHOTOS.vloreBay] as const;

/**
 * What the stage is actually as wide as, told to the browser in its own terms.
 *
 * The two numbers are the two compositions this component has, and they have to
 * match `Hero`'s `lg:left-[46%]` — the panel is the right 54% of the viewport
 * from `lg` up, and the whole screen below it. Get this wrong in the generous
 * direction and every phone downloads the desktop file anyway, which is the bug
 * `srcset` was added to fix; get it wrong in the mean direction and a 1440px
 * screen renders a 640px upscale.
 *
 * `sizes` is read by the preload scanner before any CSS has been parsed, which
 * is why it is a media query here and cannot be inferred from the layout.
 */
const REEL_SIZES = '(min-width: 1024px) 54vw, 100vw';

export function HeroStage() {
  // One assignment in `photos.ts` swaps the three-frame crossfade for real
  // footage. It is null today and the reasoning is on `HERO_FILM`: the blocker
  // has never been the code, it is that stock video of another clinic is a
  // worse placeholder than a stock still rather than a better one.
  if (HERO_FILM) return <HeroFilmPlayer film={HERO_FILM} />;

  return (
    <>
      {REEL.map((photo, index) => (
        <div key={photo.src} className="cinema-frame">
          {/* Fixed assets the app ships with, pre-sized on disk — no optimizer
              in the loop, for the reason set out in full in `photos.ts`.
              `srcSetFor` offers the narrower copies that
              `scripts/resize-site-photos.mjs` wrote; `width`/`height` stay on
              the element because they are what reserves the box, and a `srcset`
              does not change the aspect ratio the browser reasons from.

              Deliberately no `<link rel="preload">` for the first frame. It is
              already in the server-rendered HTML with `fetchPriority="high"`, so
              the preload scanner finds it in the same pass it would find the
              link — and a preload whose `imagesizes` drifted out of step with
              `sizes` here would fetch a second, different candidate. */}
          {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
          <img
            src={photo.src}
            srcSet={srcSetFor(photo)}
            sizes={photo.variants ? REEL_SIZES : undefined}
            width={photo.width}
            height={photo.height}
            alt=""
            fetchPriority={index === 0 ? 'high' : 'low'}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        </div>
      ))}
    </>
  );
}
