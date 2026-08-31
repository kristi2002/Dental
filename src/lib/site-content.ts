/**
 * The shape of the practice's public page, with none of its words.
 *
 * Every string a visitor reads lives in `messages/*.json` under `site`, because
 * the page is read in three languages and a translator must be able to work on
 * it without touching TypeScript. What lives here is the part that is *not*
 * language: which treatments the page offers and in what order.
 *
 * Deliberately free of any server import. This list drives two things that sit
 * on opposite sides of the network — the section a server component renders, and
 * the topic a visitor picks in the request form, which is a client component.
 * One list, imported by both, is what stops those two drifting into disagreement
 * about what this practice does.
 */

/**
 * The keys, as a union rather than as strings.
 *
 * This is what makes the promise in `photos.ts` enforceable: that file declares
 * `satisfies Record<TreatmentKey, SitePhoto>`, so adding a treatment here
 * without adding its photograph there fails the typecheck instead of rendering a
 * card with a broken image on the deployed page. The wording is checked the same
 * way, one layer along, by `tests/messages.test.ts`.
 */
export const TREATMENT_KEYS = [
  'checkup',
  'fillings',
  'rootCanal',
  'crowns',
  'veneers',
  'extraction',
  'oralSurgery',
  'implants',
  'dentures',
  'orthodontics',
  'whitening',
] as const;

export type TreatmentKey = (typeof TREATMENT_KEYS)[number];

export type Treatment = {
  /**
   * The key its wording is filed under (`site.treatments.<key>.title` / `.body`)
   * and its photograph (`TREATMENT_PHOTOS[key]`).
   */
  key: TreatmentKey;
};

/**
 * The eleven, in the order they are shown.
 *
 * There were six for as long as the section was built out of the app's own
 * dental chart: `ToothGlyph` models eight tooth states and only six of them
 * correspond to work a patient books, so orthodontics and whitening were a
 * footnote underneath. That was a constraint of the drawing and never of the
 * practice — both are things this clinic does, and for a good share of the
 * people arriving from abroad they are the reason for the trip. With
 * photographs there is nothing to be short of, and they are cards like the rest.
 *
 * **Three more were added from the practice's own printed list**, which is the
 * only source here that is actually authoritative about what this clinic does:
 * `veneers` (Faseta), `oralSurgery` (Kirurgji orale) and `dentures` (Protezim).
 * The eight above were written from the app's tooth states and inherited that
 * list's blind spots — a removable denture is not a state a tooth can be in, so
 * it was never modelled and therefore never offered, which is exactly the wrong
 * reason for a service to be missing from a practice's website.
 *
 * Two entries on that printed list are deliberately *not* separate keys.
 * "Implantologji" is `implants`, and "Punime porcelani, zirkoni" is a material
 * rather than a treatment — it is what `crowns` and `veneers` are made of, and
 * it is named in both of their bodies. A card headed with a material is a card a
 * patient cannot match to anything they came here worried about.
 *
 * **`extraction` and `oralSurgery` are both here and they are not duplicates.**
 * The first is a tooth coming out, which is what a patient searches for and the
 * words they use for it; the second is the surgical work around it — impacted
 * teeth, and the bone grafting an implant sometimes needs first. Folding the
 * plain one into the clinical one would file the most-searched treatment on this
 * page under a name nobody types.
 *
 * Ordered roughly by how a mouth is worked through rather than by price: what is
 * checked, what is repaired, what is removed, what is replaced, then what is
 * straightened and brightened. A list that opens with implants is a price list.
 *
 * **The count is load-bearing for the grid.** `Treatments.tsx` gives the lead
 * card a two-column span at every width that has two columns, so the section
 * occupies `n + 1` cells; eleven treatments is twelve cells, which is six exact
 * rows of two and four exact rows of three. Eight worked for the same reason and
 * nine, ten or twelve would each leave a hole under the last row at one width or
 * the other. A twelfth treatment means revisiting that span, not just this list.
 */
