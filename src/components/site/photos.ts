/**
 * Every photograph on the practice's public page, and where each one came from.
 *
 * **All of it is placeholder.** Free-licence stock, cropped and converted here so
 * the page can be seen and judged before the practice has photography of its
 * own; not one of these is Shehu Dental, and not one of the faces has ever sat in
 * that chair. The provenance lives in this file rather than in a README so that
 * whoever swaps them has the source in front of them while choosing the
 * replacement, and so a stock image can never quietly become "our surgery"
 * because nobody remembered which was which.
 *
 * **There is deliberately no portrait of Dr. Shehu.** A stock photograph of a
 * stranger under a real dentist's name is a fabricated person, and no framing
 * makes that acceptable — not "it's only a demo", not "we'll swap it later". The
 * practice section names him in type and leaves the picture out until there is a
 * real one. Faces do appear elsewhere on the page, in the treatment grid and the
 * gallery, where nothing claims they are anybody in particular.
 *
 * Sizes and format are baked in rather than left to an optimizer, for the reason
 * `ClinicLogo` gives about the brand artwork: these are fixed assets the app
 * ships with, `output: 'standalone'` is a self-contained server, and an image
 * pipeline at runtime would be one more moving part earning nothing. Every file
 * is WebP, cropped to the aspect it is displayed at, and every use site passes
 * `width`/`height` so the page reserves the box before the bytes land. The whole
 * set is under a megabyte.
 *
 * To replace one: drop the practice's own photograph in at the same path and
 * aspect ratio, and set `source` to null.
 */

import type { TreatmentKey } from '@/lib/site-content';

export type SitePhoto = {
  /** Path under `public/`. */
  src: string;
  width: number;
  height: number;
  /**
   * Where it came from — `null` once this is the practice's own work, which is
   * the state every row here is meant to end up in.
   */
  source: string | null;
  /**
   * Narrower copies on disk, ascending, written by
   * `scripts/resize-site-photos.mjs` as `<name>-<width>.webp`.
   *
   * Only the hero reel has any, and deliberately: those three are the only
   * images a visitor waits on, and everything below the fold is lazily loaded
   * and already under 37KB. Absent here means `srcSetFor` returns undefined and
   * the `<img>` renders exactly as it did before — which is what every other
   * photograph on this page still does.
   */
  variants?: readonly number[];
};

/**
 * The `srcset` for a photograph that has narrower copies, or undefined.
 *
 * The original is always the last candidate, described by its real width, so the
 * browser can still choose it on a wide screen — a `srcset` listing only the
 * downscales would cap a 1440px panel at 1024 and undo the point of storing the
 * large file at all.
 *
 * Returning `undefined` rather than a single-entry string matters: React drops
 * an undefined attribute entirely, so a photograph with no variants emits no
 * `srcset` at all rather than one that offers the browser no choice.
 */
export function srcSetFor(photo: SitePhoto): string | undefined {
  if (!photo.variants?.length) return undefined;

  const base = photo.src.replace(/\.webp$/, '');
  return [
    ...photo.variants.map((width) => `${base}-${width}.webp ${width}w`),
    `${photo.src} ${photo.width}w`,
  ].join(', ');
}

