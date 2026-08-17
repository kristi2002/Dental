/**
 * The span a case covers, as the laboratory docket writes it.
 *
 * The paper register keeps this in one column — `3 x 4 x 7`, `5 x 7`,
 * `2 1 1 2 x x 5` — and it is not a list of teeth. It is a *run* of positions
 * across the arch, and each position is one of two things:
 *
 *   - a tooth that is there and is being worked on, written as its number;
 *   - a gap where the tooth is gone, written `x`, which the laboratory still
 *     makes an element for because a bridge has to span it.
 *
 * That is why the count in the `El.` column falls straight out of this column
 * and never had to be worked out separately: `5 x 7` is three elements, `2 1 1 2
 * x x 5` is seven. The practice has been doing that arithmetic by hand.
 *
 * Positions are stored FDI — quadrant digit, then the tooth's place from the
 * midline — because that is what the rest of the app stores (see `teeth.ts`) and
 * because `5` on its own is four different teeth. What gets *shown* is the
 * docket's own notation: the quadrant is drawn as a bracket round the digits,
 * which is how a dentist reads a span on paper.
 *
 *   stored   `15,16x,17`
 *   shown    `5 x 7` in the upper-right bracket
 *   elements 3
 *
 * Permanent teeth only. A milk tooth does not go to a laboratory for a crown,
 * and the docket's four rows of eight have nowhere to write one.
 */

import { PERMANENT_TEETH, quadrantOf, type ToothQuadrant } from './teeth';

/**
 * One place in the span: a tooth, or the gap where one used to be.
 *
 * `pontic` is the `x` on the docket. It carries a tooth number all the same —
 * the position in the arch is exactly what makes it a gap rather than a note —
 * so the span survives a round trip and can be drawn back onto the chart.
 */
export type SpanPosition = { toothNum: number; pontic: boolean };

/** Reading order across both arches, right to left, upper before lower. */
const SPAN_ORDER = new Map(PERMANENT_TEETH.map((toothNum, index) => [toothNum, index]));

/** Long enough for every tooth in the mouth twice over, short enough that a
 *  pasted essay is not split into ten thousand parts before being thrown away. */
const RAW_LIMIT = 256;

/** Whether a span may name this tooth at all. */
export function isSpanTooth(toothNum: number): boolean {
  return SPAN_ORDER.has(toothNum);
}

/** The digit the docket writes — the tooth's place from the midline, 1–8. */
export function spanDigit(toothNum: number): number {
  return toothNum % 10;
}

/**
 * Read a stored span. Anything unrecognisable is dropped rather than guessed at,
 * for the reason `universalToFdi` refuses to guess: a wrong tooth is worse than
 * a missing one.
 *
 * A tooth named twice merges rather than appearing twice, and merges towards
 * the gap — `16,16x` is one position and the `x` is the deliberate half of it.
 */
export function parseToothSpan(value: string | null | undefined): SpanPosition[] {
  if (!value) return [];

  const found = new Map<number, boolean>();
  for (const part of value.slice(0, RAW_LIMIT).split(',')) {
    const token = part.trim().toLowerCase();
    const match = /^(\d{2})(x?)$/.exec(token);
    if (!match) continue;

    const toothNum = Number.parseInt(match[1], 10);
    if (!isSpanTooth(toothNum)) continue;

    found.set(toothNum, found.get(toothNum) === true || match[2] === 'x');
  }

  return sortSpan([...found].map(([toothNum, pontic]) => ({ toothNum, pontic })));
}

/** Back to the stored form, in chart order so the string reads as the row does. */
export function formatToothSpan(positions: readonly SpanPosition[]): string {
  return sortSpan(positions)
    .map((position) => `${position.toothNum}${position.pontic ? 'x' : ''}`)
    .join(',');
}

/**
 * How many elements the span is.
 *
 * Every position counts, gaps included — that is the whole point of writing the
 * gaps down. This is the figure the laboratory bills on and the one the register
 * exists to be able to check an invoice against.
 */
export function spanElements(value: string | null | undefined): number {
  return parseToothSpan(value).length;
}

/**
 * The span split into the quadrants it crosses, each in the order the docket
 * writes it.
 *
 * Four quadrants rather than one long run because that is the only way the
 * digits mean anything: `5 x 7` is a bridge in one corner of the mouth, and the
 * same three positions read across the midline would be a different case
 * entirely. A span that stays in one quadrant — nearly all of them — comes back
 * as a single group.
 */
export function spanQuadrants(
  value: string | null | undefined,
): Array<{ quadrant: ToothQuadrant; positions: SpanPosition[] }> {
  const groups: Array<{ quadrant: ToothQuadrant; positions: SpanPosition[] }> = [];

  for (const position of parseToothSpan(value)) {
    const quadrant = quadrantOf(position.toothNum);
    const last = groups.at(-1);
    // Chart order already runs one quadrant at a time, so a new corner of the
    // mouth is always a new group and never reopens a closed one.
    if (last?.quadrant === quadrant) last.positions.push(position);
    else groups.push({ quadrant, positions: [position] });
  }

  return groups;
}

/**
 * The span in plain text, as FDI codes: `15, 16x, 17`.
 *
 * For the export and for anything read aloud rather than looked at. The drawn
 * notation needs its bracket to say which corner of the mouth it means, and a
 * bracket does not survive a spreadsheet cell — a two-digit code says the same
 * thing on its own.
 */
export function spanCodes(value: string | null | undefined): string {
  return parseToothSpan(value)
    .map((position) => `${position.toothNum}${position.pontic ? 'x' : ''}`)
    .join(', ');
}

/**
 * What one press on the chart does: nothing → the tooth → the gap → nothing.
 *
 * Three states on one target rather than a tooth button and a separate gap
 * button, because the two are the same decision — "this position is in the
 * span, and here is what is standing in it" — and because the docket writes them
 * in the same column. Pressing past the gap clears the position, so a mistake is
 * undone by carrying on rather than by finding a second control.
 */
export function toggleSpanTooth(
  positions: readonly SpanPosition[],
  toothNum: number,
): SpanPosition[] {
  if (!isSpanTooth(toothNum)) return sortSpan(positions);

  const current = positions.find((position) => position.toothNum === toothNum);
  if (!current) return sortSpan([...positions, { toothNum, pontic: false }]);

  if (!current.pontic) {
    return sortSpan(
      positions.map((position) =>
        position.toothNum === toothNum ? { toothNum, pontic: true } : position,
      ),
    );
  }

  return sortSpan(positions.filter((position) => position.toothNum !== toothNum));
}

/** Chart order, and one entry per tooth — the invariant everything else assumes. */
function sortSpan(positions: readonly SpanPosition[]): SpanPosition[] {
  const found = new Map<number, boolean>();
  for (const position of positions) {
    if (!isSpanTooth(position.toothNum)) continue;
    found.set(position.toothNum, found.get(position.toothNum) === true || position.pontic);
  }

  return [...found]
    .map(([toothNum, pontic]) => ({ toothNum, pontic }))
    .sort((a, b) => SPAN_ORDER.get(a.toothNum)! - SPAN_ORDER.get(b.toothNum)!);
}
