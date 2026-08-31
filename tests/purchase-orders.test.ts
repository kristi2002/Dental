import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type OpenLine, planReceipt } from '../src/lib/purchase-orders';

/**
 * How much of a delivery answers which order.
 *
 * The figure `StockItem.orderedAt` could never hold. That flag says "on its
 * way" and cleared on the first box through the scanner, so an order of ten
 * answered by a delivery of six closed itself and the four that never came
 * stopped being anybody's problem — no screen was still waiting for them, and
 * nothing recorded that they were owed.
 *
 * These are the three rules that replace it, tested apart from the transaction
 * that writes them, exactly as `planConsumption` is.
 */

function line(over: Partial<OpenLine> & { id: string }): OpenLine {
  return { orderId: `order-${over.id}`, quantity: 10, receivedQuantity: 0, ...over };
}

describe('planReceipt — the ordinary path', () => {
  it('books a full delivery against the one line that wanted it', () => {
    const { allocations, leftover } = planReceipt([line({ id: 'a' })], 10);
    assert.deepEqual(allocations, [{ lineId: 'a', orderId: 'order-a', quantity: 10 }]);
    assert.equal(leftover, 0);
  });

  it('books a part delivery and leaves the rest owed', () => {
    const { allocations, leftover } = planReceipt([line({ id: 'a' })], 6);
    assert.deepEqual(allocations, [{ lineId: 'a', orderId: 'order-a', quantity: 6 }]);
    assert.equal(leftover, 0, 'the delivery was placed in full — it is the *line* that is short');
  });

  it('tops a part-received line up to what it asked for and no further', () => {
    const { allocations } = planReceipt([line({ id: 'a', receivedQuantity: 6 })], 9);
    assert.deepEqual(allocations, [{ lineId: 'a', orderId: 'order-a', quantity: 4 }]);
  });
});

describe('planReceipt — the rules that keep an order honest', () => {
  it('never books more than a line is owed', () => {
    // Twelve against an order of ten. The shelf takes all twelve because twelve
    // boxes are physically there; the order does not pretend to have asked.
    const { allocations, leftover } = planReceipt([line({ id: 'a' })], 12);
    assert.deepEqual(allocations, [{ lineId: 'a', orderId: 'order-a', quantity: 10 }]);
    assert.equal(leftover, 2);
  });

  it('skips a line that is already filled rather than filling it twice', () => {
    const { allocations } = planReceipt(
      [line({ id: 'done', receivedQuantity: 10 }), line({ id: 'open' })],
      4,
    );
    assert.deepEqual(allocations, [{ lineId: 'open', orderId: 'order-open', quantity: 4 }]);
  });

  it('fills the order that has been waiting longest first', () => {
    // The caller supplies the order — oldest `placedAt` first — and this must
    // not re-sort it. A box that arrives answers the older debt.
    const { allocations } = planReceipt([line({ id: 'older' }), line({ id: 'newer' })], 14);
    assert.deepEqual(allocations, [
      { lineId: 'older', orderId: 'order-older', quantity: 10 },
      { lineId: 'newer', orderId: 'order-newer', quantity: 4 },
    ]);
  });

  it('stops as soon as the delivery runs out', () => {
    const { allocations, leftover } = planReceipt([line({ id: 'a' }), line({ id: 'b' })], 3);
    assert.deepEqual(allocations, [{ lineId: 'a', orderId: 'order-a', quantity: 3 }]);
    assert.equal(leftover, 0);
  });
});

describe('planReceipt — nothing to do', () => {
  it('places nothing when every line is settled', () => {
    const { allocations, leftover } = planReceipt([line({ id: 'a', receivedQuantity: 10 })], 5);
    assert.deepEqual(allocations, []);
    assert.equal(leftover, 5, 'a delivery against no outstanding order is all leftover');
  });

  it('places nothing when there are no lines at all', () => {
    assert.deepEqual(planReceipt([], 5), { allocations: [], leftover: 5 });
  });

  it('treats a nonsense quantity as nothing rather than as a credit', () => {
    // A negative here would otherwise *decrement* a received count and reopen a
    // line that had been filled.
    assert.deepEqual(planReceipt([line({ id: 'a' })], -4), { allocations: [], leftover: 0 });
    assert.deepEqual(planReceipt([line({ id: 'a' })], 0), { allocations: [], leftover: 0 });
  });
});