export const TREATMENTS: readonly Treatment[] = TREATMENT_KEYS.map((key) => ({ key }));

/**
 * What the request form lets somebody pick, and the only values the action will
 * store in `AppointmentRequest.topic`.
 *
 * The eight above plus one for everything else. Keys rather than names: what the
 * desk reads back is rendered from `messages` in whatever language *they* are
 * working in, which is not necessarily the language the request was written in.
 */
export const REQUEST_TOPICS: readonly string[] = [
  ...TREATMENTS.map((treatment) => treatment.key),
  'other',
];

export function isRequestTopic(value: string): boolean {
  return REQUEST_TOPICS.includes(value);
}

/**
 * The caps the request form and the action both hold to.
 *
 * Enforced in the action, mirrored on the inputs as `maxLength` so a visitor
 * finds out while typing rather than after pressing the button. Not a database
 * constraint: a column limit produces a Postgres error, and what this needs to
 * produce is a sentence in the language the page is in.
 */
export const REQUEST_LIMITS = {
  name: 120,
  phone: 40,
  email: 160,
  message: 1200,
} as const;

/**
 * Half a day, and the option of not minding.
 *
 * The booking page's calendar asks which *day* suits, and this asks the only
 * follow-up question a practice can usefully answer before it has looked at the
 * book. It is deliberately not a list of times: offering 09:20 on a public form
 * is a promise nobody has checked, and the desk would then be ringing back to
 * take it away again.
 *
 * `'any'` is the default and is never stored — the column holds null for it, so
 * "they did not mind" and "they were never asked" are the same row, which is
 * exactly right for a field that is optional on the form and absent from every
 * request written before it existed.
 */
export const PREFERRED_TIMES = ['morning', 'afternoon'] as const;

export type PreferredTime = (typeof PREFERRED_TIMES)[number];

export function isPreferredTime(value: string): value is PreferredTime {
  return (PREFERRED_TIMES as readonly string[]).includes(value);
}

/**
 * Noon, in minutes since midnight, on the clinic's own clock.
 *
 * The line the booking page splits a day's open stretches at, so "morning" is
 * offered only on a day that has some morning open and "afternoon" only on one
 * that does not shut at one. A practice working 14:00–19:00 on a Wednesday
 * should not be handed a request asking for Wednesday morning.
 */
export const MIDDAY_MINUTES = 12 * 60;

/**
 * "What brings you in?" — the six reasons somebody opens a dentist's website.
 *
 * This is the page's interactive way into the treatment list, and it is
 * deliberately **not** an odontogram. A clickable dental chart was built for
 * this section and removed again: it was legible and operable and it still read
 * as clip-art beside real photography, which is the third time this codebase has
 * reached that conclusion — `Treatments.tsx` dropped the app's own tooth chart
 * from the public page, and `HeroStage` rejected the cutaway molar.
 *
 * **Each of these is a sentence somebody already knows the answer to.** "A tooth
 * is missing" needs no anatomy and no self-diagnosis, where a drawing asks a
 * worried person to point at what is wrong with them before they have spoken to
 * anybody. Both land the reader on the same treatment.
 *
 * `treatments` names what the concern usually means — plural where it honestly
 * is, because a missing tooth is an implant *or* a bridge and saying only
 * "implants" would be selling rather than answering. `topic` is the one the
 * request form is set to, and it is the more common of the pair.
 */
export const CONCERNS = [
  { key: 'missing', treatments: ['implants', 'crowns'], topic: 'implants' },
  { key: 'pain', treatments: ['rootCanal', 'fillings'], topic: 'rootCanal' },
  // `veneers` replaced `crowns` here the moment it existed as a treatment of its
  // own. Somebody who dislikes how their teeth look is asking a cosmetic
  // question, and the honest pair for that is whitening or veneers; a crown is
  // what you fit when a tooth is broken, and offering it as an answer to "I
  // don't like how they look" is how a website talks somebody into a bur.
  { key: 'looks', treatments: ['whitening', 'veneers'], topic: 'whitening' },
  { key: 'crooked', treatments: ['orthodontics'], topic: 'orthodontics' },
  { key: 'gums', treatments: ['checkup'], topic: 'checkup' },
  { key: 'overdue', treatments: ['checkup'], topic: 'checkup' },
] as const satisfies readonly {
  key: string;
  treatments: readonly TreatmentKey[];
  topic: TreatmentKey;
}[];

