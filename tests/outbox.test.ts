import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { MAIL_FAILURE_NOTES, MAIL_SENT_NOTE } from '../src/lib/messages/email';
import {
  CANCEL_NOTES,
  dedupeKey,
  noteKey,
  SENT_NOTES,
  shouldQueueReminder,
  SKIP_NOTES,
  stillWorthSending,
  type ReminderCandidate,
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
