import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The restore script cannot be exercised end to end here — it refuses a
 * database that already holds a practice, which is the behaviour you want and
 * also the behaviour that makes it untestable against a working one.
 *
 * What *is* testable without a database is the part most likely to be wrong and
 * least likely to be noticed: whether the script knows about every table the
 * export writes, and whether it inserts them in an order the foreign keys will
 * accept. A restore that stops two thirds of the way through is the worst
 * possible outcome, because it looks like it worked.
 */
const RESTORE = path.join(process.cwd(), 'prisma', 'restore-backup.ts');
const EXPORT = path.join(process.cwd(), 'src', 'app', 'api', 'backup', 'route.ts');
const SCHEMA = path.join(process.cwd(), 'prisma', 'schema.prisma');

/**
 * Models the export is allowed not to carry, each for a stated reason. Anything
 * else new in the schema fails the sweep below until somebody decides which
 * list it belongs on — which is the whole point of keeping this one short.
 */
const NOT_EXPORTED = new Set([
  // Carried nested inside `plans` — see `NESTED` in the restore script.
  'TreatmentStep',
  // When the weekly sweep last ran and what it found. Operational history of
  // *this deployment*, not of the practice: a database restored onto a new
  // server has a new clock, and carrying the old one's run log across would
  // describe a machine that no longer exists. The rows are also worthless
  // without the container that wrote them, which the backup does not carry
  // either. See `src/lib/jobs/run.ts`.
  'JobRun',
  // Tomorrow's reminders, waiting for somebody to send them. Excluded because
  // carrying them across would be actively harmful rather than merely useless:
  // a database restored from Tuesday's backup on Friday would hand the front
  // desk a queue of PENDING rows about appointments that already happened, and
  // the whole value of the queue is that working down it is safe.
  //
  // Nothing is lost. The queue is derived — one run of
  // `queue-appointment-reminders` rebuilds it from the appointments, which *are*
  // in the backup — and what was actually said to a patient lives in `Contact`,
  // which is the record that has to survive. See `src/lib/messages/queue.ts`.
  'ScheduledMessage',
]);

function block(source: string, name: string): string[] {
  const start = source.indexOf(name);
  assert.notEqual(start, -1, `${name} not found`);
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  assert.ok(close > open, `${name} has no closing bracket`);

  return source
    .slice(open + 1, close)
    .split(/[,\n]/)
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^'[a-zA-Z]+'$/.test(line))
    .map((line) => line.slice(1, -1));
}

