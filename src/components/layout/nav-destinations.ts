import type { Permission } from '@/lib/auth/permissions';

type Destination = {
  href: string;
  key: string;
  /** `null` means every signed-in person. */
  permission: Permission | null;
  /**
   * Light up on this exact path only, rather than on everything filed beneath
   * it. Set on the screen a section opens on, whose href is the prefix of every
   * one of its siblings — without this it would read as current on all of them.
   */
  exact?: boolean;
};

/**
 * The blocks the rail is ruled into, in the order they appear.
 *
 * A heading is a label and nothing else: it does not fold, it is not a link,
 * and nothing sits a level deeper for having one over it. That is the whole
 * reason to use them here — the rail had grown from the nine destinations it
 * was drawn for to fourteen, and fourteen in one column is the long list this
 * layout was built to get away from, only stood on end.
 *
 * The first three destinations carry no group at all. Dashboard, calendar and
 * patients are where everybody starts, they need no word over them to say so,
 * and a heading above the first row would push the practice's own name away
 * from the first thing under it.
 */
type Group = 'care' | 'contact' | 'practice';

/**
 * The main nav, and the permission each destination needs. A role that cannot
 * open a screen never sees it advertised — the page guard still refuses if the
 * URL is typed by hand.
 *
 * The two administrative screens (staff, activity) deliberately live in the user
 * menu instead, so the daily bar stays the same short list for everyone.
 *
 * `children` are the screens that keep a section's *lists* rather than its
 * daily work — the headings the catalogue is filed by, the shelves stock is
 * filed by, the suppliers it is bought from. They are nested under their
 * section rather than promoted beside it, because none is a place anyone starts
 * their day, and a rail whose top level grows every time a lookup table gets a
 * screen stops being a short list.
 *
 * A section that has children is a heading, not a destination: its own row only
 * opens and shuts the list. The screen it used to lead to is the first entry in
 * that list, under the section's own name — one row, one job, and the fold no
 * longer moves the page out from under a click meant to open it.
 */
export const NAV_DESTINATIONS: ReadonlyArray<
  Destination & { group?: Group; children?: ReadonlyArray<Destination> }
