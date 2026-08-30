import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { auditDestination } from '../src/lib/audit-links';

const ID = '8f0a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

describe('where a line in the activity log points', () => {
  it('sends the patient-shaped entities to the patient', () => {
    // All five are written with a *patient* id, not an id of their own — the
    // chart is keyed by patient, and a recall, a contact and a waiting entry
    // are all filed against the person.
    for (const entity of ['patient', 'tooth', 'recall', 'contact', 'waitlist', 'message']) {
      assert.deepEqual(
        auditDestination(entity, ID),
        { href: `/patients/${ID}`, kind: 'patient', id: ID },
        `${entity} should lead to the patient`,
      );
    }
  });

  it('sends a stock line to the material', () => {
    assert.deepEqual(auditDestination('stock', ID), {
      href: `/stock/${ID}/edit`,
      kind: 'stock',
      id: ID,
    });
  });

  /**
   * The reason this module exists rather than a one-line template in the page.
   * Three entity names carry two different kinds of id depending on which action
   * wrote the line, so a link built from the row alone would be right about half
   * the time and a 404 the rest — which is worse than no link, because a dead
   * link in an audit trail reads as a deleted record.
   */
  it('refuses the entities whose id means two different things', () => {
    assert.equal(auditDestination('prescription', ID), null, 'issued, or a template');
    assert.equal(auditDestination('plan', ID), null, 'the plan, or a step of it');
    assert.equal(auditDestination('document', ID), null, 'the document, or its patient');
  });

  it('refuses the entities with nowhere to go', () => {
    // An appointment lives on a calendar and a follow-up in a bell; neither has
    // a page of its own to land on.
    for (const entity of ['appointment', 'visit', 'followup', 'staff', 'session', 'backup']) {
      assert.equal(auditDestination(entity, ID), null, `${entity} has no page`);
    }
  });

  it('refuses a line that names no record at all', () => {
    assert.equal(auditDestination('patient', null), null);
    assert.equal(auditDestination('stock', ''), null);
  });

  it('refuses an entity it has never heard of', () => {
    assert.equal(auditDestination('something-new', ID), null);
  });
});

/**
 * The claim the linking rests on: every action that writes one of the linked
 * entity names writes the *same kind* of id. That is a property of code
 * elsewhere in the tree, so it is asserted rather than trusted — if somebody
 * later records `entity: 'stock'` against a supplier id, this is what says so.
 */
describe('the linked entities are written with one kind of id', () => {
  it('every stock audit line names a stock item', async () => {
    const sources = await Promise.all(
      ['stock.ts', 'scan.ts'].map((file) =>
        readFile(path.join(process.cwd(), 'src', 'lib', 'actions', file), 'utf8'),
      ),
    );

    // `entity: 'stock'` blocks, and the entityId each one carries.
    const named = sources
      .flatMap((source) => [...source.matchAll(/entity: 'stock',\s*\n\s*entityId: ([\w.?]+)/g)])
      .map((match) => match[1]);

    assert.ok(named.length > 0, 'expected stock audit lines to be found');
    for (const value of named) {
      // Every one of these is a `StockItem.id` reached by a different route —
      // `link.itemId` is the item a scanned barcode names, `batch.itemId` the
      // item a lot belongs to. The point of the assertion is that none of them
      // is an id of some *other* table, which is what would break the link.
      assert.match(
        value,
        /^(id|itemId|savedId|targetId|batch\.itemId|removed\.itemId|link\.itemId)!?$/,
        `entity 'stock' should be filed against a stock item id, saw ${value}`,
      );
    }
  });

  it('every tooth audit line names the patient, which is what the chart is keyed by', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'src', 'lib', 'actions', 'patients.ts'),
      'utf8',
    );

    const named = [...source.matchAll(/entity: 'tooth',\s*\n\s*entityId: ([\w.?]+)/g)].map(
      (match) => match[1],
    );

    assert.ok(named.length > 0, 'expected tooth audit lines to be found');
    for (const value of named) {
      assert.equal(value, 'patientId', "entity 'tooth' is filed against the patient");
    }
  });
});

/**
 * The filter over the trail, held against the trail itself.
 *
 * The activity screen narrows by entity, and its list of entities was written by
 * hand and then not extended: fourteen of the twenty-six kinds `recordAudit`
 * actually writes. Nothing failed — the rows were all in the list, they simply
 * could not be filtered for, so "show me everything that touched the works
 * register" had no answer on the one screen that exists to answer it.
 *
 * Read out of the sources rather than imported, because the page is a server
 * component with next-intl and Prisma behind it and this suite runs on plain
 * Node. It is a coverage check, not a unit test of a function — the same shape,
 * and for the same reason, as `tests/storage-keys.test.ts`.
 */
describe('the activity filter offers every kind the trail records', () => {
  const ACTION_FILES = path.join(process.cwd(), 'src', 'lib', 'actions');

  async function recordedEntities(): Promise<Set<string>> {
    const names = await readdir(ACTION_FILES);
    const found = new Set<string>();

    for (const name of names.filter((file) => file.endsWith('.ts'))) {
      const source = await readFile(path.join(ACTION_FILES, name), 'utf8');
      for (const match of source.matchAll(/entity: '([A-Za-z]+)'/g)) found.add(match[1]);
    }
    return found;
  }

  async function offeredEntities(): Promise<Set<string>> {
    const source = await readFile(
      path.join(process.cwd(), 'src', 'app', '[locale]', '(app)', 'activity', 'page.tsx'),
      'utf8',
    );
    const block = source.match(/const ENTITIES = \[([\s\S]*?)\] as const;/);
    assert.ok(block, 'could not find the ENTITIES array');
    return new Set([...block[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]));
  }

  it('lists every entity an action writes', async () => {
    const recorded = await recordedEntities();
    const offered = await offeredEntities();

    const missing = [...recorded].filter((entity) => !offered.has(entity)).sort();
    assert.deepEqual(missing, [], `not offered by the filter: ${missing.join(', ')}`);
  });

  it('offers nothing the trail never writes, which would filter to an empty screen', async () => {
    const recorded = await recordedEntities();
    const offered = await offeredEntities();

    const dead = [...offered].filter((entity) => !recorded.has(entity)).sort();
    assert.deepEqual(dead, [], `offered but never recorded: ${dead.join(', ')}`);
  });

  /**
   * And each of them has a word to print. This is the failure that shipped: the
   * booking request was recorded from the day the public page existed, had no
   * `entity_` key in any of the three files, and every such row rendered the
   * literal string `activity.entity_appointmentRequest` on screen.
   */
  it('has a label for each, in all three languages', async () => {
    const recorded = await recordedEntities();

    for (const locale of ['en', 'sq', 'it']) {
      const messages = JSON.parse(
        await readFile(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
      );
      for (const entity of recorded) {
        assert.ok(
          messages.activity[`entity_${entity}`],
          `${locale}.json has no activity.entity_${entity}`,
        );
      }
    }
  });
});
