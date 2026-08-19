/**
 * How long the activity log is kept, and why nothing deletes it.
 *
 * The trail records who opened which chart and who changed what — the evidence a
 * practice is asked for when a patient disputes their record. Dental records
 * carry a long statutory retention period in every jurisdiction this ships to,
 * so a trail kept for less time than the records it describes would leave those
 * records outliving the only account of who ever touched them.
 *
 * **Seven years is a floor, not an expiry.** The log is kept in the database
 * indefinitely and the Activity page can be asked about any of it. That is the
 * whole point: an archive nothing can query is a box in a cupboard, and "who
 * looked at this chart in 2021" has to be answerable by the person being asked,
 * at the desk, not by somebody restoring JSON lines off a backup volume.
 *
 * The cost of that choice is a table that grows, so it is worth being concrete:
 * a four-person practice writes on the order of a hundred and fifty entries a
 * day, which is roughly fifty thousand a year and a third of a million over
 * seven. Postgres does not notice a third of a million narrow rows, and the
 * indexes on `AuditLog` are chosen so the page's own queries stay index-only
 * rather than degrading as the table fills.
 *
 * The floor is what `prisma/prune-audit.ts` refuses to cross. Nothing in the
 * app, and nothing in the deploy, removes an entry — a trim is a deliberate act
 * somebody performs by hand, and it cannot take the log below this.
 */
export const AUDIT_RETENTION_MONTHS = 84;

/** Seven years, said the way a person would say it. */
export const AUDIT_RETENTION_YEARS = AUDIT_RETENTION_MONTHS / 12;

/**
 * The earliest date a by-hand prune may remove entries before.
 *
 * Month arithmetic done the way `addMonths` in `dates.ts` does it, and for the
 * same reason: `setUTCMonth(m - 84)` on the 29th of February lands on a date
 * that does not exist and JavaScript rolls it *forward*, which moves the cutoff
 * later and would allow a day more to be removed than the floor permits. A
 * retention floor may only ever err towards keeping things, so the day is
 * clamped to one that exists in the target month.
 */
export function auditCutoff(
  now: Date = new Date(),
  months: number = AUDIT_RETENTION_MONTHS,
): Date {
  const cutoff = new Date(now);
  const dayOfMonth = cutoff.getUTCDate();

  // To the first before changing month, so the intermediate value cannot
  // overflow on its own.
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);

  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(dayOfMonth, lastDay));

  return cutoff;
}
