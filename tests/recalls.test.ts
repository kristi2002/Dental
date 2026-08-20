import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type PatientForRecall,
  selectFollowUps,
  selectRecalls,
} from '../src/lib/recalls';

/**
 * Who the clinic is told to ring, and who it is told to leave alone.
 *
 * Both lists are queues a person works through, so a wrong row costs somebody a
 * phone call they should not have made — ringing a patient who is already booked
 * for Thursday, or ringing one who asked not to be reminded. Every gate below is
 * one of those calls.
 *
 * `selectRecalls` and `selectFollowUps` take `now` rather than reading the clock,
 * which is what makes the boundaries testable at all: due today, one day short of
 * due, the last day of a cooldown.
 */

const NOW = new Date('2026-08-20T00:00:00.000Z');

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function patient(overrides: Partial<PatientForRecall> = {}): PatientForRecall {
  return {
    id: 'p1',
    firstName: 'Arta',
    lastName: 'Krasniqi',
    phone: '0691234567',
    email: 'arta@example.al',
    createdAt: daysBefore(400),
    recallMonths: 6,
    recallSnoozedUntil: null,
    lastRecallAt: null,
    contactConsent: true,
    // Six months and a day ago: due, by one day.
    visitRecords: [{ visitDate: new Date('2026-02-19T00:00:00.000Z'), servicesText: 'Mbushje' }],
    appointments: [],
    ...overrides,
  };
}

describe('selectRecalls — whose check-up is overdue', () => {
  it('surfaces a patient whose recall interval has passed', () => {
    const rows = selectRecalls([patient()], NOW);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'p1');
    assert.equal(rows[0].recallMonths, 6);
  });

  it('counts overdueDays from the due date, not from the visit', () => {
    // Seen 19 Feb, six-month recall, so due 19 Aug and one day overdue on the 20th.
    assert.equal(selectRecalls([patient()], NOW)[0].overdueDays, 1);
  });

  it('includes a patient due exactly today', () => {
    // Due today is due. Excluding it would silently move every recall a day late.
    const rows = selectRecalls(
      [patient({ visitRecords: [{ visitDate: new Date('2026-02-20T00:00:00.000Z'), servicesText: '' }] })],
      NOW,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].overdueDays, 0);
  });

  it('excludes a patient who is not due until tomorrow', () => {
    const rows = selectRecalls(
      [patient({ visitRecords: [{ visitDate: new Date('2026-02-21T00:00:00.000Z'), servicesText: '' }] })],
      NOW,
    );
    assert.equal(rows.length, 0);
  });

  it('excludes anyone already booked, however overdue the calendar says', () => {
    const rows = selectRecalls([patient({ appointments: [{ id: 'a1' }] })], NOW);
    assert.equal(rows.length, 0);
  });

  it('excludes a patient who asked not to be reminded (recallMonths 0)', () => {
    assert.equal(selectRecalls([patient({ recallMonths: 0 })], NOW).length, 0);
  });

  it('excludes a snooze that has not run out, and includes one that has', () => {
    assert.equal(selectRecalls([patient({ recallSnoozedUntil: daysBefore(-1) })], NOW).length, 0);
    assert.equal(selectRecalls([patient({ recallSnoozedUntil: daysBefore(1) })], NOW).length, 1);
  });

  it('holds a recently contacted patient for the 30-day cooldown', () => {
    assert.equal(selectRecalls([patient({ lastRecallAt: daysBefore(29) })], NOW).length, 0);
    // Day 30 is the day they come back — the cooldown is "less than 30", not "at most".
    assert.equal(selectRecalls([patient({ lastRecallAt: daysBefore(30) })], NOW).length, 1);
  });

  it('counts from the registration date for somebody never seen', () => {
    // Otherwise a patient entered and never booked sits invisible forever.
    const rows = selectRecalls(
      [patient({ visitRecords: [], createdAt: new Date('2026-01-10T00:00:00.000Z') })],
      NOW,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].lastVisit, null);
    assert.equal(rows[0].overdueDays, 41); // due 10 Jul, now 20 Aug
  });

  it('reports lastVisit as a plain YYYY-MM-DD key', () => {
    assert.equal(selectRecalls([patient()], NOW)[0].lastVisit, '2026-02-19');
  });

  it('reports whole months since the reference date', () => {
    assert.equal(selectRecalls([patient()], NOW)[0].monthsSince, 6);
  });

  it('sorts the longest overdue first — that is the reading order', () => {
    const rows = selectRecalls(
      [
        patient({ id: 'recent', visitRecords: [{ visitDate: new Date('2026-02-19T00:00:00.000Z'), servicesText: '' }] }),
        patient({ id: 'ancient', visitRecords: [{ visitDate: new Date('2024-01-01T00:00:00.000Z'), servicesText: '' }] }),
        patient({ id: 'middle', visitRecords: [{ visitDate: new Date('2025-06-01T00:00:00.000Z'), servicesText: '' }] }),
      ],
      NOW,
    );
    assert.deepEqual(rows.map((r) => r.id), ['ancient', 'middle', 'recent']);
  });

  it('passes consent through untouched, including the "nobody asked" null', () => {
    // Tri-state on purpose: null is not a refusal, and the buttons treat it
    // differently from false.
    assert.equal(selectRecalls([patient({ contactConsent: null })], NOW)[0].contactConsent, null);
    assert.equal(selectRecalls([patient({ contactConsent: false })], NOW)[0].contactConsent, false);
  });

  it('turns a missing email into an empty string rather than null', () => {
    assert.equal(selectRecalls([patient({ email: null })], NOW)[0].email, '');
  });
});