/**
 * The hero's moving picture.
 *
 * **This is stock footage and it is a placeholder, exactly like every
 * photograph in this file.** The note that used to sit here argued against it
 * and the argument still stands on its own terms: motion reads as documentary,
 * so a loop of somebody else's surgery is closer to a claim about this practice
 * than a still of somebody else's surgery is. It was overruled deliberately, and
 * the shortlist was drawn to make the overruling as harmless as it can be:
 *
 *   **No faces.** The clip is an empty room. A stock patient in this practice's
 *   hero is a person who has never been here being shown as somebody who has,
 *   which is the part of "reads as documentary" that actually matters.
 *
 *   **No procedure and no anatomy.** `Treatments` dropped the app's own tooth
 *   chart from the public page and `HeroStage` rejected `explaining.webp` for
 *   the same reason — the person looking is usually nervous about the chair
 *   already. Two of the four candidates were a dental model in close-up and went
 *   the same way.
 *
 *   **Nothing identifiable.** No signage, no branded equipment, no window on a
 *   street that is not in Vlorë.
 *
 * What is left is a slow dolly through a clean, empty surgery, which says
 * "modern practice" and asserts nothing else. It is replaced the day there is
 * footage of this one, and `site.illustrative` already tells the reader on the
 * page that the pictures are not of these rooms.
 *
 * **How the file was made**, because the numbers are constraints rather than
 * preferences and the next person to swap it has to hit them:
 *
 *   - 1600×900, H.264 high, two-pass at 820kbps, no audio track at all, and
 *     `+faststart` so the moov atom is at the front and the first frames arrive
 *     before the whole file does. **1.67MB**, against the 2MB ceiling this note
 *     has always carried.
 *   - **A palindrome.** The source is an eight-second dolly-in, and an
 *     eight-second dolly-in loops with a hard cut back to the doorway every
 *     eight seconds. The file is the clip reversed and then played forward —
 *     sixteen seconds, first frame identical to last, no seam to cut.
 *   - Reversed *first*, so the loop opens on the room fully in view rather than
 *     on the corridor the raw clip starts in. That frame is also the poster, and
 *     a poster that is not frame zero shows as a jump the moment playback
 *     starts.
 *
 * Muted and `playsInline` are enforced by `HeroFilmPlayer`, which also refuses
 * to start it under `prefers-reduced-motion` — a thing no stylesheet can do.
 */
export type HeroFilm = {
  src: string;
  /** Painted immediately and while the file loads, so the hero is never grey. */
  poster: string;
  width: number;
  height: number;
  /**
   * Where the footage came from, recorded for the same reason every photograph
   * in this file carries a `source`: an asset whose provenance nobody wrote down
   * is an asset nobody can license, credit or safely replace. `explaining.webp`
   * is the cautionary case — it sits unreferenced in `public/site/` precisely
   * because this was never filled in for it.
   */
  source: string;
};

export const HERO_FILM: HeroFilm | null = {
  src: '/site/hero-loop.mp4',
  poster: '/site/hero-poster.webp',
  width: 1600,
  height: 900,
  // Pexels licence: free for commercial use, no attribution required, and no
  // identifiable person appears in it.
  source: 'https://www.pexels.com/video/interior-of-a-dental-clinic-14934108/',
};

const unsplash = (id: string) => `https://unsplash.com/photos/${id}`;

/**
 * The other free-licence source this page draws on, and the one the hero's film
 * already came from — free for commercial use, no attribution required.
 *
 * It is here because the three treatments added from the practice's printed list
 * had no usable photograph on Unsplash: a search for dentures and for veneers
 * returns mostly Premium-licensed frames, and a premium asset on a real clinic's
 * website is a licence nobody bought. Same rule as every row in this file — a
 * placeholder until the practice photographs its own bench and its own tray.
 */
const pexels = (id: string) => `https://www.pexels.com/photo/${id}/`;