export type ConcernKey = (typeof CONCERNS)[number]['key'];

/**
 * What to offer a reader at the bottom of one treatment's own page.
 *
 * Each treatment now has a page to itself, and a page a stranger lands on from a
 * search result is a dead end unless it says where to go next. Two each, and
 * they are **clinical neighbours rather than upsells**: what the same mouth
 * usually needs alongside this, or the other honest answer to the same problem.
 *
 * That distinction is the whole reason this is a hand-written table and not
 * something derived from `CONCERNS`. Deriving it would produce the treatments
 * that share a *marketing* entry point, which is how a page about an extraction
 * ends up recommending whitening. These pairs are the ones a dentist would
 * actually say in the room — an extraction leads to what fills the gap, a root
 * canal leads to the crown that protects it afterwards.
 *
 * Keys only, no wording: both ends are already written in `messages`, and a
 * label here would be a fourth place to translate the name of a treatment.
 */
export const TREATMENT_RELATED = {
  checkup: ['fillings', 'whitening'],
  fillings: ['rootCanal', 'crowns'],
  // The crown is not decoration on a root-filled molar; what is left of it is
  // thinner than it was, which is what `detail.rootCanal` already tells them.
  rootCanal: ['crowns', 'fillings'],
  crowns: ['veneers', 'implants'],
  veneers: ['whitening', 'crowns'],
  extraction: ['implants', 'oralSurgery'],
  oralSurgery: ['implants', 'extraction'],
  implants: ['crowns', 'oralSurgery'],
  dentures: ['implants', 'crowns'],
  orthodontics: ['veneers', 'checkup'],
  whitening: ['veneers', 'checkup'],
} as const satisfies Record<TreatmentKey, readonly TreatmentKey[]>;

/**
 * The steps each treatment is broken into on its own page — three, always.
 *
 * A count rather than a list of contents: the wording lives in `messages` under
 * `pages.treatment.steps.<key>.<one|two|three>`, and what this constant fixes is
 * that every treatment is described in the same *shape*. Three is what makes the
 * eleven pages read as one site — a treatment given five steps and the next given
 * two is two people writing, and the reader feels it before they can name it.
 *
 * Three is also honest for all eleven. Every treatment here genuinely has a
 * before, a during and an after — what is examined and agreed, what happens in
 * the chair, and what the patient leaves with — and none of them needed padding
 * or squeezing to fit it.
 */
export const TREATMENT_STEPS = ['one', 'two', 'three'] as const;

export type TreatmentStepKey = (typeof TREATMENT_STEPS)[number];

/**
 * Which of three shapes a treatment's own page is built in.
 *
 * **The eleven pages under `/treatments/` were one page eleven times.** Same
 * bands in the same order on every one of them -- opening, paragraph, three
 * steps, timings, neighbours -- with the treatment's name and one photograph
 * swapped in. That is defensible as a system and it is wrong as a set of pages:
 * a reader who follows two of them in a row has read the same page twice, and a
 * practice whose page about whitening is laid out identically to its page about
 * oral surgery is telling the reader it has nothing particular to say about
 * either.
 *
 * The fix is not eleven bespoke layouts -- that is eleven places to make the
 * next change. It is that **the order of the bands is an argument about the
 * reader**, and the eleven treatments here have three genuinely different
 * readers:
 *
 *   `direct` -- the treatment is done and finished inside a couple of days, so
 *   the reader's question is *what happens*. The steps come first, drawn as a
 *   chain across the page, and the timings are a footnote at the end because
 *   there is barely anything to plan around.
 *
 *   `journey` -- the treatment is staged over months or over a second trip, so
 *   the reader's first question is not clinical at all, it is *how long does
 *   this keep me here*. The timings come immediately after the opening, before
 *   anything else, and the steps are drawn down a vertical spine, which is the
 *   shape of a thing that happens in stages rather than in an afternoon.
 *
 *   `showcase` -- the reader is choosing rather than being treated, and what
 *   they want to see is the work and the place. The mosaic comes up the page,
 *   ahead of the steps, and the timings sit where they belong for somebody who
 *   has already decided they like the look of it: last.
 *
 * The assignment is clinical, not decorative, and it should be read against
 * `TREATMENT_TIMING` -- every `journey` treatment there has a non-zero `months`
 * or a stay of four days and up, and every `direct` one is a single trip of two
 * days or less. `crowns` is the one judgement call: it is a two-visit
 * laboratory job with a month's tail, which would make it a `journey`, but what
 * a patient is actually choosing when they read that page is what the finished
 * tooth will look like. It is filed with the cosmetic work on purpose.
 */
