import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { MAIL_FAILURE_NOTES, MAIL_SENT_NOTE } from '../src/lib/messages/email';
import {
  CANCEL_NOTES,
  dedupeKey,
  isHeld,
  MAX_COURTESY_CONTACTS,
  monthCycle,
  noteKey,
  reminderWindow,
  retryAfter,
  RETRY_MINUTES,
  SENT_NOTES,
  shouldQueueCourtesy,
  shouldQueueReminder,
  SKIP_NOTES,
  stillWorthSending,
  usableEmail,
  type ReminderCandidate
} from '../src/lib/messages/outbox';

function candidate(over: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    appointmentId: 'appt-1',
    patientId: 'pat-1',
    contactConsent: null,
    phone: '069 12 34 567',
    email: 'someone@example.al',
    answered: false,
    alreadyContacted: false,
    ...over,
  };
}

describe('dedupeKey — what makes a clock safe to run twice', () => {
  it('namespaces by kind, so two kinds about one subject do not collide', () => {
    assert.equal(dedupeKey('APPOINTMENT_REMINDER', 'appt-1'), 'reminder:appt-1');
  });

  it('is stable — the same inputs give the same key', () => {
    assert.equal(
      dedupeKey('APPOINTMENT_REMINDER', 'appt-1'),
      dedupeKey('APPOINTMENT_REMINDER', 'appt-1'),
    );
  });

  it('separates two appointments', () => {
    assert.notEqual(
      dedupeKey('APPOINTMENT_REMINDER', 'appt-1'),
      dedupeKey('APPOINTMENT_REMINDER', 'appt-2'),
    );
  });

  it('takes extra parts, so a recurring kind can name its occurrence', () => {
    assert.equal(dedupeKey('APPOINTMENT_REMINDER', 'pat-1', '2026'), 'reminder:pat-1:2026');
  });
});

describe('shouldQueueReminder — who is worth reminding', () => {
  it('queues an ordinary booking', () => {
    assert.deepEqual(shouldQueueReminder(candidate()), { queue: true });
  });

  it('queues when nobody has asked about consent — null is not a refusal', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ contactConsent: null })), { queue: true });
  });

  it('queues when consent was given', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ contactConsent: true })), { queue: true });
  });

  it('refuses when the patient asked not to be contacted', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ contactConsent: false })), {
      queue: false,
      reason: 'opted-out',
    });
  });

  it('refuses when they have already answered', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ answered: true })), {
      queue: false,
      reason: 'answered',
    });
  });

  it('refuses when somebody has already reminded them', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ alreadyContacted: true })), {
      queue: false,
      reason: 'already-contacted',
    });
  });

  it('refuses when there is no way to reach them', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ phone: '', email: '' })), {
      queue: false,
      reason: 'no-contact-details',
    });
  });

  it('treats whitespace as no contact details', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ phone: '   ', email: '\t' })), {
      queue: false,
      reason: 'no-contact-details',
    });
  });

  it('queues on a phone number alone, and on an address alone', () => {
    assert.deepEqual(shouldQueueReminder(candidate({ email: '' })), { queue: true });
    assert.deepEqual(shouldQueueReminder(candidate({ phone: '' })), { queue: true });
  });

  /**
   * The order matters, and it is not arbitrary — see the function's own note.
   * "Already answered" is not a refusal and must not be reported as an opt-out,
   * because the two mean opposite things to whoever reads the queue.
   */
  it('reports having answered ahead of an opt-out', () => {
    const decision = shouldQueueReminder(
      candidate({ answered: true, contactConsent: false, phone: '', email: '' }),
    );
    assert.deepEqual(decision, { queue: false, reason: 'answered' });
  });

  it('reports an opt-out ahead of missing details', () => {
    const decision = shouldQueueReminder(
      candidate({ contactConsent: false, phone: '', email: '' }),
    );
    assert.deepEqual(decision, { queue: false, reason: 'opted-out' });
  });
});

