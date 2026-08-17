import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateOldestFirst } from '../src/lib/batch-allocation';
import { byExpiry, expiryLevel, summariseBatches, usableQuantity } from '../src/lib/expiry';
import { isPrice, moneyFormat, moneyToInput, parseMoney } from '../src/lib/money';
import { bySupplier, orderAmount, reorderAsText, type ReorderLine } from '../src/lib/reorder';
import { parseMaterialList } from '../src/lib/material-history';
import { asHours, overallUtilisation } from '../src/lib/utilisation';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = utc('2026-08-12');

describe('expiryLevel', () => {
  it('treats a blank date as fine rather than as a warning', () => {
    // Not everything in a cupboard carries an expiry, and treating a blank
    // field as a warning would make the whole signal noise.
    assert.equal(expiryLevel(null, NOW), 'OK');
  });

  it('calls yesterday expired and today still usable', () => {
    assert.equal(expiryLevel(utc('2026-08-11'), NOW), 'EXPIRED');
    assert.equal(expiryLevel(utc('2026-08-12'), NOW), 'SOON');
  });

  it('warns inside the 90-day window and not outside it', () => {
    assert.equal(expiryLevel(utc('2026-11-10'), NOW), 'SOON');
    assert.equal(expiryLevel(utc('2026-11-11'), NOW), 'OK');
  });
});

describe('summariseBatches — the worst news across an item', () => {
  it('reports OK for an item with no lots', () => {
    assert.deepEqual(summariseBatches([], NOW), {
      expiredUnits: 0,
      soonUnits: 0,
      nextExpiry: null,
      level: 'OK',
    });
  });

  it('lets one expired lot outrank several healthy ones', () => {
    const summary = summariseBatches(
      [
        { expiryDate: utc('2026-08-01'), quantity: 2 },
        { expiryDate: utc('2027-01-01'), quantity: 40 },
      ],
      NOW,
    );
    assert.equal(summary.level, 'EXPIRED');
    assert.equal(summary.expiredUnits, 2);
  });

  it('never offers an expired date as the next deadline', () => {
    // An expired lot is a fact, not a deadline; putting it here would bury the
    // one still worth acting on.
    const summary = summariseBatches(
      [
        { expiryDate: utc('2026-08-01'), quantity: 1 },
        { expiryDate: utc('2026-09-01'), quantity: 5 },
      ],
      NOW,
    );
    assert.equal(summary.nextExpiry?.toISOString().slice(0, 10), '2026-09-01');
  });

  it('sums units per level rather than counting lots', () => {
    const summary = summariseBatches(
      [
        { expiryDate: utc('2026-09-01'), quantity: 5 },
        { expiryDate: utc('2026-10-01'), quantity: 7 },
      ],
      NOW,
    );
    assert.equal(summary.soonUnits, 12);
    assert.equal(summary.level, 'SOON');
  });
});

describe('byExpiry — oldest first', () => {
  it('sorts the soonest date to the front and undated lots to the back', () => {
    const sorted = byExpiry([
      { expiryDate: null, quantity: 1 },
      { expiryDate: utc('2027-01-01'), quantity: 1 },
      { expiryDate: utc('2026-09-01'), quantity: 1 },
    ]);
    assert.deepEqual(
      sorted.map((b) => b.expiryDate?.toISOString().slice(0, 10) ?? 'none'),
      ['2026-09-01', '2027-01-01', 'none'],
    );
  });
});

const line = (over: Partial<ReorderLine> = {}): ReorderLine => ({
  id: 'x',
  name: 'Doreza',
  quantity: 2,
  minLimit: 5,
  monthlyUse: 3,
  daysLeft: 10,
  suggested: 6,
  stated: false,
  urgent: true,
  orderedAt: null,
  expectedAt: null,
  supplierName: '',
  supplierId: '',
  supplierPhone: '',
  supplierEmail: '',
  ...over,
});

/** The word the app would supply — the shelf speaks Albanian in these tests. */
const boxes = (count: number) => (count === 1 ? 'kuti' : 'kuti');

describe('orderAmount — what to say out loud to the supplier', () => {
  it('asks for boxes, which is how the order is placed', () => {
    assert.equal(orderAmount({ suggested: 5 }, boxes), '5 kuti');
  });

  it('takes the word from the caller, so the order goes out in one language', () => {
    assert.equal(orderAmount({ suggested: 1 }, (count) => (count === 1 ? 'box' : 'boxes')), '1 box');
  });
});

describe('reorderAsText — the message pasted to a supplier', () => {
  it('leaves out what is already on its way', () => {
    const text = reorderAsText(
      [line({ name: 'Doreza' }), line({ name: 'Maska', orderedAt: '2026-08-01' })],
      'Porosi',
      boxes,
    );
    assert.ok(text.includes('Doreza'));
    assert.ok(!text.includes('Maska'), 'what is already coming is not on the order form');
  });

  it('leaves out lines with nothing to order', () => {
    const text = reorderAsText([line({ name: 'Doreza', suggested: 0 })], 'Porosi', boxes);
    assert.equal(text.trim(), 'Porosi');
  });
});