export const TREATMENT_MOVEMENTS = ['direct', 'journey', 'showcase'] as const;

export type TreatmentMovement = (typeof TREATMENT_MOVEMENTS)[number];

export const TREATMENT_MOVEMENT = {
  checkup: 'direct',
  fillings: 'direct',
  rootCanal: 'journey',
  crowns: 'showcase',
  veneers: 'showcase',
  extraction: 'direct',
  oralSurgery: 'journey',
  implants: 'journey',
  dentures: 'journey',
  orthodontics: 'showcase',
  whitening: 'showcase',
} as const satisfies Record<TreatmentKey, TreatmentMovement>;

/**
 * The URL each treatment's own page lives at, under `/treatments/`.
 *
 * Written out rather than derived from the key by a camelCase-to-kebab
 * transform. The transform would produce all eleven of these correctly today,
 * and that is exactly the problem: a URL that is computed is a URL that silently
 * changes the day somebody renames a key, and a published address that changes
 * is a 404 in somebody's search results and in whatever they bookmarked. Spelled
 * out, renaming the key is a compile error here and a decision somebody has to
 * make on purpose.
 *
 * **English, in all three languages.** `routing.ts` prefixes every path with the
 * locale and defines no localized `pathnames`, so `/sq/treatments` is already the
 * Albanian route; the segment under it stays in the same vocabulary as the four
 * pages above it rather than being the one part of the site that is translated
 * into the URL bar.
 */
export const TREATMENT_SLUGS = {
  checkup: 'checkup',
  fillings: 'fillings',
  rootCanal: 'root-canal',
  crowns: 'crowns-and-bridges',
  veneers: 'veneers',
  extraction: 'extraction',
  oralSurgery: 'oral-surgery',
  implants: 'implants',
  dentures: 'dentures',
  orthodontics: 'orthodontics',
  whitening: 'whitening',
} as const satisfies Record<TreatmentKey, string>;

/** `/treatments/root-canal`, under whatever locale the caller is in. */
/**
 * The shared-element name a treatment's photograph answers to on both sides of
 * a navigation — the card in the grid, and the hero on the page it opens.
 *
 * A function rather than a template literal written out at each call site,
 * because the two sides live in different files and a morph that stops pairing
 * is the hardest kind of visual bug to notice: nothing breaks and no error is
 * raised, the animation simply stops happening and the page cuts instead.
 */
export function treatmentTransitionName(key: TreatmentKey): string {
  return `treatment-${key}`;
}

export function treatmentPath(key: TreatmentKey): string {
  return `/treatments/${TREATMENT_SLUGS[key]}`;
}

/**
 * The treatment a URL segment names, or null.
 *
 * Null rather than a throw: the caller is a route handling whatever a stranger
 * typed, and the correct answer to `/treatments/wisdom-teeth` is a 404 page
 * rather than a 500.
 */
export function treatmentBySlug(slug: string): TreatmentKey | null {
  return TREATMENT_KEYS.find((key) => TREATMENT_SLUGS[key] === slug) ?? null;
}

