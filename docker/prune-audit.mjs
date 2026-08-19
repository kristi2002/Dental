/**
 * Enforce the activity log's retention period, on boot.
 *
 * The policy is seven years — see `src/lib/audit-retention.ts`, which is where
 * that number is decided. This is the copy that runs in the deploy image, and it
 * exists as its own file for the reason `create-owner.mjs` does: the runtime
 * stage carries neither `tsx` nor the `src` tree, so `prisma/prune-audit.ts`
 * cannot run there. `tests/audit-retention.test.ts` fails if the two drift.
 *
 * **Archives before it deletes.** A retention period is a policy, and a policy
 * that quietly destroys the only record of who opened a chart is not one anybody
 * would have agreed to. Rows are written out as JSON lines to the persistent
 * volume first, so "who changed this in 2019" stays answerable from a file once
 * it stops being answerable from the app. Nothing is removed that was not
 * written out first — the loop archives a batch, then deletes exactly that
 * batch, so an interrupted run leaves the two in step rather than ahead.
 *
 * Never fails the boot. A clinic that cannot start because a housekeeping job
 * could not write a file is a far worse outcome than a log that is a fortnight
 * over its retention period.
 *
 * Run by `entrypoint.sh` after the schema sync. Set `AUDIT_PRUNE=false` to skip
 * it, or `AUDIT_RETENTION_MONTHS` to override the period.
 *
 * Uses only `node:fs`, `node:path` and `pg`, all of which the runtime has.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

/**
 * Seven years. Must match `AUDIT_RETENTION_MONTHS` in
 * `src/lib/audit-retention.ts` — a test asserts that it does.
 */
const DEFAULT_RETENTION_MONTHS = 84;

/** Small enough that a first prune of a decade never holds the table for long. */
const BATCH = 1000;

const months = Number(process.env.AUDIT_RETENTION_MONTHS) || DEFAULT_RETENTION_MONTHS;
const archiveDir = process.env.AUDIT_ARCHIVE_DIR || '/data/audit-archive';

/**
 * Must match `auditCutoff` in `src/lib/audit-retention.ts`.
 *
 * Day-of-month clamped rather than allowed to overflow: `setUTCMonth(m - 84)` on
 * the 29th of February names a date that does not exist and JavaScript rolls it
 * forward, which moves the cutoff later and deletes a day more than the policy
 * permits. A retention floor may only err towards keeping things.
 */
function auditCutoff(now, retentionMonths) {
  const cutoff = new Date(now);
  const dayOfMonth = cutoff.getUTCDate();

  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);

  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(dayOfMonth, lastDay));

  return cutoff;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[prune-audit] DATABASE_URL is not set — skipping.');
    return;
  }

  const cutoff = auditCutoff(new Date(), months);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: counted } = await client.query(
      'SELECT COUNT(*)::int AS count FROM "AuditLog" WHERE "createdAt" < $1',
      [cutoff],
    );
    const stale = counted[0].count;

    if (stale === 0) {
      console.log(
        `[prune-audit] nothing older than ${months} months (before ${cutoff
          .toISOString()
          .slice(0, 10)}).`,
      );
      return;
    }

    await mkdir(archiveDir, { recursive: true });
    const archive = path.join(
      archiveDir,
      `audit-${new Date().toISOString().slice(0, 10)}.jsonl`,
    );

    console.log(
      `[prune-audit] ${stale} entries older than ${months} months — archiving to ${archive}`,
    );

    let moved = 0;
    for (;;) {
      // Oldest first, and re-queried each time rather than paged with OFFSET:
      // the previous batch has been deleted, so the next oldest rows are always
      // at the start again. Paging would skip a batch for every batch removed.
      const { rows } = await client.query(
        `SELECT * FROM "AuditLog" WHERE "createdAt" < $1 ORDER BY "createdAt" ASC LIMIT $2`,
        [cutoff, BATCH],
      );
      if (rows.length === 0) break;

      // Written first. If the process dies here the rows are still in the
      // database and the next boot archives them again — a duplicated line in an
      // archive file is recoverable, a deleted row is not.
      await appendFile(archive, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');

      await client.query('DELETE FROM "AuditLog" WHERE id = ANY($1::text[])', [
        rows.map((row) => row.id),
      ]);

      moved += rows.length;
    }

    console.log(`[prune-audit] archived and removed ${moved} entries.`);
  } finally {
    await client.end();
  }
}

// Never fatal — see the note at the top. The message is loud enough to find in
// the logs, and the practice starts either way.
main().catch((error) => {
  console.error('[prune-audit] failed, leaving the log untouched:', error.message);
});
