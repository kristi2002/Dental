import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  auditCutoff,
  AUDIT_RETENTION_MONTHS,
  AUDIT_RETENTION_YEARS,
} from '../src/lib/audit-retention';

/**
 * The retention period is a policy, and it is written down in three places
 * because two of them cannot import the first: the deploy image carries neither
 * `tsx` nor the `src` tree, so `docker/prune-audit.mjs` has to restate the
 * number, and the by-hand script restates the cutoff arithmetic.
 *
 * Three copies of a number is how a policy quietly becomes two policies. These
 * assertions are what stops that.
 */
const BOOT_SCRIPT = path.join(process.cwd(), 'docker', 'prune-audit.mjs');
const HAND_SCRIPT = path.join(process.cwd(), 'prisma', 'prune-audit.ts');

describe('the activity log is kept for seven years', () => {
  it('is seven years, said in months', () => {
    assert.equal(AUDIT_RETENTION_MONTHS, 84);
    assert.equal(AUDIT_RETENTION_YEARS, 7);
  });

  it('the script that runs on boot agrees with the policy', async () => {
    const source = await readFile(BOOT_SCRIPT, 'utf8');
    const declared = /const DEFAULT_RETENTION_MONTHS\s*=\s*(\d+)/.exec(source);

    assert.ok(declared, 'docker/prune-audit.mjs declares no retention period');
    assert.equal(
      Number(declared[1]),
      AUDIT_RETENTION_MONTHS,
      'the deploy image would enforce a different period from the one the app states',
    );
  });

  it('the by-hand script defers to the policy rather than restating it', async () => {
    const source = await readFile(HAND_SCRIPT, 'utf8');

    assert.match(
      source,
      /AUDIT_RETENTION_MONTHS/,
      'prisma/prune-audit.ts should default to the shared constant',
    );
    assert.match(
      source,
      /auditCutoff\(/,
      'prisma/prune-audit.ts should use the shared cutoff, not its own month maths',
    );
  });

  /**
   * The bug this arithmetic exists to avoid. `setUTCMonth(m - 84)` on the 29th
   * of February names 29 February 2021, which is not a day — JavaScript rolls it
   * forward to 1 March, moving the cutoff *later* and deleting a day more than
   * the policy allows. A retention floor may only err towards keeping.
   */
  it('never moves the cutoff later than the policy allows', () => {
    const leapDay = new Date(Date.UTC(2028, 1, 29));
    const cutoff = auditCutoff(leapDay);

    assert.equal(cutoff.toISOString().slice(0, 10), '2021-02-28');
    assert.ok(
      cutoff <= new Date(Date.UTC(2021, 1, 28, 23, 59, 59)),
      'the cutoff must not roll into March',
    );
  });

  it('is exactly seven years back on an ordinary day', () => {
    const cutoff = auditCutoff(new Date(Date.UTC(2026, 7, 19)));
    assert.equal(cutoff.toISOString().slice(0, 10), '2019-08-19');
  });

  it('keeps the time of day, so the cutoff is an instant and not a date', () => {
    const now = new Date(Date.UTC(2026, 7, 19, 14, 30, 15, 250));
    const cutoff = auditCutoff(now);

    assert.equal(cutoff.getUTCHours(), 14);
    assert.equal(cutoff.getUTCMinutes(), 30);
    assert.equal(cutoff.getUTCSeconds(), 15);
  });

  it('honours an explicit period, for a prune to something other than the policy', () => {
    const cutoff = auditCutoff(new Date(Date.UTC(2026, 7, 19)), 24);
    assert.equal(cutoff.toISOString().slice(0, 10), '2024-08-19');
  });

  /**
   * Order of operations in the boot script, asserted because getting it the
   * other way round destroys evidence. Rows are written to the archive file and
   * only then deleted, so an interrupted run duplicates a line rather than
   * losing one.
   */
  it('the boot script writes the archive before it deletes', async () => {
    const source = await readFile(BOOT_SCRIPT, 'utf8');

    const appended = source.indexOf('appendFile(archive');
    const deleted = source.indexOf('DELETE FROM "AuditLog"');

    assert.ok(appended > -1, 'the boot script should archive');
    assert.ok(deleted > -1, 'the boot script should delete');
    assert.ok(appended < deleted, 'it must archive before it deletes, never after');
  });

  /**
   * Housekeeping must never be the reason a clinic cannot open. The script
   * catches its own failures, and the entrypoint tolerates the process failing
   * to start at all.
   */
  it('cannot take the deploy down', async () => {
    const [source, entrypoint] = await Promise.all([
      readFile(BOOT_SCRIPT, 'utf8'),
      readFile(path.join(process.cwd(), 'docker', 'entrypoint.sh'), 'utf8'),
    ]);

    assert.match(source, /main\(\)\.catch\(/, 'the boot script must swallow its own failures');
    assert.match(
      entrypoint,
      /prune-audit\.mjs \|\| true/,
      'the entrypoint must tolerate the prune failing outright',
    );
  });
});