/** Named singles: the hero, and the two the practice section still uses. */
export const PHOTOS = {
  /**
   * The hero's main image. A close smile, cropped tall — it carries the page's
   * one human moment and sits directly beside the headline.
   */
  heroSmile: {
    src: '/site/hero-smile.webp',
    width: 900,
    height: 1200,
    source: unsplash('1567516364473-233c4b6fcfbe'),
    // One variant, not two: the file is 900px wide, so a "1024" would be an
    // upscale and the resize script refuses to write it.
    variants: [640],
  },
  /**
   * The small square overlapping its corner: a mirror and probe on white.
   *
   * Bright on purpose. It sits on the darkest part of the page, and the first
   * thing tried here — an implant model shot on a dark desk — disappeared into
   * the water it was supposed to stand out from.
   */
  heroDetail: {
    src: '/site/hero-detail.webp',
    width: 760,
    height: 760,
    source: unsplash('1606811856475-5e6fcdc6e509'),
  },
  /** A treatment room. Empty, bright, nobody in it — a room, not a promise. */
  surgery: {
    src: '/site/surgery.webp',
    width: 1244,
    height: 933,
    source: unsplash('1704455306251-b4634215d98f'),
    // The page's LCP element, so this is the `srcset` that actually pays: a
    // 390px phone takes the 19KB copy instead of the 54KB one.
    variants: [640, 1024],
  },
  /** The same room, wide, for the social card. */
  surgeryWide: {
    src: '/site/surgery-wide.webp',
    width: 1400,
    height: 787,
    source: unsplash('1704455306925-1401c3012117'),
  },
  /**
   * Vlorë from above: the bay the practice sits on. The one photograph here that
   * is genuinely of the right place, which is why it is used where the page
   * talks about travelling here rather than as decoration.
   */
  vloreBay: {
    src: '/site/vlore-bay.webp',
    width: 1400,
    height: 787,
    source: unsplash('1742243845906-1f6f50704ccf'),
    variants: [640, 1024],
  },
} satisfies Record<string, SitePhoto>;

/**
 * One per treatment, keyed to `TREATMENTS` in `lib/site-content.ts`.
 *
 * These replaced the dental chart's own tooth drawings, which were anatomically
 * exact, unique to this codebase, and — seen by a patient rather than a dentist
 * — read as diagrams out of a textbook. The chart is superb at its job and its
 * job is not selling anybody a filling.
 *
 * Every key in `TREATMENTS` must appear here; `Treatments.tsx` would render a
 * hole otherwise, and the type below is what makes that a compile error rather
 * than a gap somebody notices on the deployed page.
 */
