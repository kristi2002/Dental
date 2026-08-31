import type { Permission } from '@/lib/auth/permissions';

/**
 * What each screen in this building is *for*, and which drawing explains it.
 *
 * The question mark in the top corner is the same button everywhere, so
 * something has to decide which page it is standing on. That is this file: a
 * route pattern per topic, matched against the pathname the browser is showing.
 *
 * Only the *shape* of a topic lives here — which wireframe to draw, which
 * concept diagram to put under it, which screens to offer next. Every word is
 * in `messages/*.json` under `help.topics.<id>`, because a dentist reading this
 * is reading it in Albanian and the whole point is that it is understood.
 *
 * A topic is not needed for every URL. `/patients/new` has no entry and falls
 * back to `/patients`, which is the right answer: somebody filling in a new
 * patient is helped by knowing what the practice keeps a patient record *for*.
 * A sub-screen only earns an entry of its own when its answer genuinely differs
 * from its parent's — the shelf labels do, the "new supplier" form does not.
 */

/** The wireframe drawn at the top of the panel — see `HelpWireframe`. */
export type HelpShape =
  | 'dashboard'
  | 'calendar'
  | 'list'
  | 'record'
  | 'steps'
  | 'board'
  | 'gallery'
  | 'charts'
  | 'week'
  | 'form'
  // A header with a button or two over a stack of titled cards, each holding
  // its own rows. Neither a list (no search box, no row per record) nor a
  // record (no tabs) — it is what a screen looks like when the unit is a small
  // document rather than a line: an order and the boxes owed on it, a material
  // and its lots.
  | 'stack';

/**
 * What a step assumes you are allowed to do, index by index with the `steps`
 * array in the message files. `null` — or no entry at all — is a step anybody
 * on the screen can follow.
 *
 * This exists because the panel was written from the owner's chair. A
 * receptionist opening a patient record read step 5, "Record a visit — the
 * button that closes the loop", and there is no such button on their screen:
 * they do not hold `patient.medical.edit`, so the app correctly hides it and
 * the help correctly described something that was not there. Help that names a
 * control you do not have is worse than no help, because it makes somebody
 * hunt for a missing button and doubt themselves rather than the software.
 *
 * Only the steps are tagged. The example and the tips are prose about how the
 * screen fits into the practice, and a receptionist is not harmed by knowing
 * what the dentist does with it — that is context, not an instruction.
 */
type StepPermissions = readonly (Permission | null)[];

/** The concept drawing under the steps — see `HelpDiagram`. Optional. */
export type HelpDiagram =
  | 'recall'
  | 'stock'
  | 'plan'
  | 'work'
  | 'message'
  | 'request'
  | 'teeth'
  | 'prescription'
  | 'import'
  | 'scan'
  | 'roles'
  | 'expiry'
  | 'day'
  | 'followUp'
  | 'order';

export type HelpTopic = {
  /** Also the key under `help.topics` in the message files. */
  id: string;
  /**
   * Paths this topic answers for, most specific first within the entry. A
   * segment written `:id` stands for one record's identifier — see `matchPath`
   * for the one rule that keeps it from swallowing `/patients/new`.
   */
  routes: readonly string[];
  shape: HelpShape;
  diagram?: HelpDiagram;
  /** See `StepPermissions`. Shorter than the steps is fine; the rest are open. */
  steps?: StepPermissions;
  /** Where to go next, as hrefs. Their names come from the `nav` namespace. */
  related?: readonly string[];
};

/**
 * Segments that are never a record's id, whatever the pattern says.
 *
 * `/patients/:id` and `/patients/new` are the same shape to a matcher, and the
 * wrong one wins by being longer. Rather than declare a topic for every form in
 * the building, the four words every "make one" and "print it" route in this
 * app uses are simply not ids.
 */
