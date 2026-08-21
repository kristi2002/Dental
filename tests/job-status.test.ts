import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assess, type LastRun, worstOf } from '../src/lib/jobs/job-status';

/**
 * The verdict the Staff card is built on.
 *
 * Worth testing for the same reason `backup-status.test.ts` exists: a mistake
 * here is invisible in precisely the situation the card was added for. The
 * whole failure this closes is a job that stopped happening and told nobody —
 * so a verdict that wrongly returns `ok` reproduces the original bug with a
 * green tick on top of it, which is worse than having no card at all.
 */

const HOUR = 3_600_000;
const NOW = new Date('2026-08-20T12:00:00Z');
const DAILY = 24;

function at(hoursAgo: number): Date {
  return new Date(NOW.getTime() - hoursAgo * HOUR);
}

function lastRun(overrides: Partial<LastRun> = {}): LastRun {
  return {
    startedAt: at(1),
    finishedAt: at(1),
    ok: true,
    summary: 'queued 3 reminders',
    error: null,
    ...overrides,
  };
}

describe('assess — a job that is fine', () => {
  it('is ok when the last run succeeded recently', () => {
    const result = assess(lastRun(), at(1), DAILY, NOW);
    assert.equal(result.severity, 'ok');
    assert.equal(result.reason, 'ok');
  });

  it('stays ok the evening before the next run is due', () => {
    // A nightly job is legitimately ~24h old for a moment every day, just
    // before today's firing. Warning then would put a banner on a healthy
    // practice once every evening.
    const result = assess(lastRun({ startedAt: at(25), finishedAt: at(25) }), at(25), DAILY, NOW);
    assert.equal(result.severity, 'ok');
  });

  it('tolerates one missed firing', () => {
    const result = assess(lastRun({ startedAt: at(48), finishedAt: at(48) }), at(48), DAILY, NOW);
    assert.equal(result.severity, 'ok');
  });
});

describe('assess — a job that has stopped working', () => {
  it('is amber for one failure behind a recent success', () => {
    // The blip case: it ran fine yesterday, tonight it threw. Worth saying,
    // not worth a red bar across the practice.
    const failed = lastRun({ ok: false, summary: null, error: 'connect ECONNREFUSED' });
    const result = assess(failed, at(24), DAILY, NOW);
    assert.equal(result.severity, 'late');
    assert.equal(result.reason, 'failing');
  });

  it('goes red once the last success ages past the window', () => {
    // Failing every evening since Tuesday: running perfectly, achieving
    // nothing. This is the case the whole module exists for.
    const failed = lastRun({ startedAt: at(12), finishedAt: at(12), ok: false, error: 'boom' });
    const result = assess(failed, at(96), DAILY, NOW);
    assert.equal(result.severity, 'critical');
    assert.equal(result.reason, 'failing');
  });

  it('is red and overdue when nothing has run for far too long', () => {
    const stale = lastRun({ startedAt: at(200), finishedAt: at(200) });
    const result = assess(stale, at(200), DAILY, NOW);
    assert.equal(result.severity, 'critical');
    assert.equal(result.reason, 'overdue');
  });

  it('is red when it has never once succeeded', () => {
    const failed = lastRun({ ok: false, summary: null, error: 'boom' });
    const result = assess(failed, null, DAILY, NOW);
    assert.equal(result.severity, 'critical');
    assert.equal(result.reason, 'failing');
  });
});

describe('assess — a run that never finished', () => {
  it('is ok while it may still be going', () => {
    const running = lastRun({ startedAt: at(0.1), finishedAt: null, ok: null, summary: null });
    assert.equal(assess(running, at(24), DAILY, NOW).severity, 'ok');
  });

  it('is stalled once it is past the runner’s own patience', () => {
    // Matches STALE_RUN_MS in run.ts: beyond an hour the runner itself stops
    // believing the in-flight row, and so should the screen. "Did not finish"
    // is a different failure from "finished badly" — the container died
    // mid-run and nothing wrote a verdict.
    const stuck = lastRun({ startedAt: at(3), finishedAt: null, ok: null, summary: null });
    const result = assess(stuck, at(24), DAILY, NOW);
    assert.equal(result.severity, 'critical');
    assert.equal(result.reason, 'stalled');
  });
});

describe('assess — nothing has ever run', () => {
  it('is unknown rather than ok', () => {
    // A registered, scheduled job with no rows at all. Absence must never
    // render as health: that is the exact shape of "the sidecar has never
    // reached the app".
    const result = assess(null, null, DAILY, NOW);
    assert.equal(result.severity, 'unknown');
    assert.equal(result.reason, 'never');
  });
});

describe('assess — the weekly job gets a weekly allowance', () => {
  const WEEKLY = 24 * 7;

  it('is ok eight days after a success', () => {
    assert.equal(assess(lastRun({ startedAt: at(192) }), at(192), WEEKLY, NOW).severity, 'ok');
  });

  it('is red after most of a month', () => {
    assert.equal(assess(lastRun({ startedAt: at(600) }), at(600), WEEKLY, NOW).severity, 'critical');
  });
});

describe('worstOf', () => {
  it('is ok only when everything is', () => {
    assert.equal(worstOf(['ok', 'ok']), 'ok');
  });

  it('reports the loudest of them', () => {
    assert.equal(worstOf(['ok', 'late', 'critical']), 'critical');
    assert.equal(worstOf(['ok', 'unknown']), 'unknown');
    assert.equal(worstOf(['unknown', 'late']), 'late');
  });

  it('is ok for an empty registry rather than unknown', () => {
    assert.equal(worstOf([]), 'ok');
  });
});
