import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STALLED_DAYS,
  isPromisedSlot,
  nextBooking,
  planProgress,
  summarisePlan,
  worstFirst,
  type ScheduledStep,
} from '../src/lib/plan-progress';
import { moveInList, positionWrites, targetIndex } from '../src/lib/plan-steps';

const NOW = new Date('2026-08-14T00:00:00.000Z');

const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000);

/** A step, with only the parts that matter to the caller spelled out. */
function step(over: Partial<ScheduledStep> = {}): ScheduledStep {
  return { status: 'PENDING', completedAt: null, appointment: null, ...over } as ScheduledStep;
}

function booking(date: Date, startTime = '09:00', status = 'SCHEDULED') {
  return { date, startTime, status } as ScheduledStep['appointment'];
}

describe('planProgress — how far through a plan is', () => {
  it('counts done over everything still relevant', () => {
    const progress = planProgress([
      step({ status: 'DONE' }),
      step({ status: 'DONE' }),
      step({ status: 'PENDING' }),
      step({ status: 'PENDING' }),
    ]);
    assert.deepEqual(progress, { done: 2, relevant: 4, percent: 50 });
  });

  it('drops a skipped step out of the denominator', () => {
    // The whole point: a plan with nothing left to do reads 100%, not 2 of 3.
    const progress = planProgress([
      step({ status: 'DONE' }),
      step({ status: 'DONE' }),
      step({ status: 'SKIPPED' }),
    ]);
    assert.deepEqual(progress, { done: 2, relevant: 2, percent: 100 });
  });

  it('does not divide by zero when every step was skipped', () => {
    const progress = planProgress([step({ status: 'SKIPPED' }), step({ status: 'SKIPPED' })]);
    assert.deepEqual(progress, { done: 0, relevant: 0, percent: 0 });
  });

  it('handles a plan with no steps at all', () => {
    assert.deepEqual(planProgress([]), { done: 0, relevant: 0, percent: 0 });
  });
});

describe('isPromisedSlot — whether a booking is still a promise', () => {
  it('accepts a future slot that still stands', () => {
    assert.equal(isPromisedSlot(booking(day(3)), NOW), true);
    assert.equal(isPromisedSlot(booking(day(3), '09:00', 'ARRIVED'), NOW), true);
  });

  it('counts today, and refuses yesterday', () => {
    assert.equal(isPromisedSlot(booking(NOW), NOW), true);
    assert.equal(isPromisedSlot(booking(day(-1)), NOW), false);
  });

  it('refuses a slot the patient cancelled or missed', () => {
    assert.equal(isPromisedSlot(booking(day(4), '09:00', 'CANCELLED'), NOW), false);
    assert.equal(isPromisedSlot(booking(day(4), '09:00', 'NO_SHOW'), NOW), false);
  });

  it('refuses a step that was never booked at all', () => {
    assert.equal(isPromisedSlot(null, NOW), false);
  });
});

describe('nextBooking — the promise that stops a plan being neglected', () => {
  it('picks the soonest of several', () => {
    const soon = step({ appointment: booking(day(3)) });
    const found = nextBooking([step({ appointment: booking(day(20)) }), soon], NOW);
    assert.equal(found, soon);
  });

  it('orders two slots on the same day by the clock', () => {
    const morning = step({ appointment: booking(day(5), '09:30') });
    const afternoon = step({ appointment: booking(day(5), '15:00') });
    assert.equal(nextBooking([afternoon, morning], NOW), morning);
  });

  it('counts today', () => {
    const todaySlot = step({ appointment: booking(NOW) });
    assert.equal(nextBooking([todaySlot], NOW), todaySlot);
  });

  it('ignores a slot that has already passed', () => {
    assert.equal(nextBooking([step({ appointment: booking(day(-1)) })], NOW), null);
  });

  it('ignores a cancelled or missed slot', () => {
    // A cancelled appointment is not a promise of anything, which is exactly
    // the case where a plan quietly stops moving.
    const cancelled = step({ appointment: booking(day(4), '09:00', 'CANCELLED') });
    const noShow = step({ appointment: booking(day(4), '09:00', 'NO_SHOW') });
    assert.equal(nextBooking([cancelled, noShow], NOW), null);
  });

  it('ignores the slot a finished step was booked into', () => {
    const past = step({ status: 'DONE', appointment: booking(day(9)) });
    assert.equal(nextBooking([past], NOW), null);
  });
});

