import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOTH_VIEW, toothOutlines, toothProportions } from '../src/components/dental/ToothGlyph';
import { ALL_TEETH, PERMANENT_TEETH, toothKind } from '../src/lib/teeth';

/**
 * The odontogram draws each tooth from a table of millimetre measurements, and
 * that table is the kind of thing somebody adjusts by hand later. Two ways it
 * can go wrong quietly:
 *
 *  - a number nudged too far puts part of a tooth **outside its own cell**,
 *    where it is drawn over the teeth either side rather than clipped away;
 *  - a number nudged the wrong *way* leaves every tooth on the page in its box
 *    and the mouth anatomically nonsense — a molar narrower than an incisor.
 *
 * Neither throws, and both look plausible in a diff. So the invariants that
 * make an odontogram readable are asserted here instead.
 */

/** Every point a cubic path actually passes through, flattened. */
function pointsOn(d: string): Array<[number, number]> {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  assert.ok(
    numbers.every(Number.isFinite),
    `path contains a value that is not a number: ${d.slice(0, 80)}`,
  );

  // `M x y` then repeating `C c1x c1y c2x c2y x y` — the only two commands the
  // spline builder emits.
  const points: Array<[number, number]> = [];
  let from: [number, number] = [numbers[0], numbers[1]];
  points.push(from);

  for (let i = 2; i + 5 < numbers.length; i += 6) {
    const [c1x, c1y, c2x, c2y, x, y] = numbers.slice(i, i + 6);
    for (let step = 1; step <= 12; step++) {
      const t = step / 12;
      const u = 1 - t;
      points.push([
        u ** 3 * from[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * x,
        u ** 3 * from[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * y,
      ]);
    }
    from = [x, y];
  }
  return points;
}

describe('tooth drawings', () => {
  it('keep every tooth inside its own cell', () => {
    const right = TOOTH_VIEW.x + TOOTH_VIEW.w;
    const bottom = TOOTH_VIEW.y + TOOTH_VIEW.h;

    for (const toothNum of ALL_TEETH) {
      for (const d of toothOutlines(toothNum)) {
        for (const [x, y] of pointsOn(d)) {
          assert.ok(
            x >= TOOTH_VIEW.x && x <= right && y >= TOOTH_VIEW.y && y <= bottom,
            `tooth ${toothNum} is drawn at ${x.toFixed(1)},${y.toFixed(1)}, outside the ` +
              `${TOOTH_VIEW.x}…${right} by ${TOOTH_VIEW.y}…${bottom} band`,
          );
        }
      }
    }
  });

  it('draw the mouth in the proportions it is actually in', () => {
    const width = (toothNum: number) => toothProportions(toothNum).width;
    const length = (toothNum: number) => toothProportions(toothNum).length;

    // A row of teeth is read mostly by relative size, so these are the
    // differences that have to survive any retouching of the table.
    assert.ok(width(46) > width(41) * 2, 'a lower first molar is more than twice an incisor');
    assert.ok(width(11) > width(12), 'an upper central is wider than its lateral');
    assert.ok(width(32) > width(31), 'a lower lateral is wider than its central');
    assert.ok(width(16) > width(17) && width(17) > width(18), 'molars shrink going back');
    assert.ok(width(64) < width(65), 'a primary first molar is smaller than the second');

    for (const toothNum of PERMANENT_TEETH) {
      if (toothKind(toothNum) === 'CANINE') continue;
      const canine = Math.floor(toothNum / 10) * 10 + 3;
      assert.ok(
        length(canine) > length(toothNum),
        `the canine should be longer than tooth ${toothNum} — it is the longest in the mouth`,
      );
    }
  });

  it('give a tooth mesial and distal sides that differ', () => {
    // Everything is drawn with mesial to the right and mirrored for the other
    // side of the mouth. If a silhouette came out symmetrical the mirror would
    // be invisible and half the point of drawing real teeth would be gone — so
    // check the landmark that carries the asymmetry: an incisor contacts its
    // neighbour higher on the mesial than on the distal.
    for (const toothNum of [11, 12, 31, 32]) {
      const points = pointsOn(toothOutlines(toothNum)[0]);
      const distal = points.reduce((a, b) => (b[0] < a[0] ? b : a));
      const mesial = points.reduce((a, b) => (b[0] > a[0] ? b : a));
      assert.ok(
        mesial[1] - distal[1] > 2,
        `tooth ${toothNum} has its contact points at the same height on both sides`,
      );
    }
  });
});
