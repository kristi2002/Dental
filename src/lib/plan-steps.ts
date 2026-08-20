/**
 * The order of a course of treatment, worked out in one place.
 *
 * Reordering used to be a neighbour swap posted to the server, one click per
 * position: moving the eighth step to the front was seven round trips, seven
 * full-layout revalidations, and seven chances for the row to slide out from
 * under the button being pressed. The list now moves in the browser and the
 * finished order is saved once, which means the arithmetic has to exist
 * somewhere both the client and the action can reach — and somewhere it can be
 * tested without a database.
 */

/** The four ways a step is asked to move. */
export type StepMove = 'up' | 'down' | 'top' | 'bottom';

/**
 * Where a step ends up. Clamped rather than refused: "move up" on the first row
 * is a no-op, not an error, and the caller should not have to know which row it
 * is holding to ask.
 */
export function targetIndex(from: number, move: StepMove, length: number): number {
  const last = Math.max(0, length - 1);
  switch (move) {
    case 'up':
      return Math.max(0, from - 1);
    case 'down':
      return Math.min(last, from + 1);
    case 'top':
      return 0;
    case 'bottom':
      return last;
  }
}

/**
 * The list with one item lifted out and put back down at `to`.
 *
 * Not a swap. A swap is only the same thing for neighbours, and it is wrong for
 * every drag longer than one row: dropping step 8 at the top with a swap leaves
 * step 1 sitting at the bottom, which is not what anybody dragging it meant.
 */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;

  const clamped = Math.max(0, Math.min(next.length - 1, to));
  const [lifted] = next.splice(from, 1);
  next.splice(clamped, 0, lifted);
  return next;
}

/**
 * The writes that turn a stored order into the requested one.
 *
 * Positions come out as a dense `1..n`, which is the repair as much as the
 * reorder: the old swap left whatever gaps the sequence had already grown, and
 * a deleted step left one behind every time. Only the rows that actually move
 * are returned — reordering the tail of a plan should not rewrite its head.
 *
 * Anything in `orderedIds` that is not a real step is ignored, and any step the
 * caller forgot to mention keeps its place at the end, in its existing order.
 * A stale browser tab posting yesterday's list can therefore misorder a plan,
 * which is recoverable, but it can never drop a step out of one.
 */
export function positionWrites(
  orderedIds: readonly string[],
  steps: readonly { id: string; position: number }[],
): Array<{ id: string; position: number }> {
  const known = new Map(steps.map((step) => [step.id, step.position]));

  const named = orderedIds.filter((id, index) => known.has(id) && orderedIds.indexOf(id) === index);
  const missing = steps
    .filter((step) => !named.includes(step.id))
    .sort((a, b) => a.position - b.position)
    .map((step) => step.id);

  return [...named, ...missing]
    .map((id, index) => ({ id, position: index + 1 }))
    .filter((write) => known.get(write.id) !== write.position);
}