export const TREATMENT_PHOTOS = {
  checkup: {
    src: '/site/t-checkup.webp',
    width: 800,
    height: 600,
    source: unsplash('1606811971618-4486d14f3f99'),
  },
  fillings: {
    src: '/site/t-fillings.webp',
    width: 800,
    height: 600,
    source: unsplash('1606811856475-5e6fcdc6e509'),
  },
  rootCanal: {
    src: '/site/t-rootcanal.webp',
    width: 800,
    height: 600,
    source: unsplash('1588776814546-1ffcf47267a5'),
  },
  /**
   * A technician shaping a prosthesis at the bench — which is what the copy
   * beside it says a crown is. The first pick here was a clinical intraoral
   * photograph taken through a retractor: correct, dark, and confronting on a
   * page somebody nervous is reading.
   */
  crowns: {
    src: '/site/t-crowns.webp',
    width: 800,
    height: 600,
    source: unsplash('1776406987595-ba14f3510c07'),
  },
  /**
   * A shade guide, cropped close on the porcelain tabs.
   *
   * Chosen over the obvious thing — a finished smile — because the page already
   * has two of those and because a shade guide is what the copy beside it
   * actually describes: the colour is matched against the teeth either side, in
   * the room, rather than picked off a chart. It is also the one photograph in
   * this set with no mouth in it, which on a cosmetic treatment is the harder
   * and better choice.
   *
   * **The first frame tried here was the wrong photograph and the card said so
   * immediately.** It was the same subject shot high-key on white, and against
   * ten photographs with real tonal mass it read as a card whose image had
   * failed to load — the gradient the title sits on needs something underneath
   * it to darken, and a white background gives it nothing. This one carries the
   * grey of the bench below the guide and a soft out-of-focus surgery above it,
   * which is what makes it a photograph in that grid rather than a cut-out.
   *
   * The crop lifts the row of tabs to the upper third for the same reason: the
   * bottom of every card in that section belongs to the gradient, so whatever
   * the card is *of* has to sit above it.
   */
  veneers: {
    src: '/site/t-veneers.webp',
    width: 800,
    height: 600,
    source: pexels('6812494'),
  },
  extraction: {
    src: '/site/t-extraction.webp',
    width: 800,
    height: 600,
    source: unsplash('1588776814546-daab30f310ce'),
  },
  /**
   * A surgical tray laid out on drapes — burs, elevators, forceps, sutures.
   *
   * **Preparation rather than procedure**, which is the rule the hero's film
   * note sets out and the one that matters most on this particular card. Oral
   * surgery is the treatment on this page a reader is most likely to be
   * frightened of, and the honest way to photograph it is the half that shows
   * care being taken: instruments counted out on a clean field, nobody in the
   * chair, no anatomy anywhere in frame.
   */
  oralSurgery: {
    src: '/site/t-oralsurgery.webp',
    width: 800,
    height: 600,
    source: pexels('33172527'),
  },
  implants: {
    src: '/site/t-implants.webp',
    width: 800,
    height: 600,
    source: unsplash('1771442873035-474765b40ac6'),
  },
  /**
   * A technician at the bench, shot over the shoulder — trays, shade bottles,
   * the furnace behind.
   *
   * Wider than `crowns` on purpose. That one is hands and a prosthesis in close
   * up, and the two sit two rows apart in the same grid; a second pair of hands
   * holding a second prosthesis would read as the same photograph printed twice,
   * which is the specific way a wall of eleven images looks broken. This one is
   * the room the work happens in rather than the work.
   */
  dentures: {
    src: '/site/t-dentures.webp',
    width: 800,
    height: 600,
    source: pexels('7788493'),
  },
  orthodontics: {
    src: '/site/t-orthodontics.webp',
    width: 800,
    height: 600,
    source: unsplash('1564420228450-d9a5bc8d6565'),
  },
  whitening: {
    src: '/site/t-whitening.webp',
    width: 800,
    height: 600,
    source: unsplash('1617812191081-2a24e3f30e45'),
  },
} satisfies Record<TreatmentKey, SitePhoto>;

/**
 * What each photograph is *of*, for the wall on the gallery page.
 *
 * Three, and no more than three. The front page's carousel shows all nine in
 * one reel and needs no such thing; the page shows them as a wall with a filter
 * over it, and a filter is only worth having when a reader can hold the whole
 * set of choices in their head at once. Rooms, people, and the care itself —
 * instruments, the scanner, the autoclave — is where the nine actually fall,
 * and a fourth bucket would be invented rather than found.
 *
 * Ordered here rather than in the component so the pills always read the same
 * way round.
 */
export const GALLERY_GROUPS = ['rooms', 'people', 'care'] as const;

export type GalleryGroup = (typeof GALLERY_GROUPS)[number];

/**
 * The gallery, in the order it is shown.
 *
 * Deliberately mixed: rooms, instruments and people. A carousel of eight
 * treatment rooms is a carousel nobody swipes past the second slide of, and a
 * carousel of eight smiling strangers is a stock-photo advert. Alternating is
 * what makes it read as a place rather than a brochure.
 *
 * `group` files each one for the gallery page's filter; `wide` marks the two
 * that take a double cell in its mosaic. Two, and always the same two, so the
 * wall has a shape rather than a rhythm that changes every time somebody adds a
 * photograph — and one from each of the two largest groups, so filtering to
 * either still leaves the grid with something to lead on.
 */