describe('selectFollowUps — how is the tooth today', () => {
  function treated(daysAgo: number, overrides: Partial<PatientForRecall> = {}) {
    return patient({
      visitRecords: [{ visitDate: daysBefore(daysAgo), servicesText: 'Heqje dhëmbi' }],
      ...overrides,
    });
  }

  it('surfaces a patient treated inside the two-to-seven-day window', () => {
    for (const days of [2, 3, 5, 7]) {
      assert.equal(selectFollowUps([treated(days)], NOW).length, 1, `day ${days} should be in`);
    }
  });

  it('excludes yesterday and today — too soon to ask', () => {
    for (const days of [0, 1]) {
      assert.equal(selectFollowUps([treated(days)], NOW).length, 0, `day ${days} should be out`);
    }
  });

  it('excludes anything older than a week — too late to ask', () => {
    for (const days of [8, 30]) {
      assert.equal(selectFollowUps([treated(days)], NOW).length, 0, `day ${days} should be out`);
    }
  });

  it('excludes a patient with no visits at all', () => {
    assert.equal(selectFollowUps([patient({ visitRecords: [] })], NOW).length, 0);
  });

  it('ignores recallMonths 0 — a follow-up is not a recall', () => {
    // Opting out of "your six months are up" is not opting out of the clinical
    // courtesy call two days after an extraction. Filtering these together was
    // the bug the shared query comment warns about.
    assert.equal(selectFollowUps([treated(3, { recallMonths: 0 })], NOW).length, 1);
  });

  it('still offers a follow-up to somebody already booked', () => {
    // Unlike a recall: a booking answers "are you coming back", not "how is it".
    assert.equal(selectFollowUps([treated(3, { appointments: [{ id: 'a1' }] })], NOW).length, 1);
  });

  it('holds off only if they were contacted in the last two days', () => {
    assert.equal(selectFollowUps([treated(5, { lastRecallAt: daysBefore(1) })], NOW).length, 0);
    assert.equal(selectFollowUps([treated(5, { lastRecallAt: daysBefore(2) })], NOW).length, 1);
  });

  it('quotes the visit text back, which is what the message is built from', () => {
    assert.equal(selectFollowUps([treated(3)], NOW)[0].services, 'Heqje dhëmbi');
  });

  it('sorts the freshest treatment first — the opposite of recalls', () => {
    const rows = selectFollowUps(
      [treated(7, { id: 'oldest' }), treated(2, { id: 'newest' }), treated(4, { id: 'middle' })],
      NOW,
    );
    assert.deepEqual(rows.map((r) => r.id), ['newest', 'middle', 'oldest']);
  });
});

describe('both lists', () => {
  it('return nothing for nobody', () => {
    assert.deepEqual(selectRecalls([], NOW), []);
    assert.deepEqual(selectFollowUps([], NOW), []);
  });
});
