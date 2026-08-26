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
  Destination & { children?: ReadonlyArray<Destination> }
> = [
  { href: '/', key: 'dashboard', permission: null },
  { href: '/appointments', key: 'appointments', permission: 'appointment.view' },
  { href: '/patients', key: 'patients', permission: 'patient.view' },
  { href: '/plans', key: 'plans', permission: 'plan.view' },
  // Beside the plans rather than under the catalogue: a case sent to a lab is
  // work in progress on a patient, and it is chased daily — which is the test
  // for the top level of this rail.
  {
    href: '/works',
    key: 'works',
    permission: 'work.view',
    children: [
      { href: '/works', key: 'works', permission: 'work.view', exact: true },
      // The list the register's rows are written from, filed under it for the
      // same reason the shelves are filed under stock: it is named once and then
      // picked from, which is not a place anybody starts their day.
      { href: '/works/procedures', key: 'workProcedures', permission: 'work.edit' },
    ],
  },
  { href: '/recalls', key: 'recalls', permission: 'recall.view' },
  // Beside the recalls because it is the same errand from the other end: the
  // recall list is people the practice has not heard from, and this is people it
  // has already decided to write to. It sits in the top level rather than under
  // the calendar for the reason everything else here does — it is worked down
  // once a day, and a queue nobody can find is a queue nobody empties.
  { href: '/reminders', key: 'outbox', permission: 'recall.view' },
  // And the other end of *that*: the outbox is what the practice is about to
  // say, this is what came back. It sits in the top level and not under the
  // outbox because it is the one list here nobody controls the size of — a
  // patient answers when a patient answers, and a reply nobody sees for three
  // days is worse than a recall nobody makes for three days.
  { href: '/inbox', key: 'inbox', permission: 'message.view' },
  // Beside the recalls rather than filed anywhere: both are lists the practice
  // works down each morning, and this one is the only thing in the rail that
  // chases the practice rather than a patient. The bell keeps it from ever being
  // missed; this is where it is actually worked.
  { href: '/follow-ups', key: 'followUps', permission: 'followup.view' },
  {
    href: '/services',
    key: 'services',
    permission: 'service.view',
    children: [
      { href: '/services', key: 'services', permission: 'service.view', exact: true },
      { href: '/services/categories', key: 'serviceCategories', permission: 'service.edit' },
      // Filed here rather than beside "new treatment" on the list: a catalogue
      // is imported once, when the practice adopts the app, and a header that
      // carries a setup screen for ever is a header with a dead button on it.
      { href: '/services/import', key: 'servicesImport', permission: 'service.edit' },
    ],
  },
  // Beside the catalogue rather than filed under it. A template is pinned to the
  // treatment it follows, but prescribing is its own part of the day — and the
  // prescription a patient walks out with already lives inside this section.
  { href: '/prescriptions', key: 'prescriptions', permission: 'prescription.view' },
  {
    href: '/stock',
    key: 'stock',
    permission: 'stock.view',
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
  { href: '/analytics', key: 'analytics', permission: 'analytics.view' },
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
];