export const GALLERY: readonly (SitePhoto & {
  key: string;
  group: GalleryGroup;
  wide?: boolean;
})[] = [
  { key: 'roomOrange', src: '/site/g-room-orange.webp', width: 900, height: 600, source: unsplash('1598256989800-fe5f95da9787'), group: 'rooms', wide: true },
  { key: 'portrait', src: '/site/g-portrait.webp', width: 900, height: 600, source: unsplash('1567516364473-233c4b6fcfbe'), group: 'people' },
  { key: 'instruments', src: '/site/g-instruments.webp', width: 900, height: 600, source: unsplash('1606811856475-5e6fcdc6e509'), group: 'care' },
  { key: 'roomBright', src: '/site/g-room-bright.webp', width: 900, height: 600, source: unsplash('1629909613654-28e377c37b09'), group: 'rooms' },
  { key: 'laugh', src: '/site/g-laugh.webp', width: 900, height: 600, source: unsplash('1617812191081-2a24e3f30e45'), group: 'people' },
  { key: 'scanner', src: '/site/g-scanner.webp', width: 900, height: 600, source: unsplash('1667133295315-820bb6481730'), group: 'care', wide: true },
  { key: 'sterile', src: '/site/g-sterile.webp', width: 900, height: 599, source: unsplash('1555085575-47bd89db1be4'), group: 'care' },
  { key: 'light', src: '/site/g-light.webp', width: 900, height: 600, source: unsplash('1698749778813-ad5f2814e50f'), group: 'rooms' },
  { key: 'young', src: '/site/g-young.webp', width: 900, height: 600, source: unsplash('1611695434369-a8f5d76ceb7b'), group: 'people' },
];

/**
 * One photograph per step of the first visit, for the panel that follows the
 * cursor down that list.
 *
 * **All five are already on the site**, and that is deliberate rather than
 * lazy. The section is five short paragraphs about an hour in a chair; five
 * *new* photographs to illustrate it would be five more stock images to caption,
 * license and eventually replace, for a panel that is decoration — it is
 * `aria-hidden`, and every word it illustrates is already written beside it.
 *
 * Chosen to be distinguishable at a glance rather than literal. A reader moving
 * down the list should see the picture change; they should not have to work out
 * what a photograph of a plan would even be. So: a person, a mouth being looked
 * at, the scanner that makes the record, radiographs being read, and somebody
 * who has finished and is pleased about it.
 *
 * **Declared after `GALLERY` and not beside `TREATMENT_PHOTOS`**, because it
 * reads from it. A `const` is in its temporal dead zone until the line that
 * declares it runs, so the tidier-looking placement higher up this file throws
 * `Cannot access 'GALLERY' before initialization` the moment the module is
 * imported — at render, on the server, for a photograph.
 */
export const FIRST_VISIT_PHOTOS: Record<string, SitePhoto> = {
  listen: GALLERY.find((photo) => photo.key === 'portrait')!,
  examine: TREATMENT_PHOTOS.checkup,
  record: GALLERY.find((photo) => photo.key === 'scanner')!,
  // The one that is a stretch, and the least bad of the options: a clinician
  // reading radiographs on a screen is the moment before the plan exists, which
  // is closer than anything else here to a photograph of deciding.
  plan: TREATMENT_PHOTOS.rootCanal,
  decide: GALLERY.find((photo) => photo.key === 'laugh')!,
};

/**
 * A gallery photograph by name, so the sets below can be written as prose
 * rather than as index arithmetic.
 *
 * Throws rather than returning undefined. Every call site is a module-level
 * constant, so a typo here fails the moment the module is imported -- on the
 * server, at the first render -- rather than rendering a treatment page with
 * one hole in its mosaic that nobody notices until a patient does.
 */
function gallery(key: string): SitePhoto {
  const photo = GALLERY.find((entry) => entry.key === key);
  if (!photo) throw new Error(`photos.ts: no gallery photograph named "${key}"`);
  return photo;
}