const batch = (id: string, expiry: string | null, quantity: number, used = 0) => ({
  id,
  expiryDate: expiry ? utc(expiry) : null,
  quantity,
  usedQuantity: used,
});

describe('usableQuantity — an expired box is not stock', () => {
  it('leaves an item with no lots alone', () => {
    assert.equal(usableQuantity(12, [], NOW), 12);
  });

  it('leaves an item whose lots are all good alone', () => {
    assert.equal(usableQuantity(12, [{ expiryDate: utc('2027-01-01'), quantity: 12 }], NOW), 12);
  });

  it('subtracts what has expired', () => {
    const batches = [
      { expiryDate: utc('2026-08-01'), quantity: 5 },
      { expiryDate: utc('2027-01-01'), quantity: 7 },
    ];
    assert.equal(usableQuantity(12, batches, NOW), 7);
  });

  it('never goes below zero when the lots claim more than the shelf holds', () => {
    assert.equal(usableQuantity(3, [{ expiryDate: utc('2026-08-01'), quantity: 9 }], NOW), 0);
  });
});

describe('allocateOldestFirst — which lot it comes out of', () => {
  it('takes the soonest to expire first', () => {
    const result = allocateOldestFirst(
      [batch('new', '2027-01-01', 10), batch('old', '2026-09-01', 10)],
      4,
      NOW,
    );
    assert.deepEqual(result, [{ batchId: 'old', quantity: 4 }]);
  });

  it('spans lots when one is not enough', () => {
    const result = allocateOldestFirst(
      [batch('old', '2026-09-01', 3), batch('new', '2027-01-01', 10)],
      5,
      NOW,
    );
    assert.deepEqual(result, [
      { batchId: 'old', quantity: 3 },
      { batchId: 'new', quantity: 2 },
    ]);
  });

  it('skips an expired lot rather than recording it as used', () => {
    // It should not have been used, and saying it was would put a wrong lot
    // number on a patient's record.
    const result = allocateOldestFirst(
      [batch('gone', '2026-08-01', 10), batch('good', '2027-01-01', 10)],
      4,
      NOW,
    );
    assert.deepEqual(result, [{ batchId: 'good', quantity: 4 }]);
  });

  it('skips a lot already fully drawn down', () => {
    const result = allocateOldestFirst(
      [batch('spent', '2026-09-01', 5, 5), batch('good', '2027-01-01', 10)],
      2,
      NOW,
    );
    assert.deepEqual(result, [{ batchId: 'good', quantity: 2 }]);
  });

  it('counts only what is left in a partly used lot', () => {
    const result = allocateOldestFirst(
      [batch('part', '2026-09-01', 5, 3), batch('good', '2027-01-01', 10)],
      4,
      NOW,
    );
    assert.deepEqual(result, [
      { batchId: 'part', quantity: 2 },
      { batchId: 'good', quantity: 2 },
    ]);
  });

  it('sorts an undated lot last — one that will turn is more urgent', () => {
    const result = allocateOldestFirst(
      [batch('undated', null, 10), batch('dated', '2027-01-01', 3)],
      5,
      NOW,
    );
    assert.deepEqual(result, [
      { batchId: 'dated', quantity: 3 },
      { batchId: 'undated', quantity: 2 },
    ]);
  });

  it('allocates what it can and leaves the rest to the caller', () => {
    // The shelf is the authority; lots are a trace over it.
    const result = allocateOldestFirst([batch('only', '2027-01-01', 2)], 5, NOW);
    assert.deepEqual(result, [{ batchId: 'only', quantity: 2 }]);
  });

  it('allocates nothing for an item with no lots', () => {
    assert.deepEqual(allocateOldestFirst([], 5, NOW), []);
  });

  it('allocates nothing when nothing is wanted', () => {
    assert.deepEqual(allocateOldestFirst([batch('a', '2027-01-01', 5)], 0, NOW), []);
  });

  it('treats a lot expiring today as still usable', () => {
    const result = allocateOldestFirst([batch('today', '2026-08-12', 5)], 2, NOW);
    assert.deepEqual(result, [{ batchId: 'today', quantity: 2 }]);
  });
});

