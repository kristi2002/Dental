/**
 * The tint a booking is drawn in on a time grid.
 *
 * One table, read by both the week grid and the month grid, so a status means
 * the same colour wherever it is seen. The left edge is a solid bar rather than
 * a full border: on a dense grid the bar is what the eye picks up while
 * scanning a column, and it survives being only a few millimetres tall.
 *
 * Cancelled is the odd one out — struck through and drained of colour, because
 * it occupies space on the grid without occupying the chair.
 */
export const STATUS_BLOCK: Record<string, string> = {
  SCHEDULED: 'border-l-brand bg-brand-soft text-ink',
  ARRIVED: 'border-l-accent-dark bg-accent-soft text-ink',
  COMPLETED: 'border-l-ok bg-ok-soft text-ink',
  CANCELLED: 'border-l-line-strong bg-paper text-ink-soft line-through',
  NO_SHOW: 'border-l-warn bg-warn-soft text-ink',
};

export function blockStyle(status: string): string {
  return STATUS_BLOCK[status] ?? STATUS_BLOCK.SCHEDULED;
}