describe('stillWorthSending — the queue does not offer to remind somebody in the chair', () => {
  // 10:30 on the 20th, which is the moment every case below is judged against.
  const now = { dateKey: '2026-08-20', minutes: 10 * 60 + 30 };

  it('keeps tomorrow', () => {
    assert.equal(stillWorthSending({ date: '2026-08-21', startTime: '09:00' }, now), true);
  });

  it('drops yesterday, whatever the hour', () => {
    assert.equal(stillWorthSending({ date: '2026-08-19', startTime: '23:59' }, now), false);
  });

  it('keeps a slot later today', () => {
    assert.equal(stillWorthSending({ date: '2026-08-20', startTime: '10:31' }, now), true);
  });

  it('drops a slot earlier today', () => {
    assert.equal(stillWorthSending({ date: '2026-08-20', startTime: '09:00' }, now), false);
  });

  /**
   * By the start, not the end. Once they are due in the chair a reminder cannot
   * change anything, and "the appointment is not over yet" is not the question.
   */
  it('drops one that has just begun', () => {
    assert.equal(stillWorthSending({ date: '2026-08-20', startTime: '10:30' }, now), false);
  });

  it('compares dates as dates, not as strings that happen to sort', () => {
    // Across a month boundary a naive comparison of `startTime` alone, or of
    // day-of-month, gets this backwards.
    assert.equal(stillWorthSending({ date: '2026-09-01', startTime: '08:00' }, now), true);
    assert.equal(stillWorthSending({ date: '2026-07-31', startTime: '23:00' }, now), false);
  });

  /**
   * A birthday or a recall has no moment to be late for. Those are paced by
   * `sendAfter`; this rule has nothing to say about them and must not quietly
   * drop them.
   */
  it('keeps a message that is not about a slot at all', () => {
    assert.equal(stillWorthSending(null, now), true);
  });
});

