import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  addMonths,
  age,
  endOfMonth,
  endOfWeek,
  fromDateKey,
  minutesToTime,
  monthGrid,
  startOfWeek,
  timeToMinutes,
  toDateKey,
  toDay,
} from '../src/lib/dates';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('a calendar day is one exact value', () => {
  it('normalises any instant to UTC midnight', () => {
    assert.equal(toDateKey(toDay(new Date('2026-03-14T23:59:59.999Z'))), '2026-03-14');
    assert.equal(toDateKey(toDay(new Date('2026-03-14T00:00:00.000Z'))), '2026-03-14');
  });

  it('round-trips a date key', () => {
    assert.equal(toDateKey(fromDateKey('2026-08-12')), '2026-08-12');
  });

  it('falls back to today rather than an invalid date', () => {
    assert.ok(!Number.isNaN(fromDateKey(undefined).getTime()));
    assert.ok(!Number.isNaN(fromDateKey('not-a-date').getTime()));
  });

  it('does not shift across a DST boundary', () => {
    // Europe/Tirane springs forward on the last Sunday of March. A day-key
    // round trip must not land on the 28th or the 30th.
    assert.equal(toDateKey(addDays(utc('2026-03-28'), 1)), '2026-03-29');
    assert.equal(toDateKey(addDays(utc('2026-03-29'), 1)), '2026-03-30');
    assert.equal(toDateKey(addDays(utc('2026-10-24'), 1)), '2026-10-25');
  });
});

describe('week and month arithmetic', () => {
  it('starts the week on Monday', () => {
    // 2026-08-12 is a Wednesday.
    assert.equal(toDateKey(startOfWeek(utc('2026-08-12'))), '2026-08-10');
    assert.equal(toDateKey(endOfWeek(utc('2026-08-12'))), '2026-08-16');
  });

  it('treats Sunday as the end of the week it closes, not the start of the next', () => {
    assert.equal(toDateKey(startOfWeek(utc('2026-08-16'))), '2026-08-10');
  });

  it('clamps a month-end that the target month does not have', () => {
    assert.equal(toDateKey(addMonths(utc('2026-01-31'), 1)), '2026-02-28');
    assert.equal(toDateKey(addMonths(utc('2024-01-31'), 1)), '2024-02-29');
  });

  it('ends the month on its real last day', () => {
    assert.equal(toDateKey(endOfMonth(utc('2026-02-10'))), '2026-02-28');
    assert.equal(toDateKey(endOfMonth(utc('2026-12-01'))), '2026-12-31');
  });

  it('draws a month grid of whole weeks', () => {
    const grid = monthGrid(utc('2026-08-12'));
    assert.equal(grid.length % 7, 0);
    assert.equal(grid[0].getUTCDay(), 1, 'starts on a Monday');
    assert.equal(grid.at(-1)!.getUTCDay(), 0, 'ends on a Sunday');
  });
});

describe('clock times', () => {
  it('converts both ways', () => {
    assert.equal(timeToMinutes('08:30'), 510);
    assert.equal(minutesToTime(510), '08:30');
    assert.equal(minutesToTime(0), '00:00');
  });

  it('pads a single-digit hour on the way back', () => {
    assert.equal(timeToMinutes('9:05'), 545);
    assert.equal(minutesToTime(545), '09:05');
  });
});

describe('age', () => {
  it('does not count a birthday that has not happened yet this year', () => {
    const now = utc('2026-08-12');
    assert.equal(age(utc('2000-08-11'), now), 26);
    assert.equal(age(utc('2000-08-12'), now), 26);
    assert.equal(age(utc('2000-08-13'), now), 25);
  });
});
