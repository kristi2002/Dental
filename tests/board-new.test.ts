import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countNew, isNew } from '../src/lib/board-new';

const at = (iso: string) => new Date(iso);

const SEEN = at('2026-08-30T17:00:00.000Z');

describe('countNew — what has landed since somebody last looked', () => {
  it('counts only what arrived after the board was shut', () => {
    const rows = [
      { createdAt: at('2026-08-28T09:00:00.000Z') },
      { createdAt: at('2026-08-30T16:59:59.000Z') },
      { createdAt: at('2026-08-30T17:00:01.000Z') },
      { createdAt: at('2026-08-31T08:00:00.000Z') },
    ];

    assert.equal(countNew(rows, SEEN), 2);
  });

  it('counts nothing at all for somebody who has never shut it', () => {
    // The alternative is greeting a new member of staff by flagging all
    // twenty-one rows as fresh, which would be lying about all twenty-one.
    const rows = [{ createdAt: at('2020-01-01T00:00:00.000Z') }, { createdAt: at('2026-08-31T00:00:00.000Z') }];
    assert.equal(countNew(rows, null), 0);
  });

  it('does not hand back the row somebody was looking at as they closed it', () => {
    // Strictly after, not at-or-after: a line written in the same instant the
    // panel shut has already been read.
    assert.equal(countNew([{ createdAt: SEEN }], SEEN), 0);
  });

  it('reads an empty board as nought rather than as a gap', () => {
    assert.equal(countNew([], SEEN), 0);
  });
});

describe('isNew — the mark one row draws', () => {
  it('agrees with the count it is drawn beside', () => {
    const rows = [
      { createdAt: at('2026-08-29T00:00:00.000Z') },
      { createdAt: at('2026-08-31T00:00:00.000Z') },
    ];

    assert.deepEqual(
      rows.map((row) => isNew(row, SEEN)),
      [false, true],
    );
    assert.equal(rows.filter((row) => isNew(row, SEEN)).length, countNew(rows, SEEN));
  });

  it('marks nothing when nobody has ever looked', () => {
    assert.equal(isNew({ createdAt: at('2026-08-31T00:00:00.000Z') }, null), false);
  });
});