/**
 * Every photograph on one treatment's own page, beyond the one in its hero.
 *
 * **The complaint this answers was that those eleven pages were one page.**
 * Each carried a single picture -- the same file the card on the front page
 * uses, run behind the opening band -- and then four screens of type on cream.
 * A practice's page about veneers and its page about an extraction looked
 * identical, which is the exact opposite of what somebody who searched for one
 * of them came for.
 *
 * So each treatment gets a set of its own, and the set is the page's structure
 * rather than decoration bolted onto it: `steps` are the three grounds the
 * "how it goes" cards are built on, and `wall` is the mosaic that breaks the
 * page's middle.
 *
 * **These are drawn from the pool this site already ships and not from eleven
 * new downloads.** Every file here is already licensed, already cropped, already
 * converted and already recorded above with its source -- and the whole set on
 * disk is under a megabyte, which is the number that stops being true the moment
 * somebody adds fifty-five more images to make eleven pages look busy. Files
 * recur *between* pages, which nobody reading one of them can see; what matters
 * is what recurs *on* one, and no treatment's `steps` and `wall` share a
 * photograph.
 *
 * The one repetition that is deliberate: a treatment's own picture -- the file
 * its card on the front page uses, and the one running behind its opening band
 * -- appears again as the middle step, because the middle step is the treatment
 * and that is what the photograph is of. Two treatments' pages also show a
 * neighbour's picture again in the "usually alongside this" pair at the very
 * bottom, four screens down, where it is a link to another page rather than an
 * illustration of this one.
 *
 * The `steps` triples are ordered to the shape `TREATMENT_STEPS` fixes -- what
 * is looked at, what happens in the chair, what you leave with -- so the
 * pictures move through the appointment in the same order the words do: a scan
 * or an examination, then the work or the bench, then a room or somebody who has
 * finished. Where a treatment has no honest picture of its middle step, the
 * instruments or the lamp stand in; neither claims anything.
 *
 * **Still placeholders, every one.** The rule at the top of this file has not
 * changed and this constant does not weaken it: nothing here is Shehu Dental,
 * the pages carry `how.illustrative` under the mosaic saying so, and swapping in
 * the practice's own photography is a matter of replacing files at the paths
 * already named above rather than of touching this table.
 */
export type TreatmentPhotoSet = {
  /** One ground per step, in the order the steps are told. */
  steps: readonly [SitePhoto, SitePhoto, SitePhoto];
  /** The mosaic in the middle of the page. Five, and the first one leads it. */
  wall: readonly [SitePhoto, SitePhoto, SitePhoto, SitePhoto, SitePhoto];
};

