import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignGaps, collides, gapsIn, type FreeGap } from '../src/lib/scheduling';
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

describe('gapsIn — the free stretches left in a day', () => {
  const week = [OPEN];
  const wednesday = utc('2026-08-12');
  const schedule = scheduleFor(wednesday, week, []);

  it('offers the whole open day when nothing is booked', () => {
    assert.deepEqual(gapsIn(schedule, []), [
      { startTime: '08:00', endTime: '13:00', minutes: 300 },
      { startTime: '14:00', endTime: '18:00', minutes: 240 },
    ]);
  });

  it('never spans the lunch break', () => {
    // One free stretch either side of the break, never one that swallows it.
    const gaps = gapsIn(schedule, [{ startTime: '08:00', durationMin: 300 }]);
    assert.deepEqual(gaps, [{ startTime: '14:00', endTime: '18:00', minutes: 240 }]);
  });

  it('leaves no phantom gap between back-to-back bookings', () => {
    const gaps = gapsIn(schedule, [
      { startTime: '08:00', durationMin: 60 },
      { startTime: '09:00', durationMin: 60 },
    ]);
    assert.deepEqual(gaps, [
      { startTime: '10:00', endTime: '13:00', minutes: 180 },
      { startTime: '14:00', endTime: '18:00', minutes: 240 },
    ]);
  });

  it('counts overlapping bookings once', () => {
    const gaps = gapsIn(schedule, [
      { startTime: '08:00', durationMin: 120 },
      { startTime: '09:00', durationMin: 120 },
    ]);
    assert.equal(gaps[0]?.startTime, '11:00');
  });

  it('drops stretches shorter than what is being looked for', () => {
    // 08:00–09:00 is free but a 90-minute treatment does not fit in it.
    const gaps = gapsIn(schedule, [{ startTime: '09:00', durationMin: 240 }], {
      minMinutes: 90,
    });
    assert.deepEqual(gaps, [{ startTime: '14:00', endTime: '18:00', minutes: 240 }]);
  });

  it('ignores everything before the cutoff', () => {
    const gaps = gapsIn(schedule, [], { after: '15:30' });
    assert.deepEqual(gaps, [{ startTime: '15:30', endTime: '18:00', minutes: 150 }]);
  });

  it('offers nothing on a closed day', () => {
    const shut = scheduleFor(wednesday, week, [
      { from: wednesday, to: wednesday, reason: 'Holiday' },
    ]);
    assert.deepEqual(gapsIn(shut, []), []);
  });
});

describe('assignGaps — one slot, one person', () => {
  const gap = (startTime: string, endTime: string, minutes: number): FreeGap => ({
    startTime,
    endTime,
    minutes,
  });

  it('splits a free hour between two half-hour treatments', () => {
    const offers = assignGaps(
      [{ durationMin: 30 }, { durationMin: 30 }],
      [gap('09:00', '10:00', 60)],
    );
    assert.equal(offers[0]?.gap?.startTime, '09:00');
    assert.equal(offers[1]?.gap?.startTime, '09:30');
  });

  it('never offers the same minutes twice', () => {
    // The bug this exists to stop: one hole, five people, five identical
    // messages, and a slot promised to everybody.
    const offers = assignGaps(
      [{ durationMin: 45 }, { durationMin: 45 }, { durationMin: 45 }],
      [gap('09:00', '10:00', 60)],
    );
    assert.equal(offers[0]?.gap?.startTime, '09:00');
    assert.equal(offers[1]?.gap, null);
    assert.equal(offers[2]?.gap, null);
  });

  it('keeps a long treatment out of a short hole', () => {
    const offers = assignGaps([{ durationMin: 60 }], [gap('09:00', '09:20', 20)]);
    assert.equal(offers[0]?.gap, null);
  });

  it('passes over a stretch that is too short and takes the next that fits', () => {
    const offers = assignGaps(
      [{ durationMin: 60 }],
      [gap('09:00', '09:20', 20), gap('11:00', '12:30', 90)],
    );
    assert.equal(offers[0]?.gap?.startTime, '11:00');
  });

  it('hands back the slice assigned, not the stretch it came from', () => {
    const offers = assignGaps([{ durationMin: 30 }], [gap('09:00', '12:00', 180)]);
    assert.deepEqual(offers[0]?.gap, { startTime: '09:00', endTime: '09:30', minutes: 30 });
  });

  it('drops a leftover nobody could book', () => {
    // 5 minutes left of the stretch: not free time worth offering to anybody.
    const offers = assignGaps(
      [{ durationMin: 30 }, { durationMin: 5 }],
      [gap('09:00', '09:35', 35)],
    );
    assert.equal(offers[0]?.gap?.startTime, '09:00');
    assert.equal(offers[1]?.gap, null);
  });

  it('answers in the order given, which is the fair one', () => {
    const urgent = { durationMin: 30, id: 'urgent' };
    const older = { durationMin: 30, id: 'older' };
    const offers = assignGaps([urgent, older], [gap('09:00', '10:00', 60)]);
    assert.equal(offers[0]?.entry.id, 'urgent');
    assert.equal(offers[0]?.gap?.startTime, '09:00');
  });

  it('says no to everybody on a day with no free time', () => {
    const offers = assignGaps([{ durationMin: 30 }], []);
    assert.equal(offers[0]?.gap, null);
  });
});

describe('assignGaps — looking past the day in view', () => {
  const dated = (date: string, startTime: string, endTime: string, minutes: number) => ({
    date,
    startTime,
    endTime,
    minutes,
  });

  it('keeps the day on the slice it hands back', () => {
    // Whoever reads the row has to be told *which* nine o'clock.
    const offers = assignGaps(
      [{ durationMin: 60 }],
      [dated('2026-08-21', '09:00', '09:30', 30), dated('2026-08-25', '09:00', '11:00', 120)],
    );
    assert.equal(offers[0]?.gap?.date, '2026-08-25');
    assert.equal(offers[0]?.gap?.startTime, '09:00');
  });

  it('spends today before it reaches next week', () => {
    const offers = assignGaps(
      [{ durationMin: 30 }, { durationMin: 30 }, { durationMin: 30 }],
      [dated('2026-08-21', '09:00', '10:00', 60), dated('2026-08-25', '14:00', '15:00', 60)],
    );
    assert.deepEqual(
      offers.map((offer) => [offer.gap?.date, offer.gap?.startTime]),
      [
        ['2026-08-21', '09:00'],
        ['2026-08-21', '09:30'],
        ['2026-08-25', '14:00'],
      ],
    );
  });

  it('still says no when a fortnight holds nothing long enough', () => {
    const offers = assignGaps(
      [{ durationMin: 90 }],
      [dated('2026-08-21', '09:00', '10:00', 60), dated('2026-08-25', '14:00', '15:00', 60)],
    );
    assert.equal(offers[0]?.gap, null);
  });
});