/**
 * How long each treatment takes, for somebody deciding whether to book a flight.
 *
 * ⚠️ **These numbers are provisional and must be confirmed by Dr. Shehu before
 * this section is shown to the public.** They are ordinary textbook figures for
 * each procedure — an implant integrates in three to six months whoever places
 * it — and not this practice's own measured turnaround, which is the only figure
 * that has any business being on its website. `TripPlanner` says on the page
 * that the estimate is indicative and confirmed in writing at the first visit,
 * which is the practice's stated rule anyway; that is what makes publishing a
 * range honest rather than a promise nobody made.
 *
 * **There is deliberately no price here, and no comparison to prices abroad.**
 * That was the other half of the request and it is the half that cannot be
 * built: this codebase holds no price list, `TREATMENTS` has no price field, and
 * the ordering note above says why in one line — "a list that opens with
 * implants is a price list". Inventing a figure for an implant, or quoting what
 * a clinic in Milan charges, would be publishing two numbers nobody has sourced
 * on a page a patient is using to make a medical decision. When the practice has
 * a real tariff, it belongs here as a `from` figure with the date it was set.
 *
 * Every range is `[low, high]` and inclusive. `months` is time from the first
 * appointment to the finished result: zero means it is done on the same trip.
 */
export type TreatmentTiming = {
  /** Appointments in the chair. */
  visits: readonly [number, number];
  /** Days the patient needs to be in Vlorë for the first stage. */
  days: readonly [number, number];
  /** Months from start to finish. Zero is a single trip. */
  months: readonly [number, number];
};

export const TREATMENT_TIMING = {
  checkup: { visits: [1, 1], days: [1, 1], months: [0, 0] },
  fillings: { visits: [1, 2], days: [1, 2], months: [0, 0] },
  rootCanal: { visits: [1, 2], days: [2, 3], months: [0, 0] },
  crowns: { visits: [2, 3], days: [4, 6], months: [0, 1] },
  veneers: { visits: [2, 3], days: [4, 6], months: [0, 1] },
  extraction: { visits: [1, 1], days: [1, 2], months: [0, 0] },
  oralSurgery: { visits: [1, 2], days: [2, 4], months: [0, 1] },
  implants: { visits: [2, 3], days: [3, 4], months: [3, 6] },
  // The longest stay on the page, and it moves the scale under every other bar
  // — which is the behaviour `TIMING_SCALE` is computed for rather than a
  // problem with it. A full denture is impressions, a bite, a try-in in wax and
  // a fit, and none of those four can be collapsed into the same afternoon.
  dentures: { visits: [4, 5], days: [7, 10], months: [1, 2] },
  orthodontics: { visits: [2, 2], days: [2, 3], months: [12, 24] },
  whitening: { visits: [1, 2], days: [1, 2], months: [0, 0] },
} as const satisfies Record<TreatmentKey, TreatmentTiming>;

/**
 * The longest of each figure across every treatment, computed rather than
 * written down.
 *
 * The treatments page draws the visits and the days as a filled bar, and a bar
 * needs something to be a fraction *of*. Taking the maximum from the table
 * itself is what stops the scale becoming a second fact nobody maintains: add a
 * ninth treatment that keeps somebody here for nine days and every bar on the
 * page rescales, rather than the new one running off the end of a `6` somebody
 * typed in a stylesheet a year ago.
 *
 * The upper bound of each range, not the lower: a bar is showing "how much of
 * the longest is this", and the honest answer to that for a four-to-six-day
 * treatment is six.
 */
export const TIMING_SCALE: { visits: number; days: number; months: number } = (() => {
  const all = Object.values(TREATMENT_TIMING);
  const top = (pick: (timing: TreatmentTiming) => number) =>
    all.reduce((highest, timing) => Math.max(highest, pick(timing)), 0);

  return {
    visits: top((timing) => timing.visits[1]),
    days: top((timing) => timing.days[1]),
    months: top((timing) => timing.months[1]),
  };
})();

