import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  digestMail,
  digestSummary,
  digestTotal,
  EMPTY_DIGEST,
  urgentTotal,
  type DigestCounts,
} from '../src/lib/digest';

const counts = (over: Partial<DigestCounts> = {}): DigestCounts => ({ ...EMPTY_DIGEST, ...over });

describe('digestTotal — one number for the morning', () => {
  it('counts every pile once', () => {
    assert.equal(
      digestTotal(
        counts({
          followUpsOverdue: 2,
          followUpsToday: 1,
          stockOut: 1,
          stockLow: 5,
          worksToChase: 3,
          requestsWaiting: 5,
          unreadMail: 2,
          unremindedTomorrow: 4,
          appointmentsUnclosed: 5,
        }),
      ),
      28,
    );
  });

  it('leaves late deliveries out, because those rows are already counted', () => {
    // A material empty *because* the order never came is one problem. Adding
    // `ordersLate` would make the digest's headline disagree with the bell's
    // badge for the same morning, which is the one thing it cannot afford.
    const shelf = counts({ stockOut: 1, stockLow: 2, ordersLate: 3 });
    assert.equal(digestTotal(shelf), 3);
  });

  it('reads a clear morning as nought', () => {
    assert.equal(digestTotal(EMPTY_DIGEST), 0);
  });
});

describe('urgentTotal — what will not wait until tomorrow', () => {
  it('never counts an empty shelf and its late order as two problems', () => {
    // The overlap is unknowable from counts alone, so the floor is the honest
    // answer: at least three shelves are in trouble here, not eight.
    const shelf = counts({ stockOut: 3, ordersLate: 5 });
    assert.equal(urgentTotal(shelf), 5);
    assert.ok(urgentTotal(shelf) <= shelf.stockOut + shelf.ordersLate);
  });

  it('includes tomorrow’s unreminded patients, whose deadline passes tonight', () => {
    assert.equal(urgentTotal(counts({ unremindedTomorrow: 4 })), 4);
  });

  it('leaves out what is merely this week’s work', () => {
    assert.equal(
      urgentTotal(counts({ followUpsToday: 3, stockLow: 9, worksToChase: 2, unreadMail: 4 })),
      0,
    );
  });
});

describe('digestSummary — the line recorded against the run', () => {
  it('says so in three words when nothing is waiting', () => {
    assert.equal(digestSummary(EMPTY_DIGEST), 'Nothing waiting.');
  });

  it('names only the piles that have something in them', () => {
    const line = digestSummary(counts({ followUpsOverdue: 2, requestsWaiting: 5 }));

    assert.equal(line, '7 waiting — 2 follow-ups late, 5 booking requests');
    assert.ok(!line.includes('running low'), 'an empty pile is not worth a word');
  });

  it('says one shelf, not one shelves', () => {
    // A log line that reads "1 shelves empty" is the kind of small wrongness
    // that makes a reader distrust the number beside it.
    assert.equal(
      digestSummary(counts({ stockOut: 1, ordersLate: 1, requestsWaiting: 1 })),
      '2 waiting — 1 shelf empty, 1 delivery late, 1 booking request',
    );
  });

  it('leads with the same total the digest itself reports', () => {
    const shelf = counts({ stockOut: 1, stockLow: 4, ordersLate: 2 });
    assert.ok(digestSummary(shelf).startsWith(`${digestTotal(shelf)} waiting`));
  });
});

/**
 * The email the practice gets on the morning nobody comes in.
 *
 * The interesting cases are the two silences: a clear morning must produce
 * nothing at all, because a digest that arrives every day whatever happened is
 * filed unread by the second week and takes the one that mattered with it.
 */
describe('digestMail — the morning the practice is told', () => {
  it('says nothing on a clear morning', () => {
    assert.equal(digestMail(EMPTY_DIGEST, 'https://klinika.al/'), null);
  });

  it('puts the number in the subject, where it is read on a lock screen', () => {
    const mail = digestMail(counts({ requestsWaiting: 2, stockLow: 1 }), null);
    assert.equal(mail?.subject, '3 waiting at the practice');
  });

  it('carries the same sentence the run recorded, so the two agree', () => {
    const morning = counts({ followUpsOverdue: 1, unreadMail: 2 });
    assert.ok(digestMail(morning, null)?.text.startsWith(digestSummary(morning)));
  });

  it('says how much of it will not keep, and says so either way', () => {
    const urgent = digestMail(counts({ followUpsOverdue: 2 }), null);
    assert.match(urgent!.text, /2 of them will not keep/);

    // Nothing urgent is worth a sentence of its own: a reader who is told only
    // about urgency cannot tell "none today" from "this email is broken".
    const calm = digestMail(counts({ unreadMail: 3 }), null);
    assert.match(calm!.text, /None of it is urgent/);
  });

  it('includes the way in when the deployment knows its own address', () => {
    assert.match(digestMail(counts({ unreadMail: 1 }), 'https://klinika.al/')!.text, /klinika\.al/);
    // And is a perfectly good email without it — `NEXT_PUBLIC_APP_URL` is the
    // one setting a hurried deployment leaves out.
    assert.ok(!digestMail(counts({ unreadMail: 1 }), null)!.text.includes('http'));
  });

  it('never mentions a patient, because this leaves the building', () => {
    // Counts only. The board itself names people; the email that announces it
    // is read on a telephone on a bus, and `request-alert.ts` made the same
    // call about how much of a stranger's request may travel.
    const mail = digestMail(counts({ unremindedTomorrow: 4, worksToChase: 1 }), null);
    assert.ok(!/@/.test(mail!.text));
  });
});
