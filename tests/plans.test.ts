import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STALLED_DAYS,
  nextBooking,
  planProgress,
  summarisePlan,
  worstFirst,
  type ScheduledStep,
} from '../src/lib/plan-progress';

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
