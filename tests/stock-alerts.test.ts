import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  alertHref,
  alertLabel,
  alertVisible,
  dismissalHolds,
  isLow,
  severityOf,
  sortStockAlerts,
  stockAlertCounts,
  type StockAlert,
} from '../src/lib/stock-alerts';

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

describe('alertVisible — the three different silences', () => {
  it('shows a low material nobody has answered for', () => {
    assert.equal(alertVisible({ usable: 2, minLimit: 10, orderedAt: null }, null), true);
  });

  it('stays quiet about a material that is not low', () => {
    assert.equal(alertVisible({ usable: 40, minLimit: 10, orderedAt: null }, null), false);
  });

  it('stays quiet about one already on its way', () => {
    // Ordering is the completion. Asking again until the box physically arrives
    // is what teaches everyone to skim past the board.
    assert.equal(
      alertVisible({ usable: 0, minLimit: 10, orderedAt: new Date('2026-08-20') }, null),
      false,
    );
  });

  it('stays quiet about one waved away, while the shelf holds', () => {
    assert.equal(alertVisible({ usable: 3, minLimit: 10, orderedAt: null }, { atQuantity: 3 }), false);
  });

  it('asks again once a waved-away shelf drops further', () => {
    assert.equal(alertVisible({ usable: 1, minLimit: 10, orderedAt: null }, { atQuantity: 3 }), true);
  });

  it('lets ordering win over a dismissal that has expired', () => {
    // Both answers given, the dismissal spent: an order still outranks it,
    // because the box is genuinely coming.
    assert.equal(
      alertVisible(
        { usable: 1, minLimit: 10, orderedAt: new Date('2026-08-20') },
        { atQuantity: 3 },
      ),
      false,
    );
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
      { severity: 'out' },
      { severity: 'low' },
      { severity: 'low' },
    ]);
    assert.deepEqual(counts, { total: 3, out: 1, low: 2 });
  });

  it('reads an empty board as nought rather than as a gap', () => {
    assert.deepEqual(stockAlertCounts([]), { total: 0, out: 0, low: 0 });
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
