import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collides } from '../src/lib/scheduling';
import { rangesFor, scheduleFor, type DayHours } from '../src/lib/clinic-hours';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const OPEN: DayHours = {
  weekday: 3,
  open: true,
  openTime: '08:00',
  closeTime: '18:00',
  breakStart: '13:00',
  breakEnd: '14:00',
};

describe('collides — what actually clashes', () => {
  it('treats the same dentist as a clash', () => {
    assert.equal(collides({ staffUserId: 'a' }, { staffUserId: 'a' }), true);
  });

  it('treats the same chair as a clash', () => {
    assert.equal(collides({ operatoryId: 'r1' }, { operatoryId: 'r1' }), true);
  });

  it('lets two dentists work in parallel', () => {
    assert.equal(collides({ staffUserId: 'a' }, { staffUserId: 'b' }), false);
  });

  it('lets two chairs run at once', () => {
    assert.equal(collides({ operatoryId: 'r1' }, { operatoryId: 'r2' }), false);
  });

  it('clashes when nothing on either side proves them apart', () => {
    // A practice that records neither keeps exactly the behaviour it had before
    // resources existed: everything collides with everything.
    assert.equal(collides({}, {}), true);
  });

  it('clashes when only one side is known', () => {
    assert.equal(collides({ staffUserId: 'a' }, {}), true);
    assert.equal(collides({}, { operatoryId: 'r1' }), true);
  });

  it('still clashes on a shared dentist even in different chairs', () => {
    // One person cannot be in two rooms.
    assert.equal(
      collides({ staffUserId: 'a', operatoryId: 'r1' }, { staffUserId: 'a', operatoryId: 'r2' }),
      true,
    );
  });

  it('still clashes on a shared chair even with different dentists', () => {
    // One room cannot hold two treatments.
    assert.equal(
      collides({ staffUserId: 'a', operatoryId: 'r1' }, { staffUserId: 'b', operatoryId: 'r1' }),
      true,
    );
  });
});

describe('rangesFor — a day split by its lunch break', () => {
  it('splits the day in two', () => {
    assert.deepEqual(rangesFor(OPEN), [
      { start: 480, end: 780 },
      { start: 840, end: 1080 },
    ]);
  });

  it('yields nothing for a closed day', () => {
    assert.deepEqual(rangesFor({ ...OPEN, open: false }), []);
  });

  it('yields nothing when closing is not after opening', () => {
    assert.deepEqual(rangesFor({ ...OPEN, openTime: '18:00', closeTime: '08:00' }), []);
  });

  it('ignores a half-filled break rather than producing a negative range', () => {
    assert.deepEqual(rangesFor({ ...OPEN, breakEnd: null }), [{ start: 480, end: 1080 }]);
    assert.deepEqual(rangesFor({ ...OPEN, breakStart: null }), [{ start: 480, end: 1080 }]);
  });

  it('ignores a break that has drifted outside opening hours', () => {
    assert.deepEqual(rangesFor({ ...OPEN, breakStart: '20:00', breakEnd: '21:00' }), [
      { start: 480, end: 1080 },
    ]);
  });

  it('clamps a break that overhangs the end of the day', () => {
    const ranges = rangesFor({ ...OPEN, breakStart: '17:00', breakEnd: '23:00' });
    assert.deepEqual(ranges, [{ start: 480, end: 1020 }]);
  });
});

describe('scheduleFor — closures', () => {
  const week = [OPEN];
  const wednesday = utc('2026-08-12');

  it('is open when nothing closes it', () => {
    const schedule = scheduleFor(wednesday, week, []);
    assert.equal(schedule.closed, false);
    assert.equal(schedule.ranges.length, 2);
  });

  it('closes on a practice-wide closure spanning the day', () => {
    const schedule = scheduleFor(wednesday, week, [
      { from: utc('2026-08-10'), to: utc('2026-08-20'), reason: 'August shutdown' },
    ]);
    assert.equal(schedule.closed, true);
    assert.equal(schedule.closureReason, 'August shutdown');
    assert.deepEqual(schedule.ranges, []);
  });

  it('includes both endpoints of a closure', () => {
    const single = { from: wednesday, to: wednesday, reason: 'Holiday' };
    assert.equal(scheduleFor(wednesday, week, [single]).closed, true);
    assert.equal(scheduleFor(utc('2026-08-13'), week, [single]).closed, false);
  });

  it("counts one dentist's leave against them and nobody else", () => {
    const leave = [{ from: wednesday, to: wednesday, reason: 'Course', staffUserId: 'a' }];
    assert.equal(scheduleFor(wednesday, week, leave, 'a').closed, true);
    assert.equal(scheduleFor(wednesday, week, leave, 'b').closed, false);
  });

  it('leaves the building open when asked for nobody in particular', () => {
    // The practice is open even if one dentist is away.
    const leave = [{ from: wednesday, to: wednesday, reason: 'Course', staffUserId: 'a' }];
    assert.equal(scheduleFor(wednesday, week, leave).closed, false);
  });

  it('reports a weekday with no open hours as closed', () => {
    const schedule = scheduleFor(wednesday, [{ ...OPEN, open: false }], []);
    assert.equal(schedule.closed, true);
    assert.equal(schedule.closureReason, null);
  });
});
