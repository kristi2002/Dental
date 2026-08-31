/**
 * What has arrived on the reminder board since somebody last shut it.
 *
 * The board grew from two piles to seven and the badge stopped ever reading
 * nought. On a real practice sixteen of its twenty-one items had been sitting
 * for between two and five days — a booking request nobody has answered and a
 * shelf below its minimum do not clear themselves — so the number said the same
 * thing every morning. That is the failure the board exists to avoid, told
 * about the badge instead of about the colour: a signal that never changes is
 * one people stop reading.
 *
 * This does not shrink the board. Every one of those twenty-one things is real
 * and was invisible before. What it adds is the second sentence the board could
 * not say: *three of these are new since Friday.*
 *
 * **What cannot honestly be counted, and why it is left out.** A low shelf has
 * no birthday. Stock alerts are derived at read time from a quantity against a
 * minimum — that is the app's "derive, don't store" rule, and it is the right
 * rule — so nothing anywhere records the morning a material *became* low.
 * Answering "is this alert new" would mean persisting alert state, which is a
 * much larger change and a worse one. So the storage room is absent from this
 * count rather than guessed at, and the same goes for tomorrow's unreminded
 * patients, which is a list that empties and refills every single day and would
 * report itself as entirely new every morning by construction.
 *
 * Pure, so the rule can be tested without a database.
 */

/** Things with a birthday, which is what makes "new" answerable at all. */
export type Arrival = { createdAt: Date };

/**
 * How many of these arrived strictly after `seenAt`.
 *
 * Null `seenAt` — somebody who has never shut the board — counts nothing rather
 * than everything. Greeting a new member of staff by flagging all twenty-one
 * rows as fresh would be lying about all twenty-one, and the first close fixes
 * it for every morning after.
 *
 * Strictly after, so the row somebody was looking at as they closed the panel is
 * not handed back to them as news a second later.
 */
export function countNew(items: ReadonlyArray<Arrival>, seenAt: Date | null): number {
  if (!seenAt) return 0;

  let count = 0;
  for (const item of items) {
    if (item.createdAt.getTime() > seenAt.getTime()) count += 1;
  }
  return count;
}

/** The same question about one row, for the "new" mark a list draws. */
export function isNew(item: Arrival, seenAt: Date | null): boolean {
  return seenAt !== null && item.createdAt.getTime() > seenAt.getTime();
}