describe('backup and restore agree with each other', () => {
  it('restores every key the export writes', async () => {
    const [restore, exporter] = await Promise.all([
      readFile(RESTORE, 'utf8'),
      readFile(EXPORT, 'utf8'),
    ]);

    const order = new Set(block(restore, 'const ORDER ='));

    // The keys the export puts inside `data: { … }`.
    const dataStart = exporter.indexOf('data: {');
    const dataEnd = exporter.indexOf('},', dataStart);
    const exported = exporter
      .slice(dataStart + 'data: {'.length, dataEnd)
      .split(',')
      .map((line) => line.replace(/\/\/.*$/gm, '').trim())
      .filter((line) => /^[a-zA-Z]+$/.test(line));

    assert.ok(exported.length > 20, `expected a full payload, saw ${exported.length} keys`);

    const missing = exported.filter((key) => !order.has(key));
    assert.deepEqual(
      missing,
      [],
      `the export writes these but the restore would silently drop them: ${missing.join(', ')}`,
    );
  });

  /**
   * The check that was missing, and the reason six tables sat outside the export
   * unnoticed: the two tests above compare the export against the *restore*, and
   * both sides agreed because both were missing the same models. Neither ever
   * asked the schema what a complete practice consists of.
   *
   * Read off `schema.prisma` rather than a hand-kept list, so a model added
   * next year fails here on the day it is added instead of on the day somebody
   * needs their backup.
   */
  it('exports every model in the schema', async () => {
    const [schema, exporter] = await Promise.all([
      readFile(SCHEMA, 'utf8'),
      readFile(EXPORT, 'utf8'),
    ]);

    const models = [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1]);
    assert.ok(models.length > 30, `expected a full schema, saw ${models.length} models`);

    const queried = new Set(
      [...exporter.matchAll(/prisma\.(\w+)\.findMany/g)].map((match) => match[1]),
    );

    const missing = models.filter(
      (model) =>
        !NOT_EXPORTED.has(model) &&
        !queried.has(model[0].toLowerCase() + model.slice(1)),
    );

    assert.deepEqual(
      missing,
      [],
      `these models are in the schema but nothing in the backup reads them: ${missing.join(', ')}`,
    );
  });

  it('inserts parents before the rows that reference them', async () => {
    const restore = await readFile(RESTORE, 'utf8');
    const order = block(restore, 'const ORDER =');
    const at = (key: string) => {
      const index = order.indexOf(key);
      assert.notEqual(index, -1, `${key} missing from ORDER`);
      return index;
    };

    // Every edge below is a real foreign key in schema.prisma.
    assert.ok(at('patients') < at('appointments'), 'an appointment needs its patient');
    assert.ok(at('staff') < at('appointments'), 'an appointment may name a dentist');
    assert.ok(at('operatories') < at('appointments'), 'an appointment may name a chair');
    assert.ok(at('services') < at('appointments'), 'an appointment may name a service');
    assert.ok(at('patients') < at('visits'), 'a visit needs its patient');
    assert.ok(at('visits') < at('visitServices'), 'a visit service needs its visit');
    assert.ok(at('services') < at('visitServices'), 'and may name a catalogue entry');
    assert.ok(at('visits') < at('movements'), 'a movement may name the visit that caused it');
    assert.ok(at('stock') < at('movements'), 'a movement needs its material');
    assert.ok(at('stock') < at('serviceMaterials'), 'a bill of materials needs the material');
    assert.ok(at('services') < at('serviceMaterials'), 'and the service');
    assert.ok(at('stock') < at('productBarcodes'), 'a barcode names a material');
    assert.ok(at('stock') < at('batches'), 'a lot needs its material');
    assert.ok(at('suppliers') < at('stock'), 'a material may name a supplier');
    assert.ok(at('stockCategories') < at('stock'), 'a material may name a shelf');
    assert.ok(at('serviceCategories') < at('services'), 'a service may name a catalogue heading');
    assert.ok(at('patients') < at('plans'), 'a plan needs its patient');
    assert.ok(at('appointments') < at('plans'), 'a plan step may name the slot it was booked into');
    assert.ok(at('patients') < at('documents'), 'a document needs its patient');
    assert.ok(at('templates') < at('prescriptions'), 'a prescription may name its template');
    assert.ok(at('patients') < at('alerts'), 'an alert needs its patient');
    assert.ok(at('appointments') < at('contacts'), 'a contact may name the appointment it was about');
    assert.ok(at('staff') < at('closures'), "a closure may be one person's leave");
    assert.ok(at('patients') < at('waitlist'), 'a waiting entry needs its patient');
    assert.ok(at('patients') < at('scheduledMessages'), 'a queued message needs its patient');
    assert.ok(
      at('appointments') < at('scheduledMessages'),
      'a reminder may name the slot it is about',
    );
    assert.ok(
      at('staff') < at('scheduledMessages'),
      'and the person who cancelled it, if somebody did',
    );

    // A material may be one variant of a product. This is the edge that would
    // have stopped a real restore partway through, and nothing asserted it.
    assert.ok(at('stockProducts') < at('stock'), 'a material may name its product');

    assert.ok(at('templates') < at('templateServices'), 'a link needs its template');
    assert.ok(at('services') < at('templateServices'), 'and the treatment it follows');

    // The laboratory register.
    assert.ok(at('patients') < at('works'), 'a case may name the patient it is for');
    assert.ok(at('works') < at('workLines'), 'a line needs its case');

    // A follow-up points at any of three live rows and names three staff.
    assert.ok(at('staff') < at('followUps'), 'a follow-up names who it is for');
    assert.ok(at('patients') < at('followUps'), 'and may be about a patient');
    assert.ok(at('works') < at('followUps'), 'or a case at the laboratory');
    assert.ok(at('stock') < at('followUps'), 'or a material to reorder');

    // The trail references everything, so it goes last.
    assert.equal(order.at(-1), 'audit');
  });

  it('names a real Prisma model for every key it restores', async () => {
    const restore = await readFile(RESTORE, 'utf8');
    const order = block(restore, 'const ORDER =');
    for (const key of order) {
      assert.ok(
        new RegExp(`\\b${key}:\\s*'[a-zA-Z]+'`).test(restore),
        `${key} has no entry in MODEL`,
      );
    }
  });
});
