import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  alertHref,
  alertLabel,
  alertQuietened,
  alertVisible,
  dismissalHolds,
  isLow,
  ORDER_GRACE_DAYS,
  orderLateBy,
  orderOverdue,
  severityOf,
  sortStockAlerts,
  stockAlertCounts,
  type StockAlert,
} from '../src/lib/stock-alerts';

/** The day every case below is judged on. */
const NOW = new Date('2026-08-20T00:00:00.000Z');

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

/** A row with only the fields the case under test cares about. */
function alert(over: Partial<StockAlert> = {}): StockAlert {
  return {
    id: 'a',
    name: 'Dorashka nitrili',
    variantName: '',
    usable: 2,
    quantity: 2,
    minLimit: 10,
    severity: 'low',
    supplierName: 'DentalMed Shpk',
    orderQty: null,
    orderLateDays: 0,
    expectedAt: null,
    dismissedAt: null,
    dismissedByName: '',
    ...over,
  };
}

describe('isLow — the same comparison the shelf already makes', () => {
  it('calls the minimum itself low, not merely below it', () => {
    // The stock page badges `usable <= minLimit`. Two screens disagreeing by one
    // box is how people stop believing either of them.
    assert.equal(isLow({ usable: 10, minLimit: 10 }), true);
  });

  it('leaves a shelf one box above the minimum alone', () => {
    assert.equal(isLow({ usable: 11, minLimit: 10 }), false);
  });

  it('treats an empty shelf as low whatever the minimum', () => {
    assert.equal(isLow({ usable: 0, minLimit: 0 }), true);
  });
});

describe('severityOf — empty is not merely low', () => {
  it('calls nothing left "out"', () => {
    assert.equal(severityOf({ usable: 0, minLimit: 10 }), 'out');
  });

  it('calls one box left "low", not "out"', () => {
    assert.equal(severityOf({ usable: 1, minLimit: 10 }), 'low');
  });
});

describe('dismissalHolds — an answer expires when the shelf gets worse', () => {
  it('stands while the shelf is unchanged', () => {
    assert.equal(dismissalHolds(3, { atQuantity: 3 }), true);
  });

  it('stands when the shelf has improved without clearing the minimum', () => {
    assert.equal(dismissalHolds(5, { atQuantity: 3 }), true);
  });

  it('expires the moment the shelf drops below what was waved away', () => {
    // "We can live with three" is not an answer to "there is one left".
    assert.equal(dismissalHolds(1, { atQuantity: 3 }), false);
  });

  it('is not an answer at all when nobody has given one', () => {
    assert.equal(dismissalHolds(1, null), false);
  });
});

describe('orderOverdue — the promise nothing used to check', () => {
  it('says nothing about a material that was never ordered', () => {
    assert.equal(orderOverdue({ orderedAt: null, expectedAt: null }, NOW), false);
    assert.equal(orderLateBy({ orderedAt: null, expectedAt: daysBefore(90) }, NOW), 0);
  });

  it('leaves an order alone until the promised day has passed', () => {
    const ordered = daysBefore(5);
    // Promised tomorrow: not late.
    assert.equal(
      orderOverdue({ orderedAt: ordered, expectedAt: new Date('2026-08-21T00:00:00.000Z') }, NOW),
      false,
    );
    // Promised today: still not late. Due today is not overdue — the same rule
    // `workStatus` applies to a lab case, so the two boards agree.
    assert.equal(
      orderOverdue({ orderedAt: ordered, expectedAt: new Date('2026-08-20T00:00:00.000Z') }, NOW),
      false,
    );
    // Promised yesterday: late, by one day.
    assert.equal(
      orderLateBy({ orderedAt: ordered, expectedAt: new Date('2026-08-19T00:00:00.000Z') }, NOW),
      1,
    );
  });

  it('counts whole days past the promise', () => {
    assert.equal(orderLateBy({ orderedAt: daysBefore(30), expectedAt: daysBefore(12) }, NOW), 12);
  });

  it('gives an order with no promised date the grace period, and no longer', () => {
    // Inventing a date would make every undated order look late the day it was
    // placed. Never expiring would let the one nobody is tracking hide forever.
    assert.equal(
      orderOverdue({ orderedAt: daysBefore(ORDER_GRACE_DAYS), expectedAt: null }, NOW),
      false,
    );
    assert.equal(
      orderLateBy({ orderedAt: daysBefore(ORDER_GRACE_DAYS + 1), expectedAt: null }, NOW),
      1,
    );
    assert.equal(
      orderLateBy({ orderedAt: daysBefore(ORDER_GRACE_DAYS + 9), expectedAt: null }, NOW),
      9,
    );
  });

  it('ignores the time of day on either side', () => {
    // `orderedAt` is a keystroke and carries an hour; `expectedAt` is stored at
    // UTC midnight. Comparing them raw would make an order placed at 09:00 late
    // a few hours before one placed at 17:00 on the same day.
    assert.equal(
      orderLateBy(
        {
          orderedAt: new Date('2026-08-19T17:45:00.000Z'),
          expectedAt: new Date('2026-08-19T00:00:00.000Z'),
        },
        new Date('2026-08-20T08:30:00.000Z'),
      ),
      1,
    );
  });
});

