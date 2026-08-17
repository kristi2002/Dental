import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatToothSpan,
  isSpanTooth,
  parseToothSpan,
  spanCodes,
  spanDigit,
  spanElements,
  spanQuadrants,
  toggleSpanTooth,
} from '../src/lib/tooth-span';

/** The docket's own shorthand, spelled out in what the app stores. */
const tooth = (toothNum: number) => ({ toothNum, pontic: false });
const gap = (toothNum: number) => ({ toothNum, pontic: true });

describe('parseToothSpan — reading a span off the docket', () => {
  it('keeps the run in chart order however it was written down', () => {
    assert.deepEqual(parseToothSpan('17,15,16x'), [tooth(17), gap(16), tooth(15)]);
  });

  it('reads the two arches upper first, right before left', () => {
    const span = parseToothSpan('31,11,41,21');
    assert.deepEqual(
      span.map((position) => position.toothNum),
      [11, 21, 41, 31],
    );
  });

  it('merges a tooth named twice, towards the gap', () => {
    assert.deepEqual(parseToothSpan('16,16x'), [gap(16)]);
    assert.deepEqual(parseToothSpan('16x,16'), [gap(16)]);
  });

  it('drops anything that is not a tooth rather than guessing at it', () => {
    assert.deepEqual(parseToothSpan(''), []);
    assert.deepEqual(parseToothSpan(null), []);
    assert.deepEqual(parseToothSpan('19,29,39,49'), [], 'FDI has no ninth position');
    assert.deepEqual(parseToothSpan('5,x,abc,1.5'), [], 'a bare digit is four teeth, not one');
    assert.deepEqual(parseToothSpan('55,65,75,85'), [], 'a milk tooth is not sent to a laboratory');
  });
});

describe('formatToothSpan — what gets stored', () => {
  it('round-trips a span through the column it lives in', () => {
    // Stored the way the docket writes it: the right-hand quadrants run
    // inwards towards the midline, so 7 6 5 and not 5 6 7.
    const raw = '17,16x,15';
    assert.equal(formatToothSpan(parseToothSpan(raw)), raw);
  });

  it('writes chart order no matter the order the chart was pressed in', () => {
    assert.equal(formatToothSpan([tooth(15), tooth(17), gap(16)]), '17,16x,15');
    assert.equal(formatToothSpan([tooth(27), tooth(25), gap(26)]), '25,26x,27', 'and outwards on the left');
  });

  it('never stores the same position twice', () => {
    assert.equal(formatToothSpan([tooth(16), tooth(16), gap(16)]), '16x');
  });
});

describe('spanElements — the figure the laboratory bills on', () => {
  // Straight off the register in the photograph: the El. column is the length
  // of the Diagnoza column, gaps counted, and always has been.
  it('counts every position, gaps included — that is what the gaps are for', () => {
    assert.equal(spanElements('15,16x,17'), 3, '5 x 7');
    assert.equal(spanElements('13,14x,15x,16x,17'), 5, '3 x x x 7');
    assert.equal(spanElements('17'), 1, 'a single crown');
  });

  it('counts a run that crosses the midline as one span', () => {
    // 2 1 | 1 2 x x 5 — seven elements on one bridge.
    assert.equal(spanElements('12,11,21,22,23x,24x,25'), 7);
  });

  it('counts nothing as nothing, so an unpicked row is not billed as one', () => {
    assert.equal(spanElements(''), 0);
    assert.equal(spanElements(null), 0);
  });
});

describe('spanQuadrants — which corner of the mouth each run is in', () => {
  it('leaves a span that stays in one quadrant as one group', () => {
    const groups = spanQuadrants('15,16x,17');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].quadrant, 'UPPER_RIGHT');
    assert.deepEqual(
      groups[0].positions.map((position) => spanDigit(position.toothNum)),
      [7, 6, 5],
      'the docket writes the upper right outwards-in',
    );
  });

  it('splits a span at the midline, because the digits repeat across it', () => {
    const groups = spanQuadrants('11,12,21,22');
    assert.deepEqual(
      groups.map((group) => group.quadrant),
      ['UPPER_RIGHT', 'UPPER_LEFT'],
    );
    assert.deepEqual(
      groups.map((group) => group.positions.map((position) => spanDigit(position.toothNum))),
      [
        [2, 1],
        [1, 2],
      ],
    );
  });

  it('keeps the arches apart even when the same digits are in both', () => {
    const groups = spanQuadrants('16,46');
    assert.deepEqual(
      groups.map((group) => group.quadrant),
      ['UPPER_RIGHT', 'LOWER_RIGHT'],
    );
  });
});

describe('toggleSpanTooth — one press on the chart', () => {
  it('cycles the position: nothing, the tooth, the gap, nothing again', () => {
    let span = toggleSpanTooth([], 16);
    assert.deepEqual(span, [tooth(16)]);

    span = toggleSpanTooth(span, 16);
    assert.deepEqual(span, [gap(16)], 'the second press says the tooth is gone');

    span = toggleSpanTooth(span, 16);
    assert.deepEqual(span, [], 'the third clears it, so a mistake is undone by carrying on');
  });

  it('leaves the rest of the span alone', () => {
    const span = toggleSpanTooth([tooth(15), tooth(16), tooth(17)], 16);
    assert.deepEqual(span, [tooth(17), gap(16), tooth(15)]);
  });

  it('keeps the run in chart order however it is built up', () => {
    const span = [17, 15, 16].reduce(toggleSpanTooth, [] as ReturnType<typeof parseToothSpan>);
    assert.equal(formatToothSpan(span), '17,16,15');
  });

  it('refuses a tooth a span cannot name', () => {
    assert.deepEqual(toggleSpanTooth([], 19), []);
    assert.deepEqual(toggleSpanTooth([], 55), [], 'no milk teeth');
  });
});

describe('spanCodes / isSpanTooth — the span in plain text', () => {
  it('writes FDI codes, which say which corner they mean on their own', () => {
    assert.equal(spanCodes('15,16x,17'), '17, 16x, 15');
    assert.equal(spanCodes(''), '');
  });

  it('knows which teeth a lab case may name', () => {
    assert.equal(isSpanTooth(18), true);
    assert.equal(isSpanTooth(38), true);
    assert.equal(isSpanTooth(19), false);
    assert.equal(isSpanTooth(51), false);
  });
});