export type TripEstimate = {
  visits: [number, number];
  days: [number, number];
  months: [number, number];
  /** Two when anything selected needs healing time, one otherwise. */
  trips: 1 | 2;
};

/**
 * What a set of treatments adds up to, for a person booking travel.
 *
 * The arithmetic is not a straight sum, and the three rules are worth stating
 * because a plausible-looking total is the easy way to mislead somebody into
 * buying the wrong ticket.
 *
 * **Visits add up.** Two treatments are two courses of appointments; there is no
 * honest way to make that fewer.
 *
 * **Days do not.** A practice seeing somebody who has flown in works them into
 * as few days as it can, so the trip is as long as the *longest* treatment needs
 * plus a day for each additional one — not the sum, which would tell a patient
 * wanting a check-up and a filling to book eight days for two hours of work.
 *
 * **Months run in parallel.** An implant integrating for four months does not
 * take longer because a crown was fitted in the same week, so the total is the
 * longest, not the sum.
 *
 * An empty selection returns zeroes; the component renders its prompt rather
 * than a table of noughts.
 */
export function estimateTrip(keys: readonly TreatmentKey[]): TripEstimate {
  if (keys.length === 0) {
    return { visits: [0, 0], days: [0, 0], months: [0, 0], trips: 1 };
  }

  const timings = keys.map((key) => TREATMENT_TIMING[key]);

  const sum = (pick: (timing: TreatmentTiming) => number) =>
    timings.reduce((total, timing) => total + pick(timing), 0);
  const max = (pick: (timing: TreatmentTiming) => number) =>
    timings.reduce((highest, timing) => Math.max(highest, pick(timing)), 0);

  const extra = keys.length - 1;

  return {
    visits: [sum((timing) => timing.visits[0]), sum((timing) => timing.visits[1])],
    days: [max((timing) => timing.days[0]) + extra, max((timing) => timing.days[1]) + extra],
    months: [max((timing) => timing.months[0]), max((timing) => timing.months[1])],
    trips: max((timing) => timing.months[1]) > 0 ? 2 : 1,
  };
}

/**
 * What each treatment costs, from.
 *
 * ⚠️ **Empty, and it ships empty.** The brief asked for a calculator showing
 * "cost comparisons against standard European prices", and both halves of that
 * sentence are numbers nobody has given this codebase:
 *
 *   - **This practice's prices.** There is no tariff anywhere in this
 *     repository. `TREATMENTS` has never had a price field, and the note on its
 *     ordering says why in one line — "a list that opens with implants is a
 *     price list". Inventing a figure for an implant on a real clinic's website
 *     is not a placeholder; it is a quotation the practice would be held to.
 *
 *   - **The comparison.** "Standard European prices" is not a fact that exists
 *     — it varies by country, city and clinic, and published averages are
 *     usually somebody's marketing. Printing one beside this practice's own
 *     figure is a comparative advertising claim, which in most of the markets
 *     this page is translated for has to be substantiable on request.
 *
 * So `TripPlanner` renders the timings, which are clinical and answerable, and
 * shows a "from" line **only for treatments that appear here**. An empty table
 * means the cost rows simply do not render; nothing is guessed and nothing is
 * hidden.
 *
 * To turn it on: fill in the treatments the practice is willing to quote a floor
 * for, set `PRICES_REVIEWED`, and leave out any treatment whose price genuinely
 * depends on the examination. A partial table is correct and expected — a crown
 * with a "from" and an implant without one says something true.
 *
 * For a comparison figure, add the source alongside it and the date it was
 * read. If it cannot be sourced, it does not go on the page.
 */
export type TreatmentPrice = {
  /** The floor, in `currency`. Never an average, never a "typical". */
  from: number;
  /** ISO 4217. The practice bills in ALL; visitors from abroad think in EUR. */
  currency: string;
};

export const TREATMENT_PRICES: Partial<Record<TreatmentKey, TreatmentPrice>> = {};

/**
 * When the practice last checked the figures above. Shown on the page beside
 * them, because a price with no date is a price nobody can trust.
 *
 * `null` while `TREATMENT_PRICES` is empty.
 */
