import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDateNames,
  renderCount,
  renderDate,
  SHAPE_OPTIONS,
  type DateShape,
} from '../src/lib/date-names';
import { locales } from '../src/i18n/routing';

/**
 * The whole point of `date-names.ts` is to produce, without asking the browser
 * for locale data, exactly what `Intl` would have produced with it. So the test
 * is that equality, stated over enough dates to catch an off-by-one in a
 * weekday index or a month that only differs in one language.
 *
 * Node ships full ICU, which is what makes this checkable here at all — and is
 * also the asymmetry the module exists to paper over: the server has the data
 * and Chrome does not. See `docs/GAPS-PASS-4.md` §H-01.
 */

/** Every day of one full year, plus a leap day and both year boundaries. */
function sampleDates(): Date[] {
  const dates: Date[] = [];
  for (let day = 0; day < 366; day++) {
    dates.push(new Date(Date.UTC(2026, 0, 1) + day * 86_400_000));
  }
  dates.push(
    new Date(Date.UTC(2024, 1, 29)), // a leap day
    new Date(Date.UTC(2025, 11, 31)),
    new Date(Date.UTC(2027, 0, 1)),
    new Date(Date.UTC(2026, 8, 9)), // single-digit day and month
  );
  return dates;
}

const SHAPES = Object.keys(SHAPE_OPTIONS) as DateShape[];

describe('rendered dates match what ICU would have produced', () => {
  for (const locale of locales) {
    for (const shape of SHAPES) {
      it(`${locale} · ${shape}`, () => {
        const names = buildDateNames(locale);
        const reference = new Intl.DateTimeFormat(locale, {
          ...SHAPE_OPTIONS[shape],
          timeZone: 'UTC',
        });

        for (const date of sampleDates()) {
          assert.equal(
            renderDate(names, shape, date),
            reference.format(date),
            `${locale} ${shape} ${date.toISOString().slice(0, 10)}`,
          );
        }
      });
    }
  }
});

describe('the names themselves', () => {
  it('indexes weekdays by getUTCDay, Sunday first', () => {
    const names = buildDateNames('en');
    assert.equal(names.weekdayLong[0], 'Sunday');
    assert.equal(names.weekdayLong[1], 'Monday');
    assert.equal(names.weekdayLong[6], 'Saturday');

    // The index is the contract, so it is checked against a real date rather
    // than against the order the array happened to be built in.
    const wednesday = new Date(Date.UTC(2026, 7, 26));
    assert.equal(wednesday.getUTCDay(), 3);
    assert.equal(names.weekdayLong[wednesday.getUTCDay()], 'Wednesday');
  });

  it('indexes months by getUTCMonth, January first', () => {
    const names = buildDateNames('en');
    assert.equal(names.monthLong[0], 'January');
    assert.equal(names.monthLong[11], 'December');
  });

  it('carries Albanian names, which is the case Chrome cannot serve itself', () => {
    const names = buildDateNames('sq');

    // Not asserted against a hardcoded spelling — ICU owns that, and a CLDR
    // update is allowed to change it. What must hold is that Albanian is not
    // silently English, which is exactly the symptom §H-01 describes.
    const english = buildDateNames('en');
    assert.notDeepEqual(names.weekdayShort, english.weekdayShort);
    assert.notDeepEqual(names.monthLong, english.monthLong);
    assert.equal(names.weekdayLong.length, 7);
    assert.equal(names.monthLong.length, 12);
  });
});

describe('shape tokens', () => {
  it('reduces a single-field shape to one token', () => {
    const names = buildDateNames('en');
    assert.deepEqual(names.shapes.weekdayShort, [{ t: 'wdS' }]);
    assert.deepEqual(names.shapes.monthShort, [{ t: 'moS' }]);
  });

  it('keeps the locale’s own ordering rather than imposing one', () => {
    // English puts the month first, Italian the day. If this module were
    // writing its own format string instead of measuring ICU, one of these
    // would be wrong — which is the failure the test is here to prevent.
    const english = buildDateNames('en').shapes.dayMonthShort.map((token) => token.t);
    const italian = buildDateNames('it').shapes.dayMonthShort.map((token) => token.t);

    assert.equal(english.indexOf('moS') < english.indexOf('day'), true);
    assert.equal(italian.indexOf('day') < italian.indexOf('moS'), true);
  });

  it('resolves dateStyle into the components the locale actually uses', () => {
    // `dateStyle: 'long'` names no components at all, and this Node returns an
    // empty object from `resolvedOptions()` for every one of them — so the width
    // is recovered by matching the rendered text against the name lists. This is
    // the case that caught it: `dateLong` was tokenising as a *short* month and
    // rendering `sht` where ICU writes `shtator`.
    for (const locale of locales) {
      const kinds = new Set(buildDateNames(locale).shapes.dateLong.map((token) => token.t));
      assert.equal(kinds.has('moL'), true, `${locale} dateLong has no long month`);
      assert.equal(kinds.has('day'), true, `${locale} dateLong has no day`);
      assert.equal(kinds.has('year'), true, `${locale} dateLong has no year`);
    }
  });
});

describe('counts carry the locale’s thousands mark', () => {
  it('groups the way Intl does', () => {
    for (const locale of locales) {
      const names = buildDateNames(locale);
      for (const value of [0, 7, 999, 1000, 12_345, 1_234_567]) {
        assert.equal(
          renderCount(names, value),
          new Intl.NumberFormat(locale).format(value),
          `${locale} ${value}`,
        );
      }
    }
  });

  it('keeps a negative count negative', () => {
    const names = buildDateNames('en');
    assert.equal(renderCount(names, -4200), '-4,200');
  });
});
