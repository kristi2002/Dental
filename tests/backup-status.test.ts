import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BACKUP_CRITICAL_HOURS,
  BACKUP_LATE_HOURS,
  type BackupRun,
  formatBytes,
  parseRun,
  parseVerification,
  severityOf,
} from '../src/lib/backup-status';

/**
 * The backup sidecar writes two small JSON files; this module reads them and
 * decides how loudly to say something. Both halves are worth testing without a
 * container, and for opposite reasons.
 *
 * The **parsing** is defensive because its input is produced by a shell script
 * in another container, on a volume that may not be mounted. A malformed status
 * file must never take the Staff page down, and — much more subtly — must never
 * be mistaken for a healthy one.
 *
 * The **verdict** is the decision the red banner is built on, which means a
 * mistake in it is invisible in exactly the situation it exists for: the app
 * would look calm while the backups were dead.
 */

const HOUR = 3_600_000;
const NOW = new Date('2026-08-20T12:00:00Z');

function run(overrides: Partial<BackupRun> = {}): BackupRun {
  return {
    state: 'ok',
    message: '',
    finishedAt: NOW,
    lastSuccessAt: NOW,
    durationSeconds: 12,
    dump: { file: 'dentorganizer-20260820-020000.dump', bytes: 1024 },
    files: { count: 10, bytes: 2048 },
    offsite: { configured: true, repository: 's3:example/bucket', snapshotId: 'ab12cd34', snapshotCount: 30 },
    ...overrides,
  };
}

describe('severityOf', () => {
  it('is quiet when the last copy is recent', () => {
    assert.equal(severityOf(run({ lastSuccessAt: new Date(NOW.getTime() - 6 * HOUR) }), NOW), 'ok');
  });

  it('reports nothing at all when no status file has ever been written', () => {
    // Distinct from "failing": in development there is no sidecar and no
    // volume, and treating that as an emergency would train everyone to ignore
    // the banner before it ever meant anything.
    assert.equal(severityOf(null, NOW), 'unknown');
  });

  it('treats a sidecar that has never once succeeded as critical', () => {
    // It has run and written a file, so it exists — and it has never produced a
    // backup. That is the worst state available and there is no grace period
    // for it.
    assert.equal(severityOf(run({ state: 'failed', lastSuccessAt: null }), NOW), 'critical');
  });

  /**
   * The heart of it: age is measured from the last **success**, never from the
   * last attempt.
   *
   * A sidecar failing every twelve hours since Tuesday is running perfectly and
   * protecting nothing. Judged by `finishedAt` it would look punctual, and the
   * practice would see a green light on a week-old backup.
   */
  it('measures age from the last success, not the last attempt', () => {
    const punctualButUseless = run({
      state: 'failed',
      finishedAt: NOW,
      lastSuccessAt: new Date(NOW.getTime() - 5 * 24 * HOUR),
    });
    assert.equal(severityOf(punctualButUseless, NOW), 'critical');
  });

  it('warns once a copy is later than the schedule can explain', () => {
    const late = run({ lastSuccessAt: new Date(NOW.getTime() - (BACKUP_LATE_HOURS + 1) * HOUR) });
    assert.equal(severityOf(late, NOW), 'late');
  });

  it('does not warn inside the ordinary gap between the two daily runs', () => {
    // 02:00 and 13:00 means the longest healthy gap is thirteen hours. A
    // threshold below that would fire every single night.
    const overnight = run({ lastSuccessAt: new Date(NOW.getTime() - 13 * HOUR) });
    assert.equal(severityOf(overnight, NOW), 'ok');
  });

  it('escalates to critical after two missed days', () => {
    const stale = run({ lastSuccessAt: new Date(NOW.getTime() - BACKUP_CRITICAL_HOURS * HOUR) });
    assert.equal(severityOf(stale, NOW), 'critical');
  });

  it('softens a single failed run while a good copy is still fresh', () => {
    // One network blip should not put a red bar across a practice whose backup
    // is four hours old — but it must not be silent either, or a run that fails
    // from now on is invisible until the copy ages out on its own.
    const blip = run({ state: 'failed', lastSuccessAt: new Date(NOW.getTime() - 4 * HOUR) });
    assert.equal(severityOf(blip, NOW), 'late');
  });
});