describe('summarisePlan — what did we start and never finish', () => {
  const active = (steps: ScheduledStep[], createdAt = day(-200)) =>
    summarisePlan({ status: 'ACTIVE', createdAt, steps } as never, NOW);

  it('calls a plan stalled once it has been quiet long enough with nothing booked', () => {
    const summary = active([step({ status: 'DONE', completedAt: day(-STALLED_DAYS) }), step()]);
    assert.equal(summary.quietDays, STALLED_DAYS);
    assert.equal(summary.stalled, true);
  });

  it('does not call it stalled one day short', () => {
    const summary = active([
      step({ status: 'DONE', completedAt: day(-STALLED_DAYS + 1) }),
      step(),
    ]);
    assert.equal(summary.stalled, false);
  });

  it('is not stalled while a future visit is booked, however long it has been quiet', () => {
    const summary = active([step({ appointment: booking(day(30)) })]);
    assert.equal(summary.quietDays, 200);
    assert.equal(summary.stalled, false);
    assert.ok(summary.next);
  });

  it('counts quiet from the last thing actually done, not the first', () => {
    const summary = active([
      step({ status: 'DONE', completedAt: day(-120) }),
      step({ status: 'DONE', completedAt: day(-10) }),
      step(),
    ]);
    assert.equal(summary.quietDays, 10);
    assert.equal(summary.stalled, false);
  });

  it('counts from its own creation when nothing has been done', () => {
    // Otherwise a plan written and then forgotten has no history to be judged
    // on, and hides from the one list that would have caught it.
    const summary = active([step(), step()], day(-90));
    assert.equal(summary.quietDays, 90);
    assert.equal(summary.stalled, true);
  });

  it('never reports negative days for a plan started today', () => {
    // `now` is the clinic's midnight and `createdAt` a real timestamp, so a plan
    // written this morning is in the future by a few hours.
    const summary = active([step()], new Date('2026-08-14T10:30:00.000Z'));
    assert.equal(summary.quietDays, 0);
    assert.equal(summary.stalled, false);
  });

  it('never calls a finished plan stalled', () => {
    const summary = summarisePlan(
      {
        status: 'COMPLETED',
        createdAt: day(-400),
        steps: [step({ status: 'DONE', completedAt: day(-390) })],
      } as never,
      NOW,
    );
    assert.equal(summary.stalled, false);
    assert.equal(summary.percent, 100);
  });
});

describe('worstFirst — the order the list opens in', () => {
  it('puts stalled plans above merely open ones, then the longest quiet first', () => {
    const rows = [
      { name: 'quiet 10', stalled: false, quietDays: 10 },
      { name: 'stalled 70', stalled: true, quietDays: 70 },
      { name: 'quiet 40', stalled: false, quietDays: 40 },
      { name: 'stalled 300', stalled: true, quietDays: 300 },
    ];
    assert.deepEqual(
      [...rows].sort(worstFirst).map((row) => row.name),
      ['stalled 300', 'stalled 70', 'quiet 40', 'quiet 10'],
    );
  });
});

describe('summarisePlan — a plan somebody has already rung about', () => {
  const chased = (followUpOn: Date | null, steps: ScheduledStep[] = [step()]) =>
    summarisePlan(
      { status: 'ACTIVE', createdAt: day(-200), steps, followUpOn } as never,
      NOW,
    );

  it('stops calling a plan stalled while the promised day is still ahead', () => {
    // The whole point. Ringing a patient is not something anybody can do *to a
    // plan*, so a plan chased this morning shouted exactly as loudly this
    // afternoon — and the only ways to quieten it were to tick off treatment
    // nobody gave or to abandon a course the patient means to finish.
    const summary = chased(day(30));
    assert.equal(summary.quietDays, 200);
    assert.equal(summary.snoozed, true);
    assert.equal(summary.stalled, false);
    assert.equal(summary.followUpDays, 30);
  });

  it('lets it back onto the list the moment the promised day arrives', () => {
    const summary = chased(NOW);
    assert.equal(summary.snoozed, false);
    assert.equal(summary.stalled, true);
    assert.equal(summary.followUpDays, 0);
  });

  it('shouts again once the promised day has gone by', () => {
    const summary = chased(day(-3));
    assert.equal(summary.snoozed, false);
    assert.equal(summary.stalled, true);
    assert.equal(summary.followUpDays, -3);
  });

  it('is unchanged by a call recorded without a day', () => {
    const summary = chased(null);
    assert.equal(summary.snoozed, false);
    assert.equal(summary.stalled, true);
    assert.equal(summary.followUpOn, null);
  });

  it('does not park a plan that is not otherwise stalled anyway', () => {
    // Snoozing is a suppression, not a state of its own: a plan with a visit
    // booked was never shouting, and must not start now.
    const summary = summarisePlan(
      {
        status: 'ACTIVE',
        createdAt: day(-200),
        steps: [step({ appointment: booking(day(30)) })],
        followUpOn: day(10),
      } as never,
      NOW,
    );
    assert.equal(summary.stalled, false);
    assert.ok(summary.next);
  });
});

