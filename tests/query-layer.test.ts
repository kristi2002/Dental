import assert from 'node:assert/strict';
import { after, before, describe, it, type TestContext } from 'node:test';
import {
  AppointmentStatus,
  CancelledBy,
  ContactChannel,
  ContactPurpose,
} from '../src/generated/prisma/enums';
import { addDays, addMonths, today } from '../src/lib/dates';
import { prisma } from '../src/lib/prisma';
import { getStockAlerts, getUnremindedTomorrow } from '../src/lib/queries';
import { getRecalls } from '../src/lib/recalls';
import { getReliability, getReliabilityMap, NOT_CLINIC_CANCELLED } from '../src/lib/reliability';
import { findConflicts, lockDiaryDays, OCCUPIES_A_SLOT } from '../src/lib/scheduling';

/**
 * The half of the app the rest of this suite cannot see.
 *
 * Every other test file here is a pure-function test, which is what made them
 * cheap and fast and is also why four live bugs sat in the repository with 800
 * tests passing over the top of them. All four lived in the same thin seam: the
 * few lines where worked-out logic becomes a Prisma `where`. A pure test cannot
 * reach that seam, because the seam *is* the database call.
 *
 * Three of the four were the same mistake — a filter written against a nullable
 * column with no branch for null, which in SQL matches nothing rather than
 * everything — and it fails in the worst possible direction: silently, and
 * looking exactly like a well-behaved practice with nothing to report.
 *
 * So these tests run against a real Postgres, and skip themselves cleanly when
 * there is not one. CI has a database; a fresh clone does not, and reporting
 * three broken suites to somebody who has just typed `npm install` would teach
 * them to ignore this file.
 *
 * **`npm test` passes `--env-file-if-exists=.env` for exactly this file.**
 * Nothing else in `tests/` opens a connection, and for most of this suite's life
 * the script did not load `.env` at all — so locally these thirteen tests were
 * skipped on every run, including the two that pin the diary's advisory lock.
 * That skip is a `describe` option rather than skipped tests, so the summary
 * read `pass 1149 … skipped 0` and said nothing about a whole layer not having
 * run. Only CI, which sets `DATABASE_URL` in the environment, was ever
 * exercising the seam this file exists to cover.
 *
 * `-if-exists` and not `--env-file`, because the latter is a hard error when
 * the file is absent — which is the fresh clone above, and would break `npm
 * test` for the one person least able to diagnose it.
 *
 * Note what that means: run locally, these write to whatever `DATABASE_URL`
 * names, which is your development database. Every row created here is either
 * named `MARKER` or cascades from a row that is, `cleanUp` removes exactly
 * those, and nothing here creates a `StockMovement` — the one relation that
 * would refuse the delete. Keep it that way; a fixture that outlives the run is
 * a fixture in somebody's patient list.
 *
 * An explicit variable still wins over the file, so
 * `DATABASE_URL=…?schema=scratch npm test` aims the whole suite somewhere
 * disposable, and CI — which sets the variable and ships no `.env` — is
 * untouched by any of this.
 */

const MARKER = '__querylayer_fixture__';

/**
 * Two gates rather than one, because the transform these tests run under has no
 * top-level await and the connection cannot be tried before `describe` is
 * called. The variable is checked synchronously, which covers the fresh clone;
 * the connection is tried in `before`, which covers a `.env` pointing at a
 * database that is not up.
 */
const NO_URL = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set';
let unreachable: string | null = null;

/** Skips the test in hand when `before` could not reach a database. */
function needsDatabase(t: TestContext): boolean {
  if (unreachable) {
    t.skip(unreachable);
    return true;
  }
  return false;
}

/** Everything this file creates carries the marker, and only that is removed. */
async function cleanUp(): Promise<void> {
  if (unreachable) return;
  await prisma.patient.deleteMany({ where: { lastName: MARKER } });
  // Materials hang off no patient, so they need their own sweep. The name is
  // the marker, which is also what keeps a real storeroom untouched.
  await prisma.stockItem.deleteMany({ where: { name: MARKER } });
}

async function makePatient(consent: boolean | null): Promise<string> {
  const patient = await prisma.patient.create({
    data: { firstName: 'Fixture', lastName: MARKER, phone: '', contactConsent: consent },
  });
  return patient.id;
}