export const PRICES_REVIEWED: string | null = null;

/** Whether there is anything to show at all. */
export function hasPrices(): boolean {
  return Object.keys(TREATMENT_PRICES).length > 0;
}

/**
 * The floor for a set of treatments, or null when any one of them has no price.
 *
 * Null rather than a partial sum, and that is the important half: adding up the
 * three treatments that happen to have figures and presenting the total as the
 * cost of five is the most misleading thing this function could do. Either the
 * whole basket can be quoted from or none of it can.
 */
export function priceFloor(
  keys: readonly TreatmentKey[],
): { total: number; currency: string } | null {
  if (keys.length === 0) return null;

  const prices = keys.map((key) => TREATMENT_PRICES[key]);
  if (prices.some((price) => price === undefined)) return null;

  const found = prices as TreatmentPrice[];
  const currency = found[0].currency;
  // Mixed currencies would need a rate, a rate needs a date, and a converted
  // "from" is no longer a floor. Refuse instead.
  if (found.some((price) => price.currency !== currency)) return null;

  return { total: found.reduce((sum, price) => sum + price.from, 0), currency };
}

/**
 * What the practice guarantees on the work it does, and for how long.
 *
 * ⚠️ **Empty, and it ships empty** — the same call as `TREATMENT_PRICES` above,
 * for a sharper version of the same reason. A price printed without authority is
 * a quotation the practice would be held to; a guarantee printed without
 * authority is a *contract term*, and in every market this site is translated
 * for it is one a patient could enforce. "Implants guaranteed 10 years" is four
 * words on a page and a decade of liability, and it is not a decision a
 * codebase gets to make on a dentist's behalf.
 *
 * Nor is it guessable from anything already here. The practice's warranty may be
 * per treatment, may be conditional on the patient attending check-ups, and may
 * simply not exist in writing yet — and each of those three is a different page.
 *
 * So `Aftercare` renders the four things the practice demonstrably *does* —
 * every one of them already claimed elsewhere on this site or shipped in the
 * clinic application itself — and renders the guarantee block only when there is
 * something here to render. An empty table means that block does not appear;
 * nothing is implied and nothing is hedged.
 *
 * To turn it on: fill in the treatments Dr. Shehu is willing to stand behind in
 * writing, set `GUARANTEES_REVIEWED`, and leave out anything whose terms are
 * genuinely case-by-case. A partial table is correct and expected — a crown with
 * a term and a filling without one says something true.
 */
export type TreatmentGuarantee = {
  /** Whole years, from the day the work is fitted. Never "up to". */
  years: number;
};

export const TREATMENT_GUARANTEES: Partial<Record<TreatmentKey, TreatmentGuarantee>> = {};

/**
 * When the practice last confirmed the terms above — shown beside them, for the
 * reason `PRICES_REVIEWED` exists: a term with no date is a term nobody can
 * rely on.
 *
 * `null` while `TREATMENT_GUARANTEES` is empty.
 */
export const GUARANTEES_REVIEWED: string | null = null;

/** Whether there is a guarantee block to render at all. */
export function hasGuarantees(): boolean {
  return Object.keys(TREATMENT_GUARANTEES).length > 0 && GUARANTEES_REVIEWED !== null;
}

/* ---------------------------------------------------------------------------
 * The visit page's two gated sections
 * ------------------------------------------------------------------------- */

