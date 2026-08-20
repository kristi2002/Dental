import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type BatchForPlanning, planConsumption } from '../src/lib/stock-consumption';

/**
 * Which lot a material came out of, and what the ledger says about it.
 *
 * These rows are the answer to "which batch of anaesthetic went into this
 * patient" — the question a recall notice asks and the reason lots are tracked
 * at all. A wrong allocation puts a lot number on a chart that never went near
 * the person, which is worse than no lot number, and nothing was testing it.
 *
 * Expiry dates here are deliberately far from any real clock: `allocateOldestFirst`
 * judges expiry against the actual day, and a fixture dated next month would
 * start failing next month.
 */

const FAR_FUTURE = new Date('2099-01-01T00:00:00.000Z');
const LATER_STILL = new Date('2099-06-01T00:00:00.000Z');
const LONG_EXPIRED = new Date('2000-01-01T00:00:00.000Z');

function batch(over: Partial<BatchForPlanning> & { id: string }): BatchForPlanning {
  return { expiryDate: FAR_FUTURE, quantity: 10, usedQuantity: 0, ...over };
}

describe('planConsumption — the ordinary path', () => {
  it('takes everything from one lot when one lot covers it', () => {
    const { allocations, lines } = planConsumption([batch({ id: 'b1' })], 3);
    assert.deepEqual(allocations, [{ batchId: 'b1', quantity: 3 }]);
    assert.deepEqual(lines, [{ delta: -3, batchId: 'b1' }]);
  });

  it('draws the oldest expiry down first', () => {
    const { allocations } = planConsumption(
      [
        batch({ id: 'newer', expiryDate: LATER_STILL, quantity: 5 }),
        batch({ id: 'older', expiryDate: FAR_FUTURE, quantity: 5 }),
      ],
      3,
    );
    assert.deepEqual(allocations, [{ batchId: 'older', quantity: 3 }]);
  });

  it('spans lots in expiry order when one does not cover it', () => {
    const { allocations, lines } = planConsumption(
      [
        batch({ id: 'newer', expiryDate: LATER_STILL, quantity: 10 }),
        batch({ id: 'older', expiryDate: FAR_FUTURE, quantity: 4 }),
      ],
      6,
    );
    assert.deepEqual(allocations, [
      { batchId: 'older', quantity: 4 },
      { batchId: 'newer', quantity: 2 },
    ]);
    // One movement per lot, so the ledger names both.
    assert.deepEqual(lines, [
      { delta: -4, batchId: 'older' },
      { delta: -2, batchId: 'newer' },
    ]);
  });

  it('counts what a lot has already given away', () => {
    const { allocations } = planConsumption(
      [batch({ id: 'b1', quantity: 10, usedQuantity: 8 })],
      5,
    );
    // Two left in the lot, three unaccounted for.
    assert.deepEqual(allocations, [{ batchId: 'b1', quantity: 2 }]);
  });

  it('skips an expired lot rather than putting its number on a record', () => {
    const { allocations } = planConsumption(
      [batch({ id: 'expired', expiryDate: LONG_EXPIRED }), batch({ id: 'good' })],
      3,
    );
    assert.deepEqual(allocations, [{ batchId: 'good', quantity: 3 }]);
  });
});