describe('alertVisible — the different silences', () => {
  const shelf = { usable: 2, minLimit: 10, orderedAt: null, expectedAt: null };

  it('shows a low material nobody has answered for', () => {
    assert.equal(alertVisible(shelf, null, NOW), true);
  });

  it('stays quiet about a material that is not low', () => {
    assert.equal(alertVisible({ ...shelf, usable: 40 }, null, NOW), false);
  });

  it('stays quiet about one already on its way', () => {
    // Ordering is the completion. Asking again until the box physically arrives
    // is what teaches everyone to skim past the board.
    assert.equal(
      alertVisible(
        { ...shelf, usable: 0, orderedAt: daysBefore(2), expectedAt: daysBefore(-5) },
        null,
        NOW,
      ),
      false,
    );
  });

  it('speaks up again once the promised delivery has passed', () => {
    // The bug this replaces, and the worst of the silences: `orderedAt` alone
    // shut the row up, so a supplier who never delivered left the material off
    // the board, out of the count, and reading as dealt with — until somebody
    // reached for an empty shelf.
    assert.equal(
      alertVisible(
        { ...shelf, usable: 0, orderedAt: daysBefore(20), expectedAt: daysBefore(9) },
        null,
        NOW,
      ),
      true,
    );
  });

  it('speaks up about an undated order once the grace period is spent', () => {
    assert.equal(
      alertVisible(
        { ...shelf, orderedAt: daysBefore(ORDER_GRACE_DAYS), expectedAt: null },
        null,
        NOW,
      ),
      false,
    );
    assert.equal(
      alertVisible(
        { ...shelf, orderedAt: daysBefore(ORDER_GRACE_DAYS + 1), expectedAt: null },
        null,
        NOW,
      ),
      true,
    );
  });

  it('stays quiet about one waved away, while the shelf holds', () => {
    assert.equal(alertVisible({ ...shelf, usable: 3 }, { atQuantity: 3 }, NOW), false);
  });

  it('asks again once a waved-away shelf drops further', () => {
    assert.equal(alertVisible({ ...shelf, usable: 1 }, { atQuantity: 3 }, NOW), true);
  });

  it('lets ordering win over a dismissal that has expired', () => {
    // Both answers given, the dismissal spent: an order still outranks it,
    // because the box is genuinely coming.
    assert.equal(
      alertVisible(
        { ...shelf, usable: 1, orderedAt: daysBefore(2), expectedAt: daysBefore(-5) },
        { atQuantity: 3 },
        NOW,
      ),
      false,
    );
  });

  it('lets a standing dismissal win over an overdue order', () => {
    // "Not now" is somebody looking at this exact row today and deciding; the
    // order is older. The board must not talk over the more recent judgement.
    assert.equal(
      alertVisible(
        { ...shelf, usable: 3, orderedAt: daysBefore(20), expectedAt: daysBefore(9) },
        { atQuantity: 3 },
        NOW,
      ),
      false,
    );
  });
});

describe('alertQuietened — the undo list, and what may not be on it', () => {
  const shelf = { usable: 2, minLimit: 10, orderedAt: null, expectedAt: null };

  it('lists a low material somebody waved away', () => {
    assert.equal(alertQuietened({ ...shelf, usable: 3 }, { atQuantity: 3 }, NOW), true);
  });

  it('is the exact complement of alertVisible on a shelf that has something to say', () => {
    // The two halves must partition the low shelves and never overlap: a
    // material listed as both asked-about and quietened would be the board
    // arguing with itself, and one listed as neither would vanish.
    const cases = [
      [{ ...shelf, usable: 3 }, { atQuantity: 3 }],
      [{ ...shelf, usable: 1 }, { atQuantity: 3 }],
      [shelf, null],
      [{ ...shelf, usable: 0 }, null],
      [{ ...shelf, orderedAt: daysBefore(20), expectedAt: daysBefore(9) }, { atQuantity: 3 }],
      [{ ...shelf, orderedAt: daysBefore(ORDER_GRACE_DAYS + 1) }, null],
    ] as const;

    for (const [item, dismissal] of cases) {
      assert.notEqual(
        alertVisible(item, dismissal, NOW),
        alertQuietened(item, dismissal, NOW),
        `exactly one half must claim ${JSON.stringify(item)}`,
      );
    }
  });

  it('leaves out a material that is not low at all', () => {
    // A stale dismissal on a restocked shelf is not a suppressed warning, it is
    // a row `getStockAlerts` is about to delete. Listing it would offer an undo
    // for a decision that has already lapsed.
    assert.equal(alertQuietened({ ...shelf, usable: 40 }, { atQuantity: 3 }, NOW), false);
  });

  it('leaves out one that is quiet because it is on order, not because of a dismissal', () => {
    // Silenced by the order, which has its own way back (`clearOrdered`). The
    // undo list is for dismissals; putting an on-order material on it would
    // offer the wrong undo for the right complaint.
    assert.equal(
      alertQuietened(
        { ...shelf, usable: 0, orderedAt: daysBefore(2), expectedAt: daysBefore(-5) },
        null,
        NOW,
      ),
      false,
    );
  });

  it('leaves out a dismissal the shelf has already outrun', () => {
    // Below what was waved away, so the board is asking again — it is on the
    // active half, and appearing on both would be the same row twice.
    assert.equal(alertQuietened({ ...shelf, usable: 1 }, { atQuantity: 3 }, NOW), false);
  });

  it('has nothing to list when nobody has waved anything away', () => {
    assert.equal(alertQuietened(shelf, null, NOW), false);
  });
});