describe('parseMoney — reading a price off a form', () => {
  it('reads a plain price', () => {
    assert.equal(parseMoney('2214.28')?.toFixed(2), '2214.28');
    assert.equal(parseMoney('198')?.toFixed(2), '198.00');
  });

  it('accepts the comma every keyboard in the practice types', () => {
    assert.equal(parseMoney('2214,28')?.toFixed(2), '2214.28');
  });

  it('ignores the spaces people put in thousands', () => {
    assert.equal(parseMoney('25 000')?.toFixed(2), '25000.00');
  });

  it('treats a blank field as no price rather than as free', () => {
    assert.equal(parseMoney(null), null);
    assert.equal(parseMoney(''), null);
  });

  it('refuses what is not a price, so the caller can say so', () => {
    // Silently storing nothing would leave the material looking unpriced and
    // the valuation quietly short.
    assert.equal(parseMoney('about 200'), null);
    assert.equal(parseMoney('-5'), null);
    assert.equal(parseMoney('1.234'), null);
    assert.equal(isPrice('1.234'), false);
    assert.equal(isPrice(''), true);
  });

  it('round-trips through the form field', () => {
    assert.equal(moneyToInput(parseMoney('700')), '700.00');
    assert.equal(moneyToInput(null), '');
  });
});


describe('moneyFormat — writing a price down', () => {
  // Intl separates a currency *code* from the number with a non-breaking space.
  const write = (currency: string, value: number) =>
    new Intl.NumberFormat('en', moneyFormat(currency, value)).format(value).replace(/ /g, ' ');

  it('shows the decimals a no-minor-unit currency would otherwise round away', () => {
    // CLDR gives lek zero fraction digits, so the default turns a price copied
    // off an invoice into a different number, silently.
    assert.equal(write('ALL', 2214.28), 'ALL 2,214.28');
  });

  it('gives a fraction both its digits rather than one', () => {
    // "2,300.5" reads as a price with a digit missing.
    assert.equal(write('ALL', 2300.5), 'ALL 2,300.50');
  });

  it('leaves a round price round', () => {
    assert.equal(write('ALL', 25000), 'ALL 25,000');
  });

  it('leaves a currency that always wants two decimals alone', () => {
    assert.equal(write('EUR', 5), '€5.00');
    assert.equal(write('EUR', 5.5), '€5.50');
  });
});

describe('bySupplier — the list cut the way an order is placed', () => {
  it('gathers each company’s materials into one order', () => {
    const groups = bySupplier([
      line({ id: 'a', supplierId: 's1', supplierName: 'Dental Co' }),
      line({ id: 'b', supplierId: 's2', supplierName: 'Medix' }),
      line({ id: 'c', supplierId: 's1', supplierName: 'Dental Co' }),
    ]);

    assert.deepEqual(
      groups.map((group) => [group.supplierName, group.lines.length]),
      [['Dental Co', 2], ['Medix', 1]],
    );
  });

  it('sinks the materials nobody has said where to buy to the bottom', () => {
    // The group cannot be sent anywhere, so it is a list of things to file
    // rather than an order to place.
    const groups = bySupplier([
      line({ id: 'a', supplierId: '', supplierName: '' }),
      line({ id: 'b', supplierId: 's1', supplierName: 'Dental Co' }),
    ]);
    assert.deepEqual(groups.map((group) => group.supplierId), ['s1', '']);
  });

  it('leaves what is already coming out of what is being asked for', () => {
    const groups = bySupplier([
      line({ id: 'a', supplierId: 's1', orderedAt: '2026-08-01T00:00:00.000Z' }),
      line({ id: 'b', supplierId: 's1' }),
      // Nothing to order is nothing to mark as ordered either.
      line({ id: 'c', supplierId: 's1', suggested: 0 }),
    ]);
    assert.deepEqual(groups[0]?.pendingIds, ['b']);
  });
});

describe('parseMaterialList — what the visit form says came off the shelf', () => {
  it('reads the itemId:quantity pairs', () => {
    assert.deepEqual(parseMaterialList('a:2,b:1'), [
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 1 },
    ]);
  });

  it('drops anything without a real quantity', () => {
    // A blank, a zero and a word are all "nothing was spent", not a deduction.
    assert.deepEqual(parseMaterialList('a:0,b:,c:x,d:3'), [{ itemId: 'd', quantity: 3 }]);
  });

  it('reads an empty field as nothing at all', () => {
    assert.deepEqual(parseMaterialList(''), []);
  });
});

describe('utilisation arithmetic', () => {
  it('measures the window as a whole rather than averaging the months', () => {
    // A quiet month with few open hours must not weigh as much as a full one.
    const percent = overallUtilisation([
      { month: '2026-07', bookedMinutes: 100, openMinutes: 1000, percent: 10 },
      { month: '2026-08', bookedMinutes: 900, openMinutes: 1000, percent: 90 },
    ]);
    assert.equal(percent, 50);
  });

  it('reads a practice that was never open as nought, not as a division', () => {
    assert.equal(
      overallUtilisation([{ month: '2026-07', bookedMinutes: 0, openMinutes: 0, percent: 0 }]),
      0,
    );
  });

  it('writes minutes in the unit chair time is discussed in', () => {
    assert.equal(asHours(390), '6h 30m');
    assert.equal(asHours(360), '6h');
  });
});