describe('parseRun', () => {
  it('is null when there is no file', () => {
    assert.equal(parseRun(null), null);
  });

  /**
   * The rule that matters most in this file: anything not literally "ok" is a
   * failure. A status file this module cannot understand is not evidence that a
   * backup worked, and defaulting the other way would turn every future format
   * change into a silent all-clear.
   */
  it('treats an unrecognised state as a failure', () => {
    assert.equal(parseRun({ state: 'probably fine?' })?.state, 'failed');
    assert.equal(parseRun({})?.state, 'failed');
  });

  it('turns an unparseable timestamp into null rather than an Invalid Date', () => {
    // `new Date('nonsense')` does not throw. It produces a value that renders as
    // "Invalid Date" and makes every subtraction downstream NaN — which would
    // quietly compute an age of NaN and fall through every threshold.
    const parsed = parseRun({ state: 'ok', lastSuccessAt: 'not a date', finishedAt: '' });
    assert.equal(parsed?.lastSuccessAt, null);
    assert.equal(parsed?.finishedAt, null);
  });

  it('survives a file with nothing in it', () => {
    const parsed = parseRun({});
    assert.equal(parsed?.dump.bytes, 0);
    assert.equal(parsed?.files.count, 0);
    assert.equal(parsed?.offsite.configured, false);
    assert.equal(parsed?.offsite.snapshotId, null);
  });

  it('only calls the offsite copy configured when the sidecar said so exactly', () => {
    // The difference between "copied to another country" and "sitting on the
    // same disk as the database it protects" is the whole point of the system,
    // so a truthy-looking value is not good enough.
    assert.equal(parseRun({ offsite: { configured: 'yes' } })?.offsite.configured, false);
    assert.equal(parseRun({ offsite: { configured: true } })?.offsite.configured, true);
  });

  it('reads a complete run', () => {
    const parsed = parseRun({
      state: 'ok',
      message: '',
      finishedAt: '2026-08-20T02:00:31Z',
      lastSuccessAt: '2026-08-20T02:00:31Z',
      durationSeconds: 31,
      dump: { file: 'dentorganizer-20260820-020000.dump', bytes: 4_194_304 },
      files: { count: 412, bytes: 1_073_741_824 },
      offsite: {
        configured: true,
        repository: 's3:s3.eu-central-003.backblazeb2.com/dentorganizer-backup',
        snapshotId: 'ab12cd34',
        snapshotCount: 37,
      },
    });

    assert.equal(parsed?.state, 'ok');
    assert.equal(parsed?.dump.bytes, 4_194_304);
    assert.equal(parsed?.files.count, 412);
    assert.equal(parsed?.offsite.snapshotCount, 37);
    assert.equal(parsed?.lastSuccessAt?.toISOString(), '2026-08-20T02:00:31.000Z');
  });
});

describe('parseVerification', () => {
  it('treats an unrecognised state as a failure, as the run does', () => {
    assert.equal(parseVerification({ state: 'fine' })?.state, 'failed');
    assert.equal(parseVerification({ state: 'warning' })?.state, 'warning');
    assert.equal(parseVerification({ state: 'ok' })?.state, 'ok');
  });

  it('defaults a row it cannot count to -1 rather than to zero', () => {
    // The drill script uses -1 for "could not be counted" precisely so it is not
    // confused with "restored empty". Collapsing the two here would throw away
    // the distinction the alarm depends on.
    const parsed = parseVerification({ tables: [{ table: 'Patient' }] });
    assert.deepEqual(parsed?.tables, [{ table: 'Patient', live: -1, restored: -1 }]);
  });

  it('drops table entries that are not objects', () => {
    const parsed = parseVerification({ tables: ['Patient', null, 42] });
    assert.deepEqual(parsed?.tables, []);
  });

  it('keeps only string filenames among the missing samples', () => {
    const parsed = parseVerification({ files: { missing: 2, missingSamples: ['a.png', 7, null] } });
    assert.deepEqual(parsed?.files.missingSamples, ['a.png']);
  });

  it('reports the source, because a drill against the local dump proves less', () => {
    // Restoring the copy that sits beside the database says nothing about
    // whether the copy in the bucket is any good, and the card names which one
    // was actually tested.
    assert.equal(parseVerification({ source: 'offsite' })?.source, 'offsite');
    assert.equal(parseVerification({ source: 'anything else' })?.source, 'local');
  });
});

describe('formatBytes', () => {
  it('reads the way somebody would say it', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(900), '900 B');
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(4_194_304), '4.0 MB');
    assert.equal(formatBytes(1_073_741_824), '1.0 GB');
    assert.equal(formatBytes(16_106_127_360), '15 GB');
  });

  it('does not produce a negative or fractional byte count', () => {
    assert.equal(formatBytes(-1), '0 B');
  });
});