describe('sortStockAlerts — worst morning first', () => {
  it('puts everything empty above everything merely low', () => {
    const rows = sortStockAlerts([
      alert({ id: 'low', usable: 1, severity: 'low' }),
      alert({ id: 'out', usable: 0, severity: 'out' }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ['out', 'low'],
    );
  });

  it('measures shortage against the minimum rather than in bare boxes', () => {
    // Two of twenty is a worse morning than two of three, even though the shelf
    // holds the same number of boxes.
    const rows = sortStockAlerts([
      alert({ id: 'plenty', usable: 2, minLimit: 3 }),
      alert({ id: 'dire', usable: 2, minLimit: 20 }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ['dire', 'plenty'],
    );
  });

  it('falls back to the name so the order is stable', () => {
    const rows = sortStockAlerts([
      alert({ id: 'b', name: 'Maska' }),
      alert({ id: 'a', name: 'Freza' }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ['a', 'b'],
    );
  });

  it('does not reorder the caller’s array', () => {
    const input = [alert({ id: 'low', severity: 'low' }), alert({ id: 'out', severity: 'out' })];
    sortStockAlerts(input);
    assert.equal(input[0].id, 'low');
  });

  it('sorts a material with no minimum set on its bare count', () => {
    const rows = sortStockAlerts([
      alert({ id: 'two', usable: 2, minLimit: 0, severity: 'low' }),
      alert({ id: 'one', usable: 1, minLimit: 0, severity: 'low' }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ['one', 'two'],
    );
  });
});

describe('stockAlertCounts — what the badge and the glance strip read', () => {
  it('splits the pile into empty and merely low', () => {
    const counts = stockAlertCounts([
      { severity: 'out', orderLateDays: 0 },
      { severity: 'low', orderLateDays: 0 },
      { severity: 'low', orderLateDays: 0 },
    ]);
    assert.deepEqual(counts, { total: 3, out: 1, low: 2, orderLate: 0 });
  });

  it('counts late deliveries across the two severities, not beside them', () => {
    // A material is usually empty *because* the order is late, so these overlap
    // by design — adding them to the total would count the same row twice.
    const counts = stockAlertCounts([
      { severity: 'out', orderLateDays: 9 },
      { severity: 'low', orderLateDays: 2 },
      { severity: 'low', orderLateDays: 0 },
    ]);
    assert.deepEqual(counts, { total: 3, out: 1, low: 2, orderLate: 2 });
  });

  it('reads an empty board as nought rather than as a gap', () => {
    assert.deepEqual(stockAlertCounts([]), { total: 0, out: 0, low: 0, orderLate: 0 });
  });
});

describe('alertLabel — which of the eight boxes this is', () => {
  it('names the variant beside the product', () => {
    assert.equal(
      alertLabel({ name: 'Dorashka nitrili', variantName: 'Masa M' }),
      'Dorashka nitrili · Masa M',
    );
  });

  it('leaves a material with no siblings as its plain name', () => {
    assert.equal(alertLabel({ name: 'Freza diamanti', variantName: '' }), 'Freza diamanti');
  });
});

describe('alertHref — where pressing the row goes', () => {
  it('opens the storage room filtered to the one material', () => {
    assert.equal(alertHref({ name: 'Freza diamanti' }), '/stock?q=Freza%20diamanti');
  });

  it('escapes a name that would otherwise break the query', () => {
    assert.equal(alertHref({ name: 'Kompozit A2 & A3' }), '/stock?q=Kompozit%20A2%20%26%20A3');
  });
});
