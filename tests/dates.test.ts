import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  addMonths,
  age,
  endOfMonth,
  endOfWeek,
  fromDateKey,
  isDateKey,
  isTimeOfDay,
  minutesToTime,
  monthGrid,
  parseDateKey,
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

/**
 * The shape of a date is not the same question as whether the day exists, and
 * the gap between them is where a booking lands on a day nobody chose.
 */
describe('isDateKey — a real day, not merely a well-shaped string', () => {
  it('accepts an ordinary day', () => {
    assert.equal(isDateKey('2026-08-31'), true);
  });

  it('accepts the 29th of February in a leap year', () => {
    assert.equal(isDateKey('2024-02-29'), true);
  });

  /**
   * The three that matter, and the reason a `NaN` check is not enough on its
   * own: only the first of these is an Invalid Date. JavaScript rolls the other
   * two forward — the 30th of February becomes the 2nd of March, and the 29th
   * in a common year becomes the 1st — and hands back a date that looks fine.
   */
  it('refuses a month and day that cannot exist', () => {
    assert.equal(isDateKey('9999-99-99'), false);
  });

  it('refuses the 30th of February, which JavaScript would roll to March', () => {
    assert.equal(isDateKey('2026-02-30'), false);
  });

  it('refuses the 29th of February in a common year', () => {
    assert.equal(isDateKey('2026-02-29'), false);
  });

  it('refuses anything not of the shape at all', () => {
    for (const bad of ['', '2026-8-31', '31-08-2026', '2026/08/31', 'today', '2026-08-31T00:00']) {
      assert.equal(isDateKey(bad), false, `accepted ${JSON.stringify(bad)}`);
    }
  });
});

describe('isTimeOfDay — a time on a 24-hour clock', () => {
  it('accepts the ends of the day and a padded hour', () => {
    for (const good of ['00:00', '9:30', '09:30', '23:59']) {
      assert.equal(isTimeOfDay(good), true, `refused ${good}`);
    }
  });

  /**
   * The regression. `99:99` passed the shape test the write paths used, and
   * `timeToMinutes` turns it into 6039 — past the end of the day, so the slot
   * sorts after everything and falls outside every opening-hours window.
   */
  it('refuses an hour or a minute that is not on the clock', () => {
    for (const bad of ['99:99', '24:00', '23:60', '25:30']) {
      assert.equal(isTimeOfDay(bad), false, `accepted ${bad}`);
    }
  });

  it('refuses anything not of the shape at all', () => {
    for (const bad of ['', '9', '9:5', '09:30:00', 'noon']) {
      assert.equal(isTimeOfDay(bad), false, `accepted ${JSON.stringify(bad)}`);
    }
  });
});

describe('parseDateKey — null for a blank field and for a bad one alike', () => {
  it('parses a real day to UTC midnight', () => {
    assert.equal(parseDateKey('2026-08-31')?.toISOString(), '2026-08-31T00:00:00.000Z');
  });

  it('gives null for nothing', () => {
    assert.equal(parseDateKey(null), null);
    assert.equal(parseDateKey(undefined), null);
    assert.equal(parseDateKey(''), null);
  });

  /**
   * The point of it. The idiom this replaced returned an *Invalid Date* here
   * rather than null, and that travelled on into a query or a write.
   */
  it('gives null rather than an Invalid Date for a day that does not exist', () => {
    assert.equal(parseDateKey('2026-02-30'), null);
    assert.equal(parseDateKey('9999-99-99'), null);
  });
});
