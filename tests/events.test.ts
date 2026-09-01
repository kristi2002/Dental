import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bounceKindFor,
  closesConsent,
  readDeliveryEvents,
  type DeliveryOutcome,
} from '../src/lib/messages/events';

/**
 * The webhook that tells us a message never arrived.
 *
 * Every case here is a real payload shape from one of the two providers, and
 * the reason they are worth this much attention is that the endpoint behind
 * them is knocked on by machines the practice does not control, on behalf of
 * anybody who can send an email. The route's authority is a secret; the
 * *content* is hostile by default, and this is where that is dealt with.
 */

describe('readDeliveryEvents — Brevo', () => {
  it('reads a hard bounce and lower-cases the address', () => {
    const events = readDeliveryEvents({
      event: 'hard_bounce',
      email: 'Ana.Hoxha@Example.AL',
      'message-id': '<abc@smtp-relay.brevo.com>',
      reason: 'unknown recipient',
    });

    assert.deepEqual(events, [
      {
        outcome: 'hard',
        address: 'ana.hoxha@example.al',
        messageId: '<abc@smtp-relay.brevo.com>',
      },
    ]);
  });

  it('separates the four ways an address can fail', () => {
    const outcomes = (
      ['hard_bounce', 'soft_bounce', 'blocked', 'spam', 'invalid_email', 'error'] as const
    ).map((event) => readDeliveryEvents({ event, email: 'a@b.al' })[0]?.outcome);

    assert.deepEqual(outcomes, ['hard', 'soft', 'blocked', 'spam', 'hard', 'blocked']);
  });

  it('reads an unsubscribe, which is the patient rather than the mailbox', () => {
    const [event] = readDeliveryEvents({ event: 'unsubscribed', email: 'a@b.al' });
    assert.equal(event?.outcome, 'unsubscribed');
  });

  it('ignores the events that are the message still being in flight', () => {
    for (const event of ['request', 'deferred']) {
      assert.deepEqual(readDeliveryEvents({ event, email: 'a@b.al' }), []);
    }
  });

  /**
   * Opens and clicks are surveillance of a patient reading their own post. The
   * practice has no business recording them, and a parser that quietly accepted
   * them would be the first step to a screen that displays them.
   */
  it('ignores opens and clicks outright', () => {
    for (const event of ['opened', 'click', 'proxy_open', 'unique_opened']) {
      assert.deepEqual(readDeliveryEvents({ event, email: 'a@b.al' }), []);
    }
  });
});

describe('readDeliveryEvents — Resend', () => {
  it('reads a permanent bounce out of the nested object', () => {
    const events = readDeliveryEvents({
      type: 'email.bounced',
      data: {
        email_id: '4ef9a417-02e9',
        to: ['ana@example.al'],
        bounce: { type: 'Permanent', subType: 'General' },
      },
    });

    assert.deepEqual(events, [
      { outcome: 'hard', address: 'ana@example.al', messageId: '4ef9a417-02e9' },
    ]);
  });

  /**
   * An undetermined bounce is read as soft on purpose. Guessing "permanent"
   * would retire a working address after one bad night at the far end, and the
   * cost of being wrong the other way is one message that bounces twice.
   */
  it('reads transient and undetermined bounces as soft', () => {
    for (const type of ['Transient', 'Undetermined', '']) {
      const [event] = readDeliveryEvents({
        type: 'email.bounced',
        data: { to: ['a@b.al'], bounce: { type } },
      });
      assert.equal(event?.outcome, 'soft', type);
    }
  });

  it('reads a suppressed bounce as blocked — that is about the address', () => {
    const [event] = readDeliveryEvents({
      type: 'email.bounced',
      data: { to: ['a@b.al'], bounce: { type: 'Permanent', subType: 'Suppressed' } },
    });
    assert.equal(event?.outcome, 'blocked');
  });

  it('reads a complaint', () => {
    const [event] = readDeliveryEvents({
      type: 'email.complained',
      data: { to: ['a@b.al'] },
    });
    assert.equal(event?.outcome, 'spam');
  });

  it('ignores the deliveries it has nothing to do with', () => {
    assert.deepEqual(readDeliveryEvents({ type: 'email.opened', data: { to: ['a@b.al'] } }), []);
    assert.deepEqual(readDeliveryEvents({ type: 'contact.created', data: {} }), []);
  });
});

describe('readDeliveryEvents — batches and rubbish', () => {
  it('reads every event in a batch, in order', () => {
    const events = readDeliveryEvents([
      { event: 'hard_bounce', email: 'one@b.al' },
      { event: 'delivered', email: 'two@b.al' },
      { event: 'spam', email: 'three@b.al' },
    ]);

    assert.deepEqual(
      events.map((event) => [event.outcome, event.address]),
      [
        ['hard', 'one@b.al'],
        ['delivered', 'two@b.al'],
        ['spam', 'three@b.al'],
      ],
    );
  });

  it('reads a batch wrapped in an envelope', () => {
    const events = readDeliveryEvents({ events: [{ event: 'blocked', email: 'a@b.al' }] });
    assert.equal(events.length, 1);
  });

  /**
   * A malformed entry must cost its own event and nothing else. A batch arriving
   * after an outage is exactly when losing the other nine would matter.
   */
  it('drops what it cannot read and keeps the rest', () => {
    const events = readDeliveryEvents([
      null,
      'not an object',
      { event: 'hard_bounce' },
      { event: 'hard_bounce', email: '   ' },
      { email: 'a@b.al' },
      { event: 'hard_bounce', email: 'good@b.al' },
    ]);

    assert.deepEqual(events.map((event) => event.address), ['good@b.al']);
  });

  it('answers nothing for anything that is not a payload at all', () => {
    for (const payload of [null, undefined, 42, 'hello', [], {}]) {
      assert.deepEqual(readDeliveryEvents(payload), []);
    }
  });
});

describe('what an outcome means', () => {
  it('maps the four failures onto the column, and nothing else', () => {
    assert.equal(bounceKindFor('hard'), 'HARD');
    assert.equal(bounceKindFor('soft'), 'SOFT');
    assert.equal(bounceKindFor('blocked'), 'BLOCKED');
    assert.equal(bounceKindFor('spam'), 'SPAM');
    assert.equal(bounceKindFor('delivered'), null);
    assert.equal(bounceKindFor('unsubscribed'), null);
  });

  /**
   * Only two events close consent, and a full mailbox is not one of them.
   * Treating a soft bounce as a refusal would opt out patients who never said
   * anything at all — which is the same class of error as reading `null`
   * consent as "no", and this app has been careful about that from the start.
   */
  it('closes consent only when the patient has actually said no', () => {
    const closing: DeliveryOutcome[] = ['unsubscribed', 'spam'];
    const keeping: DeliveryOutcome[] = ['delivered', 'hard', 'soft', 'blocked'];

    for (const outcome of closing) assert.equal(closesConsent(outcome), true, outcome);
    for (const outcome of keeping) assert.equal(closesConsent(outcome), false, outcome);
  });
});
