/**
 * How long the activity log is kept.
 *
 * Seven years, as a policy rather than a preference. The trail records who
 * opened which chart and who changed what, which is the evidence a practice is
 * asked for when a patient disputes their record — and dental records carry a
 * long statutory retention period in every jurisdiction this ships to. Keeping
 * the trail for less time than the records it describes would leave those
 * records outliving the only account of who ever touched them.
 *
 * It is also the one table with no natural bound: append-only, written by nearly
 * every mutation plus every login, logout and refused permission check, and
 * never trimmed by anything in the app. On a clinic mini-PC that is a disk which
 * fills quietly over a few years.
 *
 * Enforced on boot by `docker/prune-audit.mjs`, which archives before it
 * deletes. `prisma/prune-audit.ts` is the same job run by hand.
 *
 * This constant is the single source of the number. Two scripts outside the
 * TypeScript build need it as well and cannot import it — the deploy image
 * carries neither `tsx` nor the `src` tree — so each restates it and
 * `tests/audit-retention.test.ts` fails if the three ever disagree.
 */
export const AUDIT_RETENTION_MONTHS = 84;

/** Seven years, said the way a person would say it. */
export const AUDIT_RETENTION_YEARS = AUDIT_RETENTION_MONTHS / 12;

/**
 * The date before which entries may be removed.
 *
 * Month arithmetic done the way `addMonths` in `dates.ts` does it, and for the
 * same reason: `setUTCMonth(m - 84)` on the 29th of February lands on a date
 * that does not exist and JavaScript rolls it *forward*, which moves the cutoff
 * later and deletes a day more than the policy allows. A retention floor may
 * only ever err towards keeping things, so the day is clamped to one that
 * exists in the target month.
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
