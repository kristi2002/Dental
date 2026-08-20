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
  { href: '/outbox', key: 'outbox', permission: 'recall.view' },
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
    ],
  },
  { href: '/analytics', key: 'analytics', permission: 'analytics.view' },
];