const NOT_AN_ID = new Set(['new', 'edit', 'print', 'import']);

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'dashboard',
    routes: ['/dashboard'],
    shape: 'dashboard',
    diagram: 'day',
    steps: [null, 'appointment.edit', null, null, 'appointment.edit'],
    related: ['/appointments', '/day-sheet', '/recalls'],
  },
  {
    id: 'appointments',
    routes: ['/appointments'],
    shape: 'calendar',
    diagram: 'day',
    steps: [null, null, 'appointment.edit', null, 'appointment.edit'],
    related: ['/day-sheet', '/reminders', '/settings'],
  },
  {
    id: 'daySheet',
    routes: ['/day-sheet'],
    shape: 'record',
    diagram: 'day',
    related: ['/appointments', '/dashboard'],
  },

  {
    id: 'patients',
    routes: ['/patients'],
    shape: 'list',
    diagram: 'recall',
    steps: [null, 'patient.edit', null, 'patient.medical.view', 'patient.edit'],
    related: ['/appointments', '/plans', '/recalls'],
  },
  {
    id: 'patientRecord',
    routes: ['/patients/:id'],
    shape: 'record',
    diagram: 'teeth',
    steps: [null, null, 'patient.medical.view', 'patient.medical.view', 'patient.medical.edit', null],
    related: ['/plans', '/prescriptions/issued', '/appointments'],
  },

  {
    id: 'plans',
    routes: ['/plans'],
    shape: 'list',
    diagram: 'plan',
    steps: [null, 'plan.edit', null, null, 'plan.edit'],
    related: ['/patients', '/services', '/appointments'],
  },
  {
    id: 'planDetail',
    routes: ['/plans/:id'],
    shape: 'steps',
    diagram: 'plan',
    steps: [null, null, 'plan.edit', 'plan.edit'],
    related: ['/appointments', '/services'],
  },

  {
    id: 'works',
    routes: ['/works', '/works/:id'],
    shape: 'list',
    diagram: 'work',
    steps: [null, 'work.edit', null, 'work.edit', null],
    related: ['/works/procedures', '/works/labs', '/follow-ups'],
  },
  {
    id: 'workProcedures',
    routes: ['/works/procedures'],
    shape: 'list',
    diagram: 'work',
    steps: [null, 'work.edit', 'work.edit'],
    related: ['/works', '/works/labs'],
  },
  {
    id: 'labs',
    routes: ['/works/labs'],
    shape: 'list',
    diagram: 'work',
    steps: [null, 'work.edit', 'work.edit'],
    related: ['/works', '/follow-ups'],
  },

  {
    id: 'prescriptions',
    routes: ['/prescriptions', '/prescriptions/templates'],
    shape: 'list',
    diagram: 'prescription',
    steps: [null, 'prescription.edit', 'prescription.edit'],
    related: ['/prescriptions/issued', '/patients'],
  },
  {
    id: 'prescriptionsIssued',
    routes: ['/prescriptions/issued', '/prescriptions/:id'],
    shape: 'list',
    diagram: 'prescription',
    related: ['/prescriptions', '/patients'],
  },

  {
    id: 'inbox',
    routes: ['/inbox', '/inbox/:id'],
    shape: 'record',
    diagram: 'message',
    steps: [null, 'message.send', null, 'message.send'],
    related: ['/reminders', '/patients', '/requests'],
  },
  {
    id: 'requests',
    routes: ['/requests'],
    shape: 'list',
    diagram: 'request',
    steps: [null, null, null, 'request.edit'],
    related: ['/appointments', '/patients'],
  },
  {
    id: 'followUps',
    routes: ['/follow-ups', '/follow-ups/:id'],
    shape: 'board',
    diagram: 'followUp',
    steps: [null, null, null, 'followup.edit'],
    related: ['/works', '/inbox'],
  },
  {
    id: 'recalls',
    routes: ['/recalls'],
    shape: 'board',
    diagram: 'recall',
    steps: [null, null, null, 'recall.send'],
    related: ['/reminders', '/patients', '/appointments'],
  },
  {
    id: 'outbox',
    routes: ['/reminders'],
    shape: 'board',
    diagram: 'message',
    steps: [null, null, null, 'recall.send'],
    related: ['/appointments', '/inbox', '/recalls'],
  },

  {
    id: 'services',
    routes: ['/services'],
    shape: 'list',
    steps: [null, 'service.edit', null, 'service.edit'],
    related: ['/services/categories', '/plans', '/appointments'],
  },
  {
    id: 'serviceCategories',
    routes: ['/services/categories'],
    shape: 'list',
    steps: [null, 'service.edit', null],
    related: ['/services'],
  },
  {
    id: 'imports',
    routes: ['/services/import', '/stock/import', '/patients/import'],
    shape: 'form',
    diagram: 'import',
    related: ['/services', '/stock', '/patients'],
  },

  {
    id: 'stock',
    routes: ['/stock'],
    shape: 'list',
    diagram: 'stock',
    steps: [null, 'stock.edit', null, null, 'stock.edit'],
    related: ['/stock/scan', '/stock/orders', '/stock/stocktake'],
  },
  {
    id: 'stockItem',
    routes: ['/stock/:id'],
    shape: 'stack',
    diagram: 'scan',
    steps: ['stock.edit', null, null, null, null],
    related: ['/stock', '/stock/scan', '/stock/expiry'],
  },
  {
    id: 'stockOrders',
    routes: ['/stock/orders'],
    shape: 'stack',
    diagram: 'order',
    steps: [null, null, null, null, 'stock.edit'],
    related: ['/stock', '/stock/suppliers', '/stock/scan'],
  },
  {
    id: 'stockCatalog',
    routes: ['/stock/catalog'],
    shape: 'gallery',
    diagram: 'stock',
    steps: [null, null, 'stock.edit', null],
    related: ['/stock', '/stock/labels'],
  },
  {
    id: 'stockLabels',
    routes: ['/stock/labels'],
    shape: 'gallery',
    diagram: 'scan',
    related: ['/stock/scan', '/stock'],
  },
  {
    id: 'stockScan',
    routes: ['/stock/scan', '/stock/q'],
    shape: 'form',
    diagram: 'scan',
    related: ['/stock/labels', '/stock', '/stock/stocktake'],
  },
  {
    id: 'stocktake',
    routes: ['/stock/stocktake'],
    shape: 'list',
    diagram: 'stock',
    related: ['/stock', '/stock/scan'],
  },
  {
    id: 'stockExpiry',
    routes: ['/stock/expiry'],
    shape: 'board',
    diagram: 'expiry',
    steps: [null, null, null, 'stock.edit'],
    related: ['/stock', '/stock/scan'],
  },
  {
    id: 'stockCategories',
    routes: ['/stock/categories'],
    shape: 'list',
    steps: [null, 'stock.edit', null],
    related: ['/stock'],
  },
  {
    id: 'suppliers',
    routes: ['/stock/suppliers'],
    shape: 'list',
    steps: [null, 'stock.edit', 'stock.edit'],
    related: ['/stock'],
  },

  {
    id: 'analytics',
    routes: ['/analytics'],
    shape: 'charts',
    diagram: 'day',
    related: ['/appointments', '/services', '/patients'],
  },

  {
    id: 'settings',
    routes: ['/settings'],
    shape: 'week',
    diagram: 'day',
    steps: [null, 'settings.edit', 'settings.edit', 'settings.edit'],
    related: ['/appointments', '/staff'],
  },
  {
    id: 'staff',
    routes: ['/staff'],
    shape: 'list',
    diagram: 'roles',
    related: ['/activity', '/settings'],
  },
  {
    id: 'activity',
    routes: ['/activity'],
    shape: 'list',
    diagram: 'roles',
    related: ['/staff'],
  },
];

