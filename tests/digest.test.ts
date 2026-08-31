import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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
