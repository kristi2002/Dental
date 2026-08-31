import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HELP_TOPICS, topicFor } from '../src/lib/help/topics';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/lib/auth/permissions';
import { locales } from '../src/i18n/routing';

/**
 * The question mark in the corner has two ways of being wrong, and neither one
 * crashes anything.
 *
 * It can open the wrong explanation — the panel is honest-looking either way,
 * and somebody standing on the stocktake reading about the shelf labels has no
 * reason to suspect the software rather than themselves. And it can open an
 * explanation nobody wrote, which `next-intl` renders as the key path: a modal
 * with `help.topics.suppliers.what` printed across it, reported nowhere but a
 * browser console.
 *
 * Both are cheap to catch here and expensive to notice in a surgery.
 */

const MESSAGES = path.join(process.cwd(), 'messages');

async function load(locale: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(MESSAGES, `${locale}.json`), 'utf8'));
}

function lookup(messages: Record<string, unknown>, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

describe('help topics', () => {
  /**
   * The pairs that decide whether the registry is sound. Each is a path
   * somebody actually lands on, and the topic that should answer for it.
   */
  const ROUTES: ReadonlyArray<[string, string | undefined]> = [
    ['/dashboard', 'dashboard'],
    ['/appointments', 'appointments'],
    ['/day-sheet', 'daySheet'],

    // A list, the form that makes a new row on it, and one record — three
    // different pages, and only two different answers. A form has no topic of
    // its own on purpose: what a patient record is *for* is the useful thing to
    // read while filling one in.
    ['/patients', 'patients'],
    ['/patients/new', 'patients'],
    ['/patients/cm8k2x0000abcd', 'patientRecord'],

    // The one that made `:id` need a rule. Both of these are two segments deep
    // under `/patients`, and only one of them is a person.
    ['/patients/import', 'imports'],

    // A literal beats a parameter at the same depth, whichever order the
    // registry happens to declare them in.
    ['/prescriptions', 'prescriptions'],
    ['/prescriptions/issued', 'prescriptionsIssued'],
    ['/prescriptions/templates/new', 'prescriptions'],

    // Sections whose sub-screens are their own subject, and sections whose
    // sub-screens are not.
    ['/works', 'works'],
    ['/works/procedures', 'workProcedures'],
    ['/works/labs', 'labs'],
    ['/works/labs/new', 'labs'],
    ['/works/cm9000abc', 'works'],

    ['/stock', 'stock'],
    ['/stock/new', 'stock'],
    ['/stock/catalog', 'stockCatalog'],
    ['/stock/labels', 'stockLabels'],
    ['/stock/scan', 'stockScan'],
    ['/stock/stocktake', 'stocktake'],
    ['/stock/expiry', 'stockExpiry'],
    ['/stock/import', 'imports'],
    ['/stock/suppliers', 'suppliers'],
    ['/stock/suppliers/new', 'suppliers'],
    ['/stock/cm7700xyz/edit', 'stock'],

    ['/plans', 'plans'],
    ['/plans/new', 'plans'],
    ['/plans/cm5500pq', 'planDetail'],

    ['/services', 'services'],
    ['/services/categories', 'serviceCategories'],
    ['/services/import', 'imports'],

    ['/settings', 'settings'],
    ['/settings/operatories/new', 'settings'],
    ['/staff', 'staff'],
    ['/activity', 'activity'],

    // Nothing claims these, and nothing should. A question mark that opened
    // somebody else's screen would be worse than no question mark.
    ['/', undefined],
    ['/login', undefined],
    ['/setup', undefined],
  ];

  for (const [pathname, expected] of ROUTES) {
    it(`answers ${pathname} with ${expected ?? 'no topic'}`, () => {
      assert.equal(topicFor(pathname)?.id, expected);
    });
  }

  /**
   * A print sheet is a page nobody reads help on — it is a document, already
   * on its way to a printer. It inherits its section's topic rather than being
   * excluded, which is harmless, but it must never be a *different* section's.
   */
  it('never crosses a section boundary', () => {
    for (const [pathname, expected] of ROUTES) {
      if (!expected) continue;
      const topic = topicFor(pathname);
      assert.ok(topic, `${pathname} lost its topic`);
      assert.ok(
        topic.routes.some((route) => pathname.startsWith(route.split('/:')[0])),
        `${pathname} was answered by ${topic.id}, which claims none of its path`,
      );
    }
  });

  it('declares no topic twice', () => {
    const ids = HELP_TOPICS.map((topic) => topic.id);
    assert.equal(new Set(ids).size, ids.length, 'a topic id appears more than once');
  });

  /**
   * Every "where next" link has to be somewhere a person can actually go. A
   * typo here does not throw — the link is silently dropped, because the panel
   * resolves related screens against the destinations this person may open, and
   * a href nobody offers simply never matches.
   */
  it('points its related links at real screens', () => {
    const known = new Set(HELP_TOPICS.flatMap((topic) => topic.routes));
    for (const topic of HELP_TOPICS) {
      for (const href of topic.related ?? []) {
        assert.ok(known.has(href), `${topic.id} points at ${href}, which no topic claims`);
      }
    }
  });

  /**
   * A permission tag is index-aligned with the steps in the message file, and
   * nothing enforces that but this.
   *
   * Getting it wrong is silent and specific: insert a step at position two and
   * every tag after it now guards the wrong sentence, so a receptionist loses
   * "search" and keeps "record a visit" — the exact failure the tagging exists
   * to prevent, arrived at from the other direction.
   */
  it('tags no step that was never written', async () => {
    const messages = await load('sq');

    for (const topic of HELP_TOPICS) {
      if (!topic.steps) continue;
      const steps = lookup(messages, `help.topics.${topic.id}.steps`) as unknown[];
      assert.ok(
        topic.steps.length <= steps.length,
        `${topic.id} tags ${topic.steps.length} steps but only ${steps.length} are written`,
      );

      for (const permission of topic.steps) {
        if (permission === null) continue;
        assert.ok(
          (PERMISSIONS as readonly string[]).includes(permission),
          `${topic.id} names a permission that does not exist: ${permission}`,
        );
      }
    }
  });

  /**
   * And that the filtering leaves somebody something to read.
   *
   * A topic where every step needed a right the reader lacks would draw a
   * wireframe with no callouts on it and an empty list underneath — a panel
   * that has opened to say nothing. If that ever becomes true for a role, the
   * answer is a step written for *them*, not a quietly blank panel.
   */
  it('leaves every role at least one step on every screen', () => {
    for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
      for (const topic of HELP_TOPICS) {
        if (!topic.steps) continue;
        const kept = topic.steps.filter(
          (permission) =>
            permission === null || (granted as readonly string[]).includes(permission),
        );
        assert.ok(kept.length > 0, `${role} would see no steps at all on ${topic.id}`);
      }
    }
  });

  /**
   * The case the whole mechanism was built for, pinned by position.
   *
   * A patient record is the one screen two people read completely different
   * halves of. The dentist gets the chart, the visit history and the button
   * that writes one; the front desk holds none of `patient.medical.*` and gets
   * the identity, the tabs, and the contact-appointments-files side they
   * actually work in. Written as positions rather than titles so it says the
   * same thing in all three languages.
   *
   * It also guards against the fix that would quietly undo itself: dropping
   * three of five steps left the desk with a two-line panel, and the sixth step
   * exists so that it does not.
   */
  it('shows the front desk the half of a patient record they work in', () => {
    const record = HELP_TOPICS.find((topic) => topic.id === 'patientRecord');
    assert.ok(record?.steps, 'patientRecord lost its step permissions');

    const seenBy = (role: keyof typeof ROLE_PERMISSIONS) =>
      (record.steps ?? [])
        .map((permission, index) => ({ permission, at: index + 1 }))
        .filter(
          ({ permission }) =>
            permission === null ||
            (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission),
        )
        .map(({ at }) => at);

    assert.deepEqual(seenBy('OWNER'), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(seenBy('ASSISTANT'), [1, 2, 3, 4, 5, 6]);
    // No chart, no visit history, no writing one — and still three things to read.
    assert.deepEqual(seenBy('RECEPTIONIST'), [1, 2, 6]);
    // A locum reads the clinical record and writes nothing.
    assert.deepEqual(seenBy('READONLY'), [1, 2, 3, 4, 6]);
  });

  /**
   * And the words themselves, in all three languages — including the drawings'
   * captions, which are the half of this feature that cannot fall back to
   * English gracefully because there is nothing to fall back to.
   */
  it('writes every topic in every language', async () => {
    for (const locale of locales) {
      const messages = await load(locale);

      for (const topic of HELP_TOPICS) {
        const key = `help.topics.${topic.id}`;
        for (const field of ['title', 'tagline', 'what', 'example']) {
          assert.equal(
            typeof lookup(messages, `${key}.${field}`),
            'string',
            `${locale}.json has no ${key}.${field}`,
          );
        }

        const steps = lookup(messages, `${key}.steps`);
        assert.ok(Array.isArray(steps) && steps.length > 0, `${locale}.json has no ${key}.steps`);
        for (const [index, step] of (steps as { title?: string; body?: string }[]).entries()) {
          assert.equal(typeof step.title, 'string', `${locale}.json: ${key}.steps[${index}].title`);
          assert.equal(typeof step.body, 'string', `${locale}.json: ${key}.steps[${index}].body`);
        }

        assert.ok(Array.isArray(lookup(messages, `${key}.tips`)), `${locale}.json: ${key}.tips`);

        assert.equal(
          typeof lookup(messages, `help.shapes.${topic.shape}`),
          'string',
          `${locale}.json has no alt text for the ${topic.shape} drawing`,
        );

        if (topic.diagram) {
          const labels = lookup(messages, `help.diagrams.${topic.diagram}.labels`);
          assert.equal(
            typeof lookup(messages, `help.diagrams.${topic.diagram}.title`),
            'string',
            `${locale}.json has no title for the ${topic.diagram} diagram`,
          );
          assert.ok(
            Array.isArray(labels) && labels.length >= 4,
            `${locale}.json has too few labels for the ${topic.diagram} diagram`,
          );
        }
      }
    }
  });
});
