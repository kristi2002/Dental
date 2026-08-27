import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openStateAt, type LiveHours } from '../src/lib/site-open';
import { estimateTrip } from '../src/lib/site-content';

/**
 * The two pure answers behind the practice's public page.
 *
 * Both are worth a test for the same reason: they are the only arithmetic on
 * that page a visitor acts on. "Open now, until 19:00" decides whether somebody
 * gets in a car, and the trip estimate decides whether somebody buys a plane
 * ticket. Neither has a screen a member of staff would notice being wrong on.
 *
 * `openStateAt` is also the one function in this codebase that runs on both
 * sides of the network — the server renders with it and the browser recomputes
 * with it a minute later — so an hour's disagreement between the two would show
 * up as a page that changes its mind on hydration and nowhere else.
 */

/** A practice open 08:00–13:00 and 14:00–19:00 on Monday, shut on Sunday. */
const WEEK: LiveHours = {
  timeZone: 'Europe/Tirane',
  week: [
    { weekday: 0, ranges: [] },
    {
      weekday: 1,
      ranges: [
        { start: 8 * 60, end: 13 * 60 },
        { start: 14 * 60, end: 19 * 60 },
      ],
    },
    { weekday: 2, ranges: [{ start: 9 * 60, end: 17 * 60 }] },
    { weekday: 3, ranges: [{ start: 9 * 60, end: 17 * 60 }] },
    { weekday: 4, ranges: [{ start: 9 * 60, end: 17 * 60 }] },
    { weekday: 5, ranges: [{ start: 9 * 60, end: 17 * 60 }] },
    { weekday: 6, ranges: [{ start: 9 * 60, end: 14 * 60 }] },
  ],
  // 2026-08-31 is a Monday; 2026-09-01 a Tuesday, closed for a holiday.
  closures: { '2026-09-01': 'Public holiday' },
  knownThrough: '2026-09-02',
};

/** Albania is UTC+2 in summer, so 09:30 local on the 31st is 07:30Z. */
const at = (iso: string) => new Date(iso);

describe('whether the practice is open, as the page says it', () => {
  it('is open, and names the end of the stretch it is in — not the end of the day', () => {
    // 09:30 local, inside the morning. A practice that shuts for lunch closes
    // at one; telling somebody "until 19:00" would have them arrive to a locked
    // door at half past one.
    const state = openStateAt(WEEK, at('2026-08-31T07:30:00Z'));
    assert.equal(state?.tone, 'open');
    assert.equal(state?.closesAt, '13:00');
    assert.equal(state?.opensAt, null);
  });

  it('says it opens again this afternoon rather than flatly closed', () => {
    // 13:30 local — the two hours every afternoon where a flat "closed" would
    // send a visitor to a competitor over a break that ends at two.
    const state = openStateAt(WEEK, at('2026-08-31T11:30:00Z'));
    assert.equal(state?.tone, 'later');
    assert.equal(state?.opensAt, '14:00');
    assert.equal(state?.closesAt, null);
  });

  it('is shut once the last stretch has ended', () => {
    const state = openStateAt(WEEK, at('2026-08-31T17:30:00Z')); // 19:30 local
    assert.equal(state?.tone, 'shut');
    assert.equal(state?.opensAt, null);
  });

  it('closes on the stroke of the closing minute, not a minute after', () => {
    // 13:00 exactly. Ranges are half-open, so the minute the practice closes is
    // already closed — the alternative offers somebody an appointment in a
    // surgery that is locking the door.
    assert.equal(openStateAt(WEEK, at('2026-08-31T11:00:00Z'))?.tone, 'later');
    assert.equal(openStateAt(WEEK, at('2026-08-31T10:59:00Z'))?.tone, 'open');
  });

  it('reads the clinic clock, not the visitor machine clock', () => {
    // The same instant, expressed in UTC. A browser in London computing on its
    // own clock would make this 06:30 and report the practice shut; the whole
    // point of carrying `timeZone` in the payload is that it does not.
    const state = openStateAt(WEEK, at('2026-08-31T06:30:00Z')); // 08:30 in Vlorë
    assert.equal(state?.tone, 'open');
  });

  it('lets a closure shut a day the weekly pattern says is open', () => {
    // Tuesday, ordinarily 09:00–17:00.
    const state = openStateAt(WEEK, at('2026-09-01T09:00:00Z'));
    assert.equal(state?.tone, 'shut');
    assert.equal(state?.closureReason, 'Public holiday');
    assert.equal(state?.todayHours, '');
  });

  it('refuses to answer past the window it has closure data for', () => {
    // A tab left open for days. Null is the honest answer and the component
    // keeps the server's — the alternative is a browser that cannot see a
    // public holiday writing "open now" over the top of one.
    assert.equal(openStateAt(WEEK, at('2026-09-05T09:00:00Z')), null);
  });

  it('does not mistake midnight for the end of the day', () => {
    // 00:30 local on the Monday. Under `hour12: false` several locales render
    // midnight as "24", which would put the clock at 1470 minutes and report a
    // practice shut through its own morning.
    const state = openStateAt(WEEK, at('2026-08-30T22:30:00Z'));
    assert.equal(state?.weekday, 1);
    assert.equal(state?.tone, 'later');
    assert.equal(state?.opensAt, '08:00');
  });
});

describe('what a trip for treatment adds up to', () => {
  it('has nothing to say about an empty basket', () => {
    assert.deepEqual(estimateTrip([]), {
      visits: [0, 0],
      days: [0, 0],
      months: [0, 0],
      trips: 1,
    });
  });

  it('adds visits up, because two treatments are two courses of appointments', () => {
    const one = estimateTrip(['checkup']);
    const two = estimateTrip(['checkup', 'extraction']);
    assert.deepEqual(one.visits, [1, 1]);
    assert.deepEqual(two.visits, [2, 2]);
  });

  it('does not add days up — a practice works a visitor into as few as it can', () => {
    // A check-up is a day and a filling is one to two. Summed, this would tell
    // somebody to book three days for an afternoon of work; the honest answer
    // is the longest plus one for the second treatment.
    const estimate = estimateTrip(['checkup', 'fillings']);
    assert.deepEqual(estimate.days, [2, 3]);
  });

  it('runs healing time in parallel rather than stacking it', () => {
    // An implant integrating for months does not take longer because a crown
    // was fitted in the same week.
    const alone = estimateTrip(['implants']);
    const withCrown = estimateTrip(['implants', 'crowns']);
    assert.deepEqual(alone.months, withCrown.months);
  });

  it('calls for a second trip only when something needs healing time', () => {
    assert.equal(estimateTrip(['checkup', 'fillings', 'whitening']).trips, 1);
    assert.equal(estimateTrip(['implants']).trips, 2);
    // A crown can run into a second month, so it is not a single-stay answer.
    assert.equal(estimateTrip(['crowns']).trips, 2);
  });
});