/**
 * The facts about getting from the pavement to the chair.
 *
 * `/visit` answers *when* the practice is open and *where* the street is, and
 * has never answered the hundred metres between them: where a car goes, which
 * door it is, whether there are stairs. `Directions` is not that answer — it
 * moved to `/abroad` and it is written at the scale of ferries and airports,
 * for somebody deciding whether to cross the Adriatic. A patient already
 * standing on Rruga e Re has a different and much smaller question, and nothing
 * on this site has ever taken it.
 *
 * ⚠️ **Empty, and it ships empty — the call `TREATMENT_PRICES` and
 * `TREATMENT_GUARANTEES` above both make, for the plainest version of the
 * reason.** Not one of these five is derivable from anything already in this
 * repository, and every one of them is the kind of fact a patient acts on
 * physically: a person who reads "parking in front of the building" and finds
 * none has been sent somewhere by this website and let down by it. A guessed
 * price costs an awkward conversation; a guessed doorway costs somebody with a
 * pushchair or a wheelchair their appointment.
 *
 * `Arrival` renders exactly the entries that are set and nothing for the rest,
 * so a partial table is correct and expected — the parking answered and the
 * lift left out says something true, where a section hedging about both says
 * nothing at all. With none set the section does not render.
 *
 * **To turn it on, these are the five questions and none of them are ours:**
 *
 * 1. `parking` — where does a patient leave a car, and is it free?
 * 2. `door` — what does the entrance look like from the street, which floor,
 *    and is there a sign or a bell to press?
 * 3. `access` — step-free or stairs? A lift? Room for a wheelchair or a
 *    pushchair? Answer this one honestly even when the answer is stairs — a
 *    wheelchair user who is told the truth can plan, and one who is told
 *    nothing arrives and cannot get in.
 * 4. `transport` — the furgon or the taxi from the centre of Vlorë: which, and
 *    roughly what does it cost?
 * 5. `landmark` — what is next door, for somebody looking up from a phone?
 *
 * The wording is a translator's, as everywhere: this table names which of the
 * five the practice has an answer for, and `messages/*.json` carries the answer
 * under `pages.visit.arrival.*` in three languages.
 */
export const ARRIVAL_KEYS = ['parking', 'door', 'access', 'transport', 'landmark'] as const;

export type ArrivalKey = (typeof ARRIVAL_KEYS)[number];

/**
 * Which of the five the practice has confirmed. Add a key here and write its
 * `pages.visit.arrival.<key>` strings in all three message files; leaving one
 * out is how a fact nobody has checked stays off the page.
 */
export const ARRIVAL_ANSWERED: ArrivalKey[] = [];

/** Whether there is an arrival section to render at all. */
export function hasArrival(): boolean {
  return ARRIVAL_ANSWERED.length > 0;
}

/**
 * The questions a visitor actually asks, and which of them this practice has
 * answered.
 *
 * ⚠️ **Empty for a reason that is worth writing down, because it is not the
 * same reason as the tables above.** A first draft of this section asked about
 * languages, the written plan, the per-tooth record and sterilisation — and
 * every one of those four is already a card in `WhyUs`, two hundred pixels up
 * the same page. That is not an FAQ; that is the page asking itself questions
 * it has just finished answering, which is exactly the complaint `/visit` makes
 * against `BrandStrip` in its own header and the reason that band is not on
 * this route.
 *
 * Take those four out and what is left is the set of things a person genuinely
 * wants to know before walking in — can I come without an appointment, what do
 * I do if I am in pain today, how do I pay, how long will the first appointment
 * take, can I bring a child — and the practice has never told this repository
 * the answer to a single one of them. So the honest state of a FAQ here is
 * empty, and the honest thing to build is the slot.
 *
 * A question with no answer publishes nothing: `VisitFaq` renders the keys
 * below and `faqJsonLd` is fed the same list, so the section and its structured
 * data cannot disagree about what this practice claims.
 */
export const VISIT_FAQ_KEYS = [
  'walkIn',
  'pain',
  'payment',
  'firstLength',
  'children',
] as const;

export type VisitFaqKey = (typeof VISIT_FAQ_KEYS)[number];

/**
 * Which questions have an answer from the practice, in the order they should be
 * read. Add a key and write `pages.visit.faq.<key>.question` and `.answer` in
 * all three message files.
 */
export const VISIT_FAQ_ANSWERED: VisitFaqKey[] = [];

/** Whether there is a FAQ to render at all. */
export function hasVisitFaq(): boolean {
  return VISIT_FAQ_ANSWERED.length > 0;
}
