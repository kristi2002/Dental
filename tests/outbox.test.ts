import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CANCEL_NOTES,
  dedupeKey,
  shouldQueueReminder,
  SKIP_NOTES,
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

describe('notes — every outcome can explain itself', () => {
  it('has a sentence for every skip reason', () => {
    const reasons = ['answered', 'already-contacted', 'opted-out', 'no-contact-details'] as const;
    for (const reason of reasons) {
      assert.ok(SKIP_NOTES[reason]?.length > 0, `no note for ${reason}`);
    }
  });

  it('has a sentence for every cancel reason', () => {
    const reasons = ['rescheduled', 'status-changed', 'answered', 'deleted'] as const;
    for (const reason of reasons) {
      assert.ok(CANCEL_NOTES[reason]?.length > 0, `no note for ${reason}`);
    }
  });

  it('says nothing a patient should not read, because these are internal', () => {
    for (const note of [...Object.values(SKIP_NOTES), ...Object.values(CANCEL_NOTES)]) {
      assert.doesNotMatch(note, /^[A-Z]/, `"${note}" reads like a sentence sent to somebody`);
    }
  });
});