describe('the query layer — filters that only a database can settle', { skip: NO_URL }, () => {
  before(async () => {
    try {
      // A real query against a real table, not `SELECT 1`: a database that is
      // up but has never had the migrations applied answers `SELECT 1`
      // perfectly well and then fails on every line below it. Asking for the
      // table turns that into a clean skip.
      await prisma.patient.count();
    } catch (error) {
      unreachable = `no migrated database reachable (${(error as Error).message.split('\n')[0]})`;
    }
  });

  after(cleanUp);

  it('counts a patient cancellation, which has no `cancelledBy` at all', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);
    const past = addDays(today(), -7);

    // The ordinary history of an ordinary patient: nothing here was called off
    // by the clinic, so `cancelledBy` is null on all four rows — which is the
    // exact shape that `NOT: { cancelledBy: CLINIC }` threw away wholesale.
    await prisma.appointment.createMany({
      data: [
        { patientId, date: past, startTime: '09:00', status: AppointmentStatus.COMPLETED },
        { patientId, date: past, startTime: '10:00', status: AppointmentStatus.COMPLETED },
        { patientId, date: past, startTime: '11:00', status: AppointmentStatus.NO_SHOW },
        { patientId, date: past, startTime: '12:00', status: AppointmentStatus.CANCELLED },
      ],
    });

    const score = await getReliability(patientId);

    // The regression, stated plainly: this was 0, so `level` was 'unknown', so
    // the badge rendered nothing — for every patient in the practice.
    assert.equal(score.past, 4, 'past appointments must survive the clinic-cancellation filter');
    assert.equal(score.noShows, 1);
    assert.equal(score.cancellations, 1);
    assert.equal(score.level, 'watch');
  });

  it("does not count a slot the clinic called off against the patient", async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);
    const past = addDays(today(), -7);

    await prisma.appointment.createMany({
      data: [
        { patientId, date: past, startTime: '09:00', status: AppointmentStatus.COMPLETED },
        // The clinic's doing. It must be invisible to the score — which is the
        // thing the filter was there to achieve, and still is.
        {
          patientId,
          date: past,
          startTime: '10:00',
          status: AppointmentStatus.CANCELLED,
          cancelledBy: CancelledBy.CLINIC,
        },
      ],
    });

    const score = await getReliability(patientId);
    assert.equal(score.past, 1, 'a clinic cancellation is not part of the patient’s history');
    assert.equal(score.cancellations, 0);
  });

  it('gives the list badge and the record badge the same answer', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);
    const past = addDays(today(), -7);

    await prisma.appointment.createMany({
      data: [
        { patientId, date: past, startTime: '09:00', status: AppointmentStatus.COMPLETED },
        { patientId, date: past, startTime: '10:00', status: AppointmentStatus.NO_SHOW },
        {
          patientId,
          date: past,
          startTime: '11:00',
          status: AppointmentStatus.CANCELLED,
          cancelledBy: CancelledBy.CLINIC,
        },
      ],
    });

    // These two have disagreed before, in both directions. The patient list and
    // the patient's own screen are one claim about one person.
    const one = await getReliability(patientId);
    const many = (await getReliabilityMap([patientId])).get(patientId);
    assert.deepEqual(many, one);
  });

  it('still chases a patient nobody has asked about consent', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    // Null, not false: "nobody has asked" is the state every imported patient
    // starts in, and `{ not: false }` matched none of them.
    const patientId = await makePatient(null);
    const tomorrow = addDays(today(), 1);

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        date: tomorrow,
        startTime: '09:00',
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const rows = await getUnremindedTomorrow();
    assert.ok(
      rows.some((row) => row.id === appointment.id),
      'an un-asked patient must still appear on the reminder list',
    );
  });

  it('leaves out a patient who has said no', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(false);
    const tomorrow = addDays(today(), 1);

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        date: tomorrow,
        startTime: '09:00',
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const rows = await getUnremindedTomorrow();
    assert.ok(
      !rows.some((row) => row.id === appointment.id),
      'an explicit refusal still closes it',
    );
  });

  it('warns about booking over a patient who has already arrived', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);
    const day = addDays(today(), 3);

    const sitting = await prisma.appointment.create({
      data: {
        patientId,
        date: day,
        startTime: '09:00',
        durationMin: 40,
        status: AppointmentStatus.ARRIVED,
      },
    });

    // Neither side names a dentist or a chair, so `collides` falls back to "we
    // cannot prove these apart" — which is a clash. The only question this asks
    // is whether an ARRIVED row is looked at in the first place.
    const conflicts = await findConflicts({
      date: day,
      startTime: '09:15',
      durationMin: 30,
    });

    assert.ok(
      conflicts.some((conflict) => conflict.id === sitting.id),
      'the patient is in the chair — the slot is not free',
    );
  });

  it('treats a cancelled slot as free, which is the point of the distinction', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);
    const day = addDays(today(), 3);

    await prisma.appointment.create({
      data: {
        patientId,
        date: day,
        startTime: '09:00',
        durationMin: 40,
        status: AppointmentStatus.CANCELLED,
      },
    });

    const conflicts = await findConflicts({ date: day, startTime: '09:15', durationMin: 30 });
    assert.equal(conflicts.length, 0, 'the chair really is free');
  });

  /**
   * The recall list's two `where` clauses, which are the only part of that
   * module a pure test cannot reach. `selectRecalls` is covered exhaustively in
   * `recalls.test.ts`; what is asserted here is that the query hands it the
   * right rows in the first place.
   */
  it('does not chase a patient who is sitting in the chair', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);

    // Long overdue: seen ten months ago on a six-month recall.
    await prisma.visitRecord.create({
      data: {
        patientId,
        visitDate: addMonths(today(), -10),
        notes: MARKER,
        servicesText: 'Mbushje',
      },
    });

    // Booked today, and the front desk has pressed Arrived. The old filter
    // asked for SCHEDULED alone, so this row stopped counting as a booking at
    // the exact moment the practice became most certain of it.
    await prisma.appointment.create({
      data: {
        patientId,
        date: today(),
        startTime: '09:00',
        status: AppointmentStatus.ARRIVED,
      },
    });

    const rows = await getRecalls();
    assert.ok(
      !rows.some((row) => row.id === patientId),
      'a patient in the building is not a patient to ring',
    );
  });

  /**
   * The storage room's silences, asserted where they are actually decided.
   *
   * `alertVisible` is covered case by case in `stock-alerts.test.ts`. What only
   * a database can settle is that `getStockAlerts` reads `expectedAt` at all —
   * the column was written, stored and printed for as long as orders have
   * existed, and no query ever selected it for a comparison.
   */
  it('keeps a material off the board while its order is still due', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();

    const item = await prisma.stockItem.create({
      data: {
        name: MARKER,
        quantity: 0,
        minLimit: 10,
        orderedAt: addDays(today(), -2),
        expectedAt: addDays(today(), 5),
      },
    });

    const { active } = await getStockAlerts();
    assert.ok(
      !active.some((alert) => alert.id === item.id),
      'the box is genuinely coming — asking again is what makes people skim the board',
    );
  });

  it('puts a material back on the board once its delivery is overdue', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();

    const item = await prisma.stockItem.create({
      data: {
        name: MARKER,
        quantity: 0,
        minLimit: 10,
        orderedAt: addDays(today(), -20),
        expectedAt: addDays(today(), -9),
      },
    });

    const { active } = await getStockAlerts();
    const row = active.find((alert) => alert.id === item.id);

    // The regression, stated plainly: this row did not exist. Marking a
    // material ordered switched its alarm off permanently, so a supplier who
    // never delivered left an empty shelf reading as dealt with.
    assert.ok(row, 'an order that never arrived is exactly what the board is for');
    assert.equal(row.orderLateDays, 9);
    assert.equal(row.severity, 'out');
  });

  it('holds a patient the contact log says was messaged this week', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);

    await prisma.visitRecord.create({
      data: {
        patientId,
        visitDate: addMonths(today(), -10),
        notes: MARKER,
        servicesText: 'Mbushje',
      },
    });

    // Nothing booked and `lastRecallAt` never stamped: on the old rule this
    // patient was due, however recently somebody had written to them.
    assert.ok(
      (await getRecalls()).some((row) => row.id === patientId),
      'the fixture must be overdue to begin with, or the assertion below proves nothing',
    );

    await prisma.contact.create({
      data: {
        patientId,
        channel: ContactChannel.WHATSAPP,
        purpose: ContactPurpose.RECALL,
        body: MARKER,
      },
    });

    const rows = await getRecalls();
    assert.ok(
      !rows.some((row) => row.id === patientId),
      'opening the message is what the cooldown reads — not only the Contacted button',
    );
  });

  /**
   * Two people booking the same chair in the same second.
   *
   * The conflict check and the write used to be two separate round trips with
   * nothing holding the slot between them, so two requests could both be told
   * the time was free and both take it. Nothing afterwards showed it: two
   * ordinary rows, no warning, and the second patient found out in the waiting
   * room.
   *
   * The pause inside each attempt is what makes this a race rather than a
   * coincidence. It is the gap between deciding and writing, held open on
   * purpose and made wide enough that two attempts *must* overlap — so a run
   * that comes back with one booking proves the lock, and not luck.
   */
  async function bookConcurrently(
    patientId: string,
    day: Date,
    { locked }: { locked: boolean },
  ): Promise<string[]> {
    const attempt = () =>
      prisma.$transaction(
        async (tx) => {
          if (locked) await lockDiaryDays(tx, [day]);

          const clashes = await findConflicts({
            date: day,
            startTime: '09:00',
            durationMin: 30,
            client: tx,
          });
          if (clashes.length > 0) return 'refused';

          // The window. Without the lock above, the other attempt reads the
          // same empty diary inside these 60ms.
          await new Promise((resolve) => setTimeout(resolve, 60));

          await tx.appointment.create({
            data: {
              patientId,
              date: day,
              startTime: '09:00',
              durationMin: 30,
              status: AppointmentStatus.SCHEDULED,
            },
          });
          return 'booked';
        },
        // Generous: the second attempt spends most of it waiting on the first.
        { timeout: 20_000, maxWait: 20_000 },
      );

    const results = await Promise.all([attempt(), attempt()]);
    return results.toSorted();
  }

  it('lets exactly one of two simultaneous bookings take the chair', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);
    const day = addDays(today(), 3);

    const results = await bookConcurrently(patientId, day, { locked: true });

    assert.deepEqual(
      results,
      ['booked', 'refused'],
      'one books, the other is told the slot went — never both',
    );

    const rows = await prisma.appointment.count({ where: { patientId, date: day } });
    assert.equal(rows, 1, 'and exactly one appointment reaches the diary');
  });

  it('would double-book without the lock — which is what makes the test above mean something', async (t) => {
    if (needsDatabase(t)) return;
    await cleanUp();
    const patientId = await makePatient(null);
    const day = addDays(today(), 4);

    // Deliberately the broken shape: check, pause, write, with nothing holding
    // the slot. If this ever comes back `['booked', 'refused']` the window has
    // stopped being a window and the test above has stopped proving anything.
    //
    // One future change is *expected* to break this, and it is the right kind
    // of break: an `EXCLUDE USING gist` constraint on the appointment range
    // (see `docs/SYSTEMS.md` §8.5) would have the database refuse the second
    // insert on its own. When that lands, this test should be replaced by one
    // asserting the constraint rejects it — not deleted, and not "fixed" by
    // loosening the assertion.
    const results = await bookConcurrently(patientId, day, { locked: false });

    assert.deepEqual(
      results,
      ['booked', 'booked'],
      'check-then-write with no lock lets both in — the bug this exists to pin',
    );

    await prisma.appointment.deleteMany({ where: { patientId, date: day } });
  });
});