> = [
  { href: '/dashboard', key: 'dashboard', permission: null },
  { href: '/appointments', key: 'appointments', permission: 'appointment.view' },
  { href: '/patients', key: 'patients', permission: 'patient.view' },

  // ── Care ──────────────────────────────────────────────────────────────────
  // Everything that hangs off one patient and one mouth: what was agreed, what
  // is being made for them, what they were told to take.
  { href: '/plans', key: 'plans', permission: 'plan.view', group: 'care' },
  // Beside the plans rather than under the catalogue: a case sent to a lab is
  // work in progress on a patient, and it is chased daily — which is the test
  // for the top level of this rail.
  {
    href: '/works',
    key: 'works',
    permission: 'work.view',
    group: 'care',
    children: [
      { href: '/works', key: 'works', permission: 'work.view', exact: true },
      // The list the register's rows are written from, filed under it for the
      // same reason the shelves are filed under stock: it is named once and then
      // picked from, which is not a place anybody starts their day.
      { href: '/works/procedures', key: 'workProcedures', permission: 'work.edit' },
      // The other list a line is filled in from, and the one that can be rung.
      // Same reasoning, same shelf — with the difference that this one is where
      // the practice keeps the telephone number the follow-up board dials.
      { href: '/works/labs', key: 'labs', permission: 'work.edit' },
    ],
  },
  // Third in this block rather than adrift between the catalogue and the
  // cupboard, which is where it used to sit. A prescription is written for one
  // person, on one visit, out of the same appointment the plan and the lab case
  // came out of — so it belongs with them and not with the reference data. It
  // is a section for its own reason: what the practice has written and the
  // standard wording it was written from are two different questions.
  {
    href: '/prescriptions',
    key: 'prescriptions',
    permission: 'prescription.view',
    group: 'care',
    children: [
      // What the practice has actually written, which is what somebody pressing
      // "Prescriptions" is nearly always after. It leads, and the standard
      // wording it is written *from* sits under it — the section used to open
      // straight onto the template catalogue, so the one screen anybody wanted
      // was reachable only through the patient who happened to receive it.
      { href: '/prescriptions/issued', key: 'prescriptionsIssued', permission: 'prescription.view' },
      { href: '/prescriptions', key: 'prescriptionTemplates', permission: 'prescription.view', exact: true },
    ],
  },

  // ── Contact ───────────────────────────────────────────────────────────────
  // The five lists of people to reach, which used to be five consecutive rows
  // in an ungrouped column of fourteen and read as one wall of near-synonyms.
  // A heading is what lets them be five short rows under one word instead.
  //
  // The order is deliberate. The two that carry a count lead, so the numbers
  // sit together at the top of the block rather than being separated by rows
  // that never show one; then the board the practice keeps for itself; then the
  // recall list and the queue it feeds, in that order, because that is the
  // direction the work actually flows.
  //
  // Follow-ups sitting third is not only about the count. In Italian the two
  // outer rows are *Richieste* and *Richiami* — a letter apart, in a column of
  // rows that already look alike — so something has to stand between them.

  // What patients said back. The one list here whose size nobody controls: a
  // patient answers when a patient answers, and a reply nobody sees for three
  // days is worse than a recall nobody makes for three days.
  { href: '/inbox', key: 'inbox', permission: 'message.view', group: 'contact' },
  // People who are not patients yet — somebody who left a number on the public
  // page. The only queue here where nobody has any relationship with the
  // practice, so a day of silence does not read as a delay, it reads as being
  // ignored.
  { href: '/requests', key: 'requests', permission: 'request.view', group: 'contact' },
  // The one thing in the rail that chases the practice rather than a patient.
  // The bell keeps it from ever being missed; this is where it is worked.
  { href: '/follow-ups', key: 'followUps', permission: 'followup.view', group: 'contact' },
  // People the practice has not heard from.
  { href: '/recalls', key: 'recalls', permission: 'recall.view', group: 'contact' },
  // And what that list turns into: the people it has already decided to write
  // to. Directly under the recalls because it is the same errand one step on,
  // and worked down once a day — a queue nobody can find is a queue nobody
  // empties, which is why it stays a row of its own and not a fold under one.
  { href: '/reminders', key: 'outbox', permission: 'recall.view', group: 'contact' },

  // ── Practice ──────────────────────────────────────────────────────────────
  // What the practice keeps rather than what it is doing today: the catalogue
  // it sells from, the cupboard it works out of, and the numbers both produce.
  {
    href: '/services',
    key: 'services',
    permission: 'service.view',
    group: 'practice',
    children: [
      { href: '/services', key: 'services', permission: 'service.view', exact: true },
      { href: '/services/categories', key: 'serviceCategories', permission: 'service.edit' },
      // Filed here rather than beside "new treatment" on the list: a catalogue
      // is imported once, when the practice adopts the app, and a header that
      // carries a setup screen for ever is a header with a dead button on it.
      { href: '/services/import', key: 'servicesImport', permission: 'service.edit' },
    ],
  },
  {
    href: '/stock',
    key: 'stock',
    permission: 'stock.view',
    group: 'practice',
    children: [
      { href: '/stock', key: 'stock', permission: 'stock.view', exact: true },
      // The one sub-screen here that is not a lookup table: the storage room as
      // photographs. Filed under stock all the same — it answers "what do we
      // keep and what does it look like", which is a question asked when
      // something is being found or ordered, not every morning.
      { href: '/stock/catalog', key: 'stockCatalog', permission: 'stock.view' },
      // The sheet of QR stickers. Filed here rather than beside the scanner: it
      // is printed once per shelf and then not again for a year, which is the
      // opposite of a place anybody starts their day.
      { href: '/stock/labels', key: 'stockLabels', permission: 'stock.view' },
      { href: '/stock/categories', key: 'stockCategories', permission: 'stock.edit' },
      { href: '/stock/suppliers', key: 'suppliers', permission: 'stock.edit' },
      // Same reasoning as the catalogue's own import, and the same section rule:
      // the header on the stock list already carries four verbs that are pressed
      // weekly, and this one is pressed once.
      { href: '/stock/import', key: 'stockImport', permission: 'stock.edit' },
    ],
  },
  { href: '/analytics', key: 'analytics', permission: 'analytics.view', group: 'practice' },
];

/**
 * The lists that search their own contents, and the order to offer them in.
 *
 * The search box at the top of the app finds two things: a screen, and a person.
 * Everything else the practice looks up by name — a material, a treatment, a
 * plan — lives behind the search box of one particular list, which you have to
 * be standing on to use. So a query that finds nobody used to end there, when
 * the answer was one screen away and the words had already been typed.
 *
 * Each `href` here is a page that reads `?q=` and filters itself with it. The
 * palette appends the query and offers the row; nothing else is needed, which
 * is the point — this is a handover, not a second search engine.
 *
 * Patients are on the list despite the palette searching them directly: it
 * shows the first twenty, and "all of them" is a fair thing to want next.
 */
export const SEARCHABLE_LISTS: ReadonlyArray<Destination> = [
  { href: '/patients', key: 'patients', permission: 'patient.view' },
  { href: '/plans', key: 'plans', permission: 'plan.view' },
  { href: '/services', key: 'services', permission: 'service.view' },
  { href: '/stock', key: 'stock', permission: 'stock.view' },
  // These two read `?q=` exactly as the four above do and were simply left off
  // the list, so the palette handed a typed query to the catalogue and the
  // cupboard but not to the register or the follow-up board — the two screens
  // whose rows are most often looked for by a name somebody half-remembers.
  { href: '/works', key: 'works', permission: 'work.view' },
  { href: '/follow-ups', key: 'followUps', permission: 'followup.view' },
  // The inbox joins them now that it has a search box of its own.
  { href: '/inbox', key: 'inbox', permission: 'message.view' },
  // Searched by patient name, which is the only name anybody looking for a
  // prescription has — see the note on the screen itself.
  { href: '/prescriptions/issued', key: 'prescriptionsIssued', permission: 'prescription.view' },
];