describe('worstFirst — a parked plan sinks', () => {
  it('sorts a plan somebody has already dealt with below one nobody has', () => {
    const rows = [
      { name: 'parked 300', stalled: false, quietDays: 300, snoozed: true },
      { name: 'quiet 10', stalled: false, quietDays: 10, snoozed: false },
      { name: 'stalled 70', stalled: true, quietDays: 70, snoozed: false },
    ];
    assert.deepEqual(
      [...rows].sort(worstFirst).map((row) => row.name),
      ['stalled 70', 'quiet 10', 'parked 300'],
    );
  });
});

describe('targetIndex — where a step is being asked to go', () => {
  it('moves one place, or all the way', () => {
    assert.equal(targetIndex(3, 'up', 6), 2);
    assert.equal(targetIndex(3, 'down', 6), 4);
    assert.equal(targetIndex(3, 'top', 6), 0);
    assert.equal(targetIndex(3, 'bottom', 6), 5);
  });

  it('clamps at both ends rather than refusing', () => {
    // "Move up" on the first row is a no-op, not an error: the caller should not
    // have to know which row it is holding to ask.
    assert.equal(targetIndex(0, 'up', 4), 0);
    assert.equal(targetIndex(3, 'down', 4), 3);
    assert.equal(targetIndex(0, 'bottom', 1), 0);
  });
});

describe('moveInList — lift out and put down, never swap', () => {
  it('carries the rest of the list along', () => {
    // A swap is only the same thing for neighbours. Dropping the last item at
    // the top with a swap leaves the first one at the bottom, which is not what
    // anybody dragging it meant.
    assert.deepEqual(moveInList(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(moveInList(['a', 'b', 'c', 'd'], 0, 3), ['b', 'c', 'd', 'a']);
  });

  it('is a no-op for a drag that ended where it started', () => {
    assert.deepEqual(moveInList(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
  });

  it('leaves the list alone when asked to move something that is not in it', () => {
    assert.deepEqual(moveInList(['a', 'b'], 5, 0), ['a', 'b']);
  });
});

describe('positionWrites — the smallest set of writes that puts an order right', () => {
  const stored = (...positions: number[]) =>
    positions.map((position, index) => ({ id: `s${index + 1}`, position }));

  it('writes only the rows that actually move', () => {
    // Reordering the tail of a plan should not rewrite its head.
    const writes = positionWrites(['s1', 's2', 's4', 's3'], stored(1, 2, 3, 4));
    assert.deepEqual(writes, [
      { id: 's4', position: 3 },
      { id: 's3', position: 4 },
    ]);
  });

  it('writes nothing when the order is already the stored one', () => {
    assert.deepEqual(positionWrites(['s1', 's2', 's3'], stored(1, 2, 3)), []);
  });

  it('closes the gaps a deleted step left behind', () => {
    // The old neighbour swap preserved whatever gaps the sequence had grown, so
    // this is the repair as much as the reorder.
    const writes = positionWrites(['s1', 's2', 's3'], stored(1, 7, 12));
    assert.deepEqual(writes, [
      { id: 's2', position: 2 },
      { id: 's3', position: 3 },
    ]);
  });

  it('keeps a step the caller forgot to mention, at the end', () => {
    // A stale tab posting yesterday's list can misorder a plan, which is
    // recoverable. It must never drop a step out of one.
    // s2 goes on the end, keeping its place relative to anything else omitted.
    const writes = positionWrites(['s3', 's1'], stored(1, 2, 3));
    assert.deepEqual(writes, [
      { id: 's3', position: 1 },
      { id: 's1', position: 2 },
      { id: 's2', position: 3 },
    ]);
  });

  it('ignores ids that are not steps of this plan, and repeated ones', () => {
    const writes = positionWrites(['ghost', 's2', 's2', 's1'], stored(1, 2));
    assert.deepEqual(writes, [
      { id: 's2', position: 1 },
      { id: 's1', position: 2 },
    ]);
  });

  it('leaves the plan exactly as it found it when no order was named', () => {
    assert.deepEqual(positionWrites([], stored(1, 2, 3)), []);
  });
});
