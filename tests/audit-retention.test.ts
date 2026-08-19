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
 * The activity log is kept in the database indefinitely so the Activity page can
 * be asked about any of it, and seven years is the floor below which a by-hand
 * trim may not go. These assertions guard both halves: that nothing acquires the
 * ability to delete entries on its own, and that the floor cannot be argued down
 * with a flag.
 */
const HAND_SCRIPT = path.join(process.cwd(), 'prisma', 'prune-audit.ts');
const ENTRYPOINT = path.join(process.cwd(), 'docker', 'entrypoint.sh');
const DOCKERFILE = path.join(process.cwd(), 'Dockerfile');

describe('the activity log is kept, not expired', () => {
  it('states the floor as seven years', () => {
    assert.equal(AUDIT_RETENTION_MONTHS, 84);
    assert.equal(AUDIT_RETENTION_YEARS, 7);
  });

  /**
   * The property the whole design turns on. An earlier pass had the deploy prune
   * the log on every boot, archiving past seven years to the volume — which made
   * the trail correct and unqueryable at the same time, since the app can only
   * ask the database. Nothing may quietly reacquire that.
   */
  it('nothing in the deploy removes an entry', async () => {
    const [entrypoint, dockerfile] = await Promise.all([
      readFile(ENTRYPOINT, 'utf8'),
      readFile(DOCKERFILE, 'utf8'),
    ]);

    assert.doesNotMatch(
      entrypoint.replace(/^\s*#.*$/gm, ''),
      /prune/i,
      'the entrypoint must not prune the activity log',
    );
    assert.doesNotMatch(
      dockerfile.replace(/^\s*#.*$/gm, ''),
      /prune/i,
      'the runtime image must not carry a pruning script',
    );
  });

  it('the only thing that can trim it is run by hand', async () => {
    const source = await readFile(HAND_SCRIPT, 'utf8');

    // A dry run by default is what makes this safe to point at a live database.
    assert.match(
      source,
      /const APPLY = args\.includes\('--apply'\)/,
      'the by-hand script must require --apply before it deletes',
    );
  });

  it('refuses to trim below the floor', async () => {
    const source = await readFile(HAND_SCRIPT, 'utf8');

    assert.match(
      source,
      /if \(MONTHS < AUDIT_RETENTION_MONTHS\)/,
      'the by-hand script must refuse a period under the floor',
    );
    assert.match(source, /process\.exit\(1\)/, 'and refuse it by exiting, not by warning');
  });

  it('defers to the shared policy rather than restating it', async () => {
    const source = await readFile(HAND_SCRIPT, 'utf8');

    assert.match(source, /AUDIT_RETENTION_MONTHS/, 'should default to the shared constant');
    assert.match(source, /auditCutoff\(/, 'should use the shared cutoff, not its own maths');
  });

  /**
   * The bug this arithmetic exists to avoid. `setUTCMonth(m - 84)` on the 29th
   * of February names 29 February 2021, which is not a day — JavaScript rolls it
   * forward to 1 March, moving the cutoff *later* and putting a day inside the
   * removable window that the floor says must be kept.
   */
  it('never moves the cutoff later than the floor allows', () => {
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

  it('honours a longer period, for a trim that keeps more than the floor', () => {
    const cutoff = auditCutoff(new Date(Date.UTC(2026, 7, 19)), 120);
    assert.equal(cutoff.toISOString().slice(0, 10), '2016-08-19');
  });
});

/**
 * A log kept for ever is only worth keeping if it can be read. These cover the
 * page that reads it: before this, it fetched the newest hundred rows and had no
 * pagination and no date filter at all, so a decade of evidence was stored and
 * roughly two days of it were reachable.
 */
describe('the activity page can reach what is kept', () => {
  const PAGE = path.join(process.cwd(), 'src', 'app', '[locale]', '(app)', 'activity', 'page.tsx');

  it('pages rather than truncating', async () => {
    const source = await readFile(PAGE, 'utf8');

    assert.match(source, /skip:\s*\(pageNumber - 1\) \* PAGE_SIZE/, 'should skip by page');
    assert.match(source, /auditLog\.count\(/, 'should count the whole result set, not the page');
    assert.match(source, /pageOf/, 'should tell the reader where they are');
  });

  it('filters by date, so reaching 2021 is not five thousand clicks', async () => {
    const source = await readFile(PAGE, 'utf8');

    assert.match(source, /fromDay/, 'should accept a lower bound');
    assert.match(source, /toDay/, 'should accept an upper bound');
    // The upper bound is inclusive: same date twice must mean that whole day.
    assert.match(
      source,
      /86_400_000/,
      'the upper bound should cover the whole of its day',
    );
  });

  it('filters by person, including people who have left', async () => {
    const source = await readFile(PAGE, 'utf8');

    assert.match(source, /staffUser\.findMany/, 'should offer the people who wrote entries');
    assert.doesNotMatch(
      source,
      /staffUser\.findMany\(\{[^}]*active:\s*true/s,
      'filtering a trail by actor is most useful about somebody who has left',
    );
  });

  it('the index the page needs exists', async () => {
    const schema = await readFile(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const auditModel = /model AuditLog \{([\s\S]*?)^\}/m.exec(schema);

    assert.ok(auditModel, 'AuditLog should be in the schema');
    assert.match(
      auditModel[1],
      /@@index\(\[entity, createdAt\]\)/,
      'entity + newest-first is the page\'s own query, and the table is never trimmed',
    );
  });
});