export const TREATMENT_GALLERY = {
  checkup: {
    steps: [gallery('scanner'), TREATMENT_PHOTOS.checkup, gallery('laugh')],
    wall: [
      PHOTOS.surgery,
      gallery('instruments'),
      gallery('roomBright'),
      gallery('sterile'),
      gallery('light'),
    ],
  },
  fillings: {
    steps: [TREATMENT_PHOTOS.checkup, TREATMENT_PHOTOS.fillings, gallery('laugh')],
    wall: [
      gallery('roomOrange'),
      gallery('instruments'),
      PHOTOS.heroDetail,
      gallery('sterile'),
      gallery('young'),
    ],
  },
  rootCanal: {
    steps: [TREATMENT_PHOTOS.rootCanal, gallery('light'), TREATMENT_PHOTOS.crowns],
    wall: [
      PHOTOS.surgery,
      gallery('scanner'),
      gallery('instruments'),
      gallery('sterile'),
      gallery('roomBright'),
    ],
  },
  crowns: {
    steps: [gallery('scanner'), TREATMENT_PHOTOS.crowns, TREATMENT_PHOTOS.veneers],
    wall: [
      TREATMENT_PHOTOS.dentures,
      gallery('instruments'),
      PHOTOS.surgery,
      gallery('laugh'),
      gallery('roomBright'),
    ],
  },
  veneers: {
    steps: [TREATMENT_PHOTOS.veneers, TREATMENT_PHOTOS.crowns, gallery('laugh')],
    wall: [
      PHOTOS.heroSmile,
      TREATMENT_PHOTOS.whitening,
      gallery('portrait'),
      gallery('young'),
      PHOTOS.surgery,
    ],
  },
  extraction: {
    steps: [TREATMENT_PHOTOS.rootCanal, TREATMENT_PHOTOS.extraction, gallery('laugh')],
    wall: [
      PHOTOS.surgery,
      gallery('instruments'),
      gallery('sterile'),
      gallery('roomOrange'),
      PHOTOS.heroDetail,
    ],
  },
  oralSurgery: {
    steps: [gallery('scanner'), TREATMENT_PHOTOS.oralSurgery, gallery('roomBright')],
    wall: [
      gallery('sterile'),
      gallery('instruments'),
      gallery('light'),
      PHOTOS.surgery,
      TREATMENT_PHOTOS.extraction,
    ],
  },
  implants: {
    steps: [gallery('scanner'), TREATMENT_PHOTOS.implants, TREATMENT_PHOTOS.crowns],
    wall: [
      TREATMENT_PHOTOS.oralSurgery,
      gallery('sterile'),
      PHOTOS.surgery,
      gallery('laugh'),
      gallery('roomBright'),
    ],
  },
  dentures: {
    steps: [TREATMENT_PHOTOS.checkup, TREATMENT_PHOTOS.dentures, gallery('young')],
    wall: [
      TREATMENT_PHOTOS.crowns,
      gallery('instruments'),
      PHOTOS.surgery,
      gallery('portrait'),
      gallery('roomOrange'),
    ],
  },
  orthodontics: {
    steps: [gallery('scanner'), TREATMENT_PHOTOS.orthodontics, gallery('young')],
    wall: [
      PHOTOS.heroSmile,
      gallery('laugh'),
      gallery('portrait'),
      gallery('roomBright'),
      TREATMENT_PHOTOS.whitening,
    ],
  },
  whitening: {
    steps: [TREATMENT_PHOTOS.veneers, TREATMENT_PHOTOS.whitening, gallery('laugh')],
    wall: [
      PHOTOS.heroSmile,
      gallery('portrait'),
      gallery('young'),
      PHOTOS.surgery,
      gallery('light'),
    ],
  },
} as const satisfies Record<TreatmentKey, TreatmentPhotoSet>;

/**
 * The squares in the social grid.
 *
 * **These are not the practice's Instagram posts.** `instagram.com/shehu.dental`
 * is behind a login wall — the profile page returns a sign-in shell to anybody
 * who is not signed in, and there is no public endpoint left to read it from —
 * so nothing here was fetched from that account and nothing here is a real post.
 * The section that renders them says so on the page, in every language, and
 * links out to the real profile rather than pretending to be it. Publishing a
 * grid of stock photographs under somebody's Instagram handle as though it were
 * their feed is a fabricated record, and the honest version costs one line of
 * caption.
 *
 * Replacing them is the easy half: export six squares from the account, drop
 * them in at these paths, set `source` to null, and delete the caption's
 * placeholder line from `messages/*.json`.
 */
export const SOCIAL: readonly (SitePhoto & { key: string })[] = [
  { key: 's1', src: '/site/s-1.webp', width: 600, height: 600, source: unsplash('1494790108377-be9c29b29330') },
  { key: 's2', src: '/site/s-2.webp', width: 700, height: 700, source: unsplash('1617812191081-2a24e3f30e45') },
  { key: 's3', src: '/site/s-3.webp', width: 600, height: 600, source: unsplash('1609840113564-ab4aba4956c4') },
  { key: 's4', src: '/site/s-4.webp', width: 700, height: 700, source: unsplash('1595152772835-219674b2a8a6') },
  { key: 's5', src: '/site/s-5.webp', width: 658, height: 658, source: unsplash('1663182234283-28941e7612da') },
  { key: 's6', src: '/site/s-6.webp', width: 700, height: 700, source: unsplash('1535295972055-1c762f4483e5') },
];

/** The account the social grid links out to. */
export const INSTAGRAM_HANDLE = 'shehu.dental';
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