/** Every literal path a topic claims, so `:id` can be told to leave them alone. */
const CLAIMED = new Set(
  HELP_TOPICS.flatMap((topic) => topic.routes).filter((route) => !route.includes(':')),
);

/**
 * How well `pattern` fits `pathname`, or `-1` for not at all.
 *
 * A pattern matches when every one of its segments matches the head of the
 * path — so `/stock` still answers on `/stock/new`, which is the fallback that
 * keeps this registry from needing a topic per form. The score is the pattern's
 * length, so the most specific claim wins, with a literal segment beating a
 * `:id` at the same depth.
 */
function score(pattern: string, pathname: string): number {
  const want = pattern.split('/').filter(Boolean);
  const have = pathname.split('/').filter(Boolean);
  if (want.length > have.length) return -1;

  let points = 0;
  for (const [index, segment] of want.entries()) {
    const actual = have[index];
    if (segment === ':id') {
      // Never `/patients/new`, and never a sub-screen some other topic has
      // already put its name to — both would otherwise read as a record's id.
      if (NOT_AN_ID.has(actual)) return -1;
      if (CLAIMED.has(`/${have.slice(0, index + 1).join('/')}`)) return -1;
      points += 2;
    } else if (segment === actual) {
      points += 3;
    } else {
      return -1;
    }
  }

  return points;
}

/**
 * The topic answering for a path, or `undefined` where nothing does.
 *
 * `undefined` is a real answer and the button honours it by not appearing: a
 * question mark that opens an explanation of some other screen is worse than no
 * question mark, and there are pages here — a print sheet, a QR landing — where
 * the honest answer is that the page speaks for itself.
 */
export function topicFor(pathname: string): HelpTopic | undefined {
  let best: HelpTopic | undefined;
  let bestScore = 0;

  for (const topic of HELP_TOPICS) {
    for (const route of topic.routes) {
      const points = score(route, pathname);
      if (points > bestScore) {
        bestScore = points;
        best = topic;
      }
    }
  }

  return best;
}
