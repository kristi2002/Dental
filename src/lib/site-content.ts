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
  'implants',
  'extraction',
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
 * The eight, in the order they are shown.
 *
 * There were six for as long as the section was built out of the app's own
 * dental chart: `ToothGlyph` models eight tooth states and only six of them
 * correspond to work a patient books, so orthodontics and whitening were a
 * footnote underneath. That was a constraint of the drawing and never of the
 * practice — both are things this clinic does, and for a good share of the
 * people arriving from abroad they are the reason for the trip. With
 * photographs there is nothing to be short of, and they are cards like the rest.
 *
 * Ordered roughly by how a mouth is worked through rather than by price: what is
 * checked, what is repaired, what is replaced, then what is straightened and
 * brightened. A list that opens with implants is a price list.
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
  { key: 'looks', treatments: ['whitening', 'crowns'], topic: 'whitening' },
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
  implants: { visits: [2, 3], days: [3, 4], months: [3, 6] },
  extraction: { visits: [1, 1], days: [1, 2], months: [0, 0] },
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