describe('planConsumption — the shortfall line', () => {
  it('writes an unattributed movement when there are no lots at all', () => {
    // The shelf has already been decremented. Dropping this line would lose the
    // consumption entirely, and the ledger would stop matching the counter.
    const { allocations, lines } = planConsumption([], 4);
    assert.deepEqual(allocations, []);
    assert.deepEqual(lines, [{ delta: -4, batchId: null }]);
  });

  it('splits into a lot line and a remainder line when the lots fall short', () => {
    const { lines } = planConsumption([batch({ id: 'b1', quantity: 2 })], 5);
    assert.deepEqual(lines, [
      { delta: -2, batchId: 'b1' },
      { delta: -3, batchId: null },
    ]);
  });

  it('writes no remainder line when the lots cover it exactly', () => {
    const { lines } = planConsumption([batch({ id: 'b1', quantity: 5 })], 5);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].batchId, 'b1');
  });

  it('always accounts for the full quantity, lots or no lots', () => {
    const cases: Array<[BatchForPlanning[], number]> = [
      [[], 7],
      [[batch({ id: 'b1', quantity: 3 })], 7],
      [[batch({ id: 'b1', quantity: 3 }), batch({ id: 'b2', quantity: 3 })], 7],
      [[batch({ id: 'b1', quantity: 99 })], 7],
      [[batch({ id: 'expired', expiryDate: LONG_EXPIRED, quantity: 99 })], 7],
    ];
    for (const [batches, wanted] of cases) {
      const { lines } = planConsumption(batches, wanted);
      const total = lines.reduce((sum, l) => sum + l.delta, 0);
      assert.equal(total, -wanted, `expected the lines to sum to -${wanted}`);
    }
  });

  it('never writes a positive delta — a consumption only ever takes', () => {
    const { lines } = planConsumption([batch({ id: 'b1', quantity: 2 })], 5);
    assert.ok(lines.every((l) => l.delta < 0));
  });
});

describe('planConsumption — a scanned lot beats the guess', () => {
  it('draws from the scanned lot ahead of an older one', () => {
    // Oldest-first is a guess at what was used; a scanned lot number is the
    // answer, and the answer wins.
    const { allocations } = planConsumption(
      [batch({ id: 'older', expiryDate: FAR_FUTURE }), batch({ id: 'scanned', expiryDate: LATER_STILL })],
      3,
      'scanned',
    );
    assert.deepEqual(allocations, [{ batchId: 'scanned', quantity: 3 }]);
  });

  it('honours a scanned lot even when it has expired', () => {
    // Attributing a scanned expired box to a healthier lot would record a lot
    // number that never went near the patient. The console warns instead.
    const { allocations } = planConsumption(
      [batch({ id: 'scanned', expiryDate: LONG_EXPIRED }), batch({ id: 'good' })],
      2,
      'scanned',
    );
    assert.deepEqual(allocations, [{ batchId: 'scanned', quantity: 2 }]);
  });

  it('falls back to oldest-first for whatever the scanned lot cannot cover', () => {
    const { allocations } = planConsumption(
      [
        batch({ id: 'scanned', expiryDate: LATER_STILL, quantity: 2 }),
        batch({ id: 'older', expiryDate: FAR_FUTURE, quantity: 10 }),
      ],
      5,
      'scanned',
    );
    assert.deepEqual(allocations, [
      { batchId: 'scanned', quantity: 2 },
      { batchId: 'older', quantity: 3 },
    ]);
  });

  it('never draws the scanned lot down twice for one consumption', () => {
    // It is excluded from the oldest-first pass precisely so this cannot happen.
    const { allocations } = planConsumption(
      [batch({ id: 'scanned', quantity: 2 })],
      5,
      'scanned',
    );
    assert.equal(allocations.filter((a) => a.batchId === 'scanned').length, 1);
    assert.deepEqual(allocations, [{ batchId: 'scanned', quantity: 2 }]);
  });

  it('ignores a scanned lot that is already used up and allocates normally', () => {
    const { allocations } = planConsumption(
      [batch({ id: 'scanned', quantity: 5, usedQuantity: 5 }), batch({ id: 'good' })],
      3,
      'scanned',
    );
    assert.deepEqual(allocations, [{ batchId: 'good', quantity: 3 }]);
  });

  it('ignores a scanned id that matches no lot on this item', () => {
    const { allocations } = planConsumption([batch({ id: 'b1' })], 3, 'not-a-lot-here');
    assert.deepEqual(allocations, [{ batchId: 'b1', quantity: 3 }]);
  });
});

describe('planConsumption — nothing to do', () => {
  it('plans nothing for a quantity of zero', () => {
    const { allocations, lines } = planConsumption([batch({ id: 'b1' })], 0);
    assert.deepEqual(allocations, []);
    assert.deepEqual(lines, []);
  });
});