/**
 * The shape of the two filters, asserted without a database.
 *
 * Cheap, always runs, and each one names the exact thing whose absence was the
 * bug — so a future edit that quietly drops the null branch or the `ARRIVED`
 * entry fails here even on a machine with no Postgres.
 */
describe('the filters themselves', () => {
  it('counts a patient who is in the chair as occupying it', () => {
    assert.ok(
      OCCUPIES_A_SLOT.includes(AppointmentStatus.ARRIVED),
      'ARRIVED must block — this is the one that was missing',
    );
    assert.ok(OCCUPIES_A_SLOT.includes(AppointmentStatus.SCHEDULED));
    assert.ok(OCCUPIES_A_SLOT.includes(AppointmentStatus.COMPLETED));
  });

  it('leaves a freed chair free', () => {
    const statuses: readonly AppointmentStatus[] = OCCUPIES_A_SLOT;
    assert.ok(!statuses.includes(AppointmentStatus.CANCELLED));
    assert.ok(!statuses.includes(AppointmentStatus.NO_SHOW));
  });

  it('spells the clinic-cancellation filter with an explicit null branch', () => {
    // `NOT: { cancelledBy: CLINIC }` reads better and matches nothing, because
    // SQL cannot say a null is unequal to anything. The `OR` is not a style
    // choice; it is the fix.
    const branches = NOT_CLINIC_CANCELLED.OR;
    assert.ok(Array.isArray(branches), 'must be an OR, not a bare NOT');
    assert.ok(
      branches.some((branch) => 'cancelledBy' in branch && branch.cancelledBy === null),
      'a null `cancelledBy` — an appointment nobody cancelled — must match',
    );
  });
});
