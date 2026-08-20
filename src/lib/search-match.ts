import { fold } from './patient-search';

/**
 * How well a piece of text answers what somebody typed.
 *
 * `matches()` in `utils.ts` answers yes or no, on the whole string at once, and
 * that is the right shape for filtering a table column. It is the wrong shape
 * for a search box that shows a *list*: "stock lab" found nothing at all,
 * because no single run of characters in "Stock · Labels" spells it, and "pl"
 * put every screen with a `pl` buried in it above the one called Plans.
 *
 * So: each word typed has to be found somewhere, and where it is found decides
 * the order. A whole word beats the start of a word, which beats the middle of
 * one — that is the order a person reading the list expects, and it is why
 * typing "st" offers Stock before Prescriptions.
 */

/** Word boundaries: anything that is not a letter or a digit — including the `·` a nested screen is named with. */
const NOT_WORD = /[^\p{L}\p{N}]+/u;

const WHOLE_WORD = 3;
const WORD_START = 2;
const INSIDE_WORD = 1;

/** Everything typed, from the very start of the text: "plan" against "Plans". */
const FROM_THE_TOP = 4;

/**
 * A score for `text` against `query`, or `null` when a word was typed that this
 * text does not contain at all. Higher is a better answer; an empty query
 * scores zero rather than failing, so an unfiltered list stays in its own order.
 */
export function scoreMatch(text: string, query: string): number | null {
  const haystack = fold(text);
  const needle = fold(query);
  if (needle.length === 0) return 0;

  const words = haystack.split(NOT_WORD).filter(Boolean);
  let score = 0;

  // Every word typed must land. Typing more words narrows the list; it never
  // widens it, which is what makes a second word worth typing.
  for (const token of needle.split(' ')) {
    let best = 0;
    for (const word of words) {
      if (word === token) best = Math.max(best, WHOLE_WORD);
      else if (word.startsWith(token)) best = Math.max(best, WORD_START);
      else if (word.includes(token)) best = Math.max(best, INSIDE_WORD);
    }
    if (best === 0) return null;
    score += best;
  }

  return haystack.startsWith(needle) ? score + FROM_THE_TOP : score;
}

/**
 * The items that match, best first, ties left in the order they came in.
 *
 * The tie-break is explicit rather than leaning on a stable sort, because the
 * order it preserves is a decision: the rail's own order is the order the
 * practice reads its screens in, and two equally good matches should still come
 * out that way round.
 */
export function rankMatches<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreMatch(textOf(item), query) }))
    .filter((row): row is { item: T; index: number; score: number } => row.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}