describe('noteKey — an English note on an Albanian screen', () => {
  it('recognises every note the app writes', () => {
    const notes = [
      ...Object.values(SKIP_NOTES),
      ...Object.values(CANCEL_NOTES),
      ...Object.values(SENT_NOTES),
      ...Object.values(MAIL_FAILURE_NOTES),
      MAIL_SENT_NOTE,
    ];
    for (const note of notes) {
      assert.ok(noteKey(note), `no translation key for "${note}"`);
    }
  });

  it('gives every note a key of its own', () => {
    const notes = [
      ...Object.values(SKIP_NOTES),
      ...Object.values(CANCEL_NOTES),
      ...Object.values(SENT_NOTES),
      ...Object.values(MAIL_FAILURE_NOTES),
      MAIL_SENT_NOTE,
    ];
    const keys = notes.map((note) => noteKey(note));
    assert.equal(
      new Set(keys).size,
      keys.length,
      'two notes share a key, so one of them will be shown as the other',
    );
  });

  it('falls through on anything it does not know, rather than inventing a key', () => {
    assert.equal(noteKey('something a later version wrote'), null);
    assert.equal(noteKey(null), null);
    assert.equal(noteKey(''), null);
  });

  /**
   * The half of this that a unit test would otherwise miss entirely. `noteKey`
   * returning `'cancelPassed'` is worth nothing if no catalogue has a sentence
   * under that name — next-intl renders the key itself, so the front desk reads
   * `outbox.note.cancelPassed` and the failure looks like a typo rather than a
   * missing translation. Every locale, because the one that gets forgotten is
   * never the one being developed in.
   */
  it('has all three catalogues agreeing with it', async () => {
    const notes = [
      ...Object.values(SKIP_NOTES),
      ...Object.values(CANCEL_NOTES),
      ...Object.values(SENT_NOTES),
      ...Object.values(MAIL_FAILURE_NOTES),
      MAIL_SENT_NOTE,
    ];

    for (const locale of ['en', 'it', 'sq']) {
      const raw = await readFile(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8');
      const catalogue = JSON.parse(raw) as { outbox?: { note?: Record<string, string> } };
      const translated = catalogue.outbox?.note ?? {};

      const missing = notes
        .map((note) => noteKey(note))
        .filter((key): key is string => key !== null)
        .filter((key) => !translated[key]);

      assert.deepEqual(missing, [], `${locale}.json has no outbox.note for: ${missing.join(', ')}`);
    }
  });
});

describe('notes — every outcome can explain itself', () => {
  it('has a sentence for every skip reason', () => {
    const reasons = ['answered', 'already-contacted', 'opted-out', 'no-contact-details'] as const;
    for (const reason of reasons) {
      assert.ok(SKIP_NOTES[reason]?.length > 0, `no note for ${reason}`);
    }
  });

  it('has a sentence for every cancel reason', () => {
    const reasons = [
      'rescheduled',
      'status-changed',
      'answered',
      'deleted',
      'passed',
      'set-aside',
      'no-longer-due',
      'opted-out',
      'window-closed',
      'booked-in',
    ] as const;
    for (const reason of reasons) {
      assert.ok(CANCEL_NOTES[reason]?.length > 0, `no note for ${reason}`);
    }
    // Read off the object too, so a reason added to the type without a sentence
    // fails here rather than rendering as an empty line on the queue.
    assert.equal(Object.keys(CANCEL_NOTES).length, reasons.length);
  });

  it('says nothing a patient should not read, because these are internal', () => {
    const notes = [
      ...Object.values(SKIP_NOTES),
      ...Object.values(CANCEL_NOTES),
      ...Object.values(SENT_NOTES),
      ...Object.values(MAIL_FAILURE_NOTES),
      MAIL_SENT_NOTE,
    ];
    for (const note of notes) {
      assert.doesNotMatch(note, /^[A-Z]/, `"${note}" reads like a sentence sent to somebody`);
    }
  });
});

describe('shouldQueueCourtesy — what the courtesy lists leave to a person', () => {
  const reachable = { contactConsent: null, phone: '069', email: '' };

  it('queues somebody the recall list has already decided is due', () => {
    // Thin on purpose. `selectRecalls` has already excluded anybody booked,
    // snoozed, recently chased or opted out of recalls entirely; what is left
    // for this to ask is only what that list deliberately does not.
    assert.deepEqual(shouldQueueCourtesy(reachable), { queue: true });
  });

  it('refuses somebody who asked not to be contacted', () => {
    // The recall *list* still shows them — it is worked by a person who can see
    // the refusal on the row and ring them about something else. A queue is
    // worked down without reading, so it must not contain them at all.
    assert.deepEqual(shouldQueueCourtesy({ ...reachable, contactConsent: false }), {
      queue: false,
      reason: 'opted-out',
    });
  });

  it('treats "nobody asked" as permission to ask', () => {
    // Tri-state, and null is the honest state of every record predating the
    // question — which in a real practice is most of them.
    assert.equal(shouldQueueCourtesy({ ...reachable, contactConsent: null }).queue, true);
    assert.equal(shouldQueueCourtesy({ ...reachable, contactConsent: true }).queue, true);
  });

  it('refuses a patient there is no way to reach', () => {
    assert.deepEqual(shouldQueueCourtesy({ ...reachable, phone: '  ', email: '' }), {
      queue: false,
      reason: 'no-contact-details',
    });
  });

  it('takes an email address as a way to reach them', () => {
    assert.equal(shouldQueueCourtesy({ ...reachable, phone: '', email: 'a@b.al' }).queue, true);
  });
});

describe('monthCycle — one row per patient per cycle', () => {
  it('is the calendar month, zero-padded', () => {
    assert.equal(monthCycle(new Date('2026-08-26T00:00:00.000Z')), '2026-08');
    assert.equal(monthCycle(new Date('2026-01-01T00:00:00.000Z')), '2026-01');
    assert.equal(monthCycle(new Date('2026-12-31T23:59:59.000Z')), '2026-12');
  });

  it('builds a key that cannot collide with a reminder', () => {
    const key = dedupeKey('RECALL_DUE', 'p1', monthCycle(new Date('2026-08-26T00:00:00.000Z')));
    assert.equal(key, 'recall:p1:2026-08');
    assert.notEqual(key, dedupeKey('APPOINTMENT_REMINDER', 'p1'));
  });

  it('gives one patient one row a month and a fresh one the next', () => {
    // A month is longer than the thirty-day cooldown a recall already answers
    // to, so nobody is queued twice for one overdue check-up; and short enough
    // that somebody still overdue in November is asked about again rather than
    // dropping out for ever after one unanswered August.
    const august = dedupeKey('RECALL_DUE', 'p1', monthCycle(new Date('2026-08-02T00:00:00.000Z')));
    const laterAugust = dedupeKey('RECALL_DUE', 'p1', monthCycle(new Date('2026-08-29T00:00:00.000Z')));
    const september = dedupeKey('RECALL_DUE', 'p1', monthCycle(new Date('2026-09-01T00:00:00.000Z')));

    assert.equal(august, laterAugust);
    assert.notEqual(august, september);
  });
});

/**
 * The window, and the overnight rollover that used to fall through it.
 *
 * The reminder job is fired twice a day so the morning run can catch a slot
 * booked after the evening one read the diary. That only works if the window
 * starts at *today*: `today()` rolls over overnight, so a window of `today() + 1`
 * alone has Monday's two runs both covering Tuesday and Tuesday's two both
 * covering Wednesday — and the booking made at half past six on Monday for nine
 * on Tuesday is read by neither.
 *
 * `stillWorthSending` is what keeps the near edge honest, and it is already
 * covered above; these are about the edge itself.
 */
describe('outbox — the reminder window', () => {
  const monday = new Date(Date.UTC(2026, 7, 31));
  const tuesday = new Date(Date.UTC(2026, 8, 1));

  it('starts at today, so the morning run looks at the day in front of it', () => {
    const { from } = reminderWindow(monday);
    assert.equal(
      from.getTime(),
      monday.getTime(),
      'the window must include today, or a slot booked late yesterday is queued by nobody',
    );
  });

  it('reaches tomorrow and no further', () => {
    const { to } = reminderWindow(monday);
    assert.equal(to.getTime(), tuesday.getTime());
  });

  /**
   * The regression, stated as the thing that was actually broken: consecutive
   * runs either side of midnight have to overlap on the day between them.
   */
  it('overlaps across the rollover, so no day is covered by only one calendar day of runs', () => {
    const monEvening = reminderWindow(monday);
    const tueMorning = reminderWindow(tuesday);

    const covers = (window: { from: Date; to: Date }, day: Date) =>
      window.from.getTime() <= day.getTime() && day.getTime() <= window.to.getTime();

    assert.ok(covers(monEvening, tuesday), "Monday's run must cover Tuesday");
    assert.ok(
      covers(tueMorning, tuesday),
      "Tuesday's morning run must still cover Tuesday — that is the whole point of the second trigger",
    );
  });
});

/**
 * The ceiling that four lists could not see between them.
 *
 * Each courtesy list has always declined to be the second message *of its own
 * kind*; none of them could see the other three. These are about the rule that
 * finally counts them together, and about the order it is reported in — a skip
 * for "we have written twice this week" must never be mistaken for a refusal,
 * because one comes back next week and the other does not.
 */
describe('the contact ceiling — how much one patient hears in a week', () => {
  const reachable = { contactConsent: null, phone: '069 000 000', email: 'a@b.al' };

  it('queues somebody who has heard nothing', () => {
    assert.deepEqual(shouldQueueCourtesy({ ...reachable, recentContacts: 0 }), { queue: true });
  });

  it('still queues at one below the ceiling', () => {
    const decision = shouldQueueCourtesy({
      ...reachable,
      recentContacts: MAX_COURTESY_CONTACTS - 1,
    });
    assert.deepEqual(decision, { queue: true });
  });

  it('refuses at the ceiling and above it', () => {
    for (const count of [MAX_COURTESY_CONTACTS, MAX_COURTESY_CONTACTS + 5]) {
      assert.deepEqual(shouldQueueCourtesy({ ...reachable, recentContacts: count }), {
        queue: false,
        reason: 'recently-contacted',
      });
    }
  });

  it('treats an absent count as nought, so a caller that cannot count still queues', () => {
    assert.deepEqual(shouldQueueCourtesy(reachable), { queue: true });
  });

  it('reports a refusal ahead of a ceiling, because only one of them comes back', () => {
    const decision = shouldQueueCourtesy({
      ...reachable,
      contactConsent: false,
      recentContacts: 99,
    });
    assert.deepEqual(decision, { queue: false, reason: 'opted-out' });
  });

  it('reports missing details ahead of a ceiling', () => {
    const decision = shouldQueueCourtesy({
      contactConsent: null,
      phone: '',
      email: '',
      recentContacts: 99,
    });
    assert.deepEqual(decision, { queue: false, reason: 'no-contact-details' });
  });
});

/**
 * An address the provider has told us does not work.
 *
 * The whole point is that a bounce makes an address *absent* rather than
 * forbidden: a patient with a telephone is queued exactly as before, and only a
 * patient with nothing else falls out — as a skip somebody can act on rather
 * than as a message nobody would ever receive.
 */
describe('usableEmail — what a bounce does to an address', () => {
  it('passes an address nothing has been said about', () => {
    assert.equal(usableEmail('a@b.al', null), 'a@b.al');
    assert.equal(usableEmail('a@b.al', { bouncedAt: null, kind: null }), 'a@b.al');
  });

  it('retires an address that hard-bounced, was blocked, or drew a complaint', () => {
    for (const kind of ['HARD', 'BLOCKED', 'SPAM']) {
      assert.equal(usableEmail('a@b.al', { bouncedAt: new Date(), kind }), '');
    }
  });

  it('keeps one that merely bounced softly — a full mailbox empties again', () => {
    assert.equal(usableEmail('a@b.al', { bouncedAt: new Date(), kind: 'SOFT' }), 'a@b.al');
  });

  it('is still empty for a patient who never gave one', () => {
    assert.equal(usableEmail(null, null), '');
    assert.equal(usableEmail('   ', null), '');
  });

  it('leaves the rest of the rules to decide what that means', () => {
    // A bounced address and a telephone is still somebody worth queueing.
    const decision = shouldQueueCourtesy({
      contactConsent: null,
      phone: '069 000 000',
      email: usableEmail('a@b.al', { bouncedAt: new Date(), kind: 'HARD' }),
    });
    assert.deepEqual(decision, { queue: true });
  });
});

/**
 * A send the provider refused, and how long it stays out of the way.
 *
 * The distinction being protected here is the one the queue screen is built on:
 * a row nobody has tried and a row tried three times must not look alike.
 */
describe('retryAfter — a refused send steps aside', () => {
  const now = new Date('2026-09-01T09:12:00.000Z');

  it('waits longest for a used-up daily allowance and least for a blip', () => {
    assert.ok(RETRY_MINUTES.limit > RETRY_MINUTES.auth);
    assert.ok(RETRY_MINUTES.auth > RETRY_MINUTES.unreachable);
  });

  it('always moves forward, never back', () => {
    for (const failure of ['auth', 'rejected', 'limit', 'unreachable'] as const) {
      assert.ok(retryAfter(failure, now).getTime() > now.getTime(), failure);
    }
  });

  it('is exactly the table, so the wait can be read off it', () => {
    assert.equal(
      retryAfter('unreachable', now).toISOString(),
      new Date('2026-09-01T09:17:00.000Z').toISOString(),
    );
  });

  it('holds a row only while the wait is running and only if it was tried', () => {
    const later = retryAfter('limit', now);

    assert.equal(isHeld({ attempts: 1, sendAfter: later }, now), true);
    // Nobody has tried it: it is waiting to be worked, not waiting to come back.
    assert.equal(isHeld({ attempts: 0, sendAfter: later }, now), false);
    // The wait is up. Back on the main list, where the count still shows.
    assert.equal(isHeld({ attempts: 3, sendAfter: now }, later), false);
  });
});
