import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessJob, worstJobSeverity, type JobRunLike } from '../src/lib/job-status';

/**
 * Whether the clock is running, judged without a database.
 *
 * The situation this exists for is the one where a mistake here would be
 * invisible: a job failing every night looks, from every other screen in the
 * app, exactly like a job that has nothing to do. So the cases below are mostly
 * about the difference between "ran" and "worked", which is the distinction the
 * whole card turns on.
 */

const NOW = new Date('2026-08-20T12:00:00.000Z');
const DAILY = 24;
const WEEKLY = 24 * 7;

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

/** A run that finished and worked. */
function ok(startedHoursAgo: number, summary = '9 orphans, 765 B'): JobRunLike {
  return {
    startedAt: hoursAgo(startedHoursAgo),
    finishedAt: hoursAgo(startedHoursAgo - 0.01),
    ok: true,
    summary,
    error: null,
  };
}

/** A run that finished and threw. */
function failed(startedHoursAgo: number, error = 'connection refused'): JobRunLike {
  return {
    startedAt: hoursAgo(startedHoursAgo),
    finishedAt: hoursAgo(startedHoursAgo - 0.01),
    ok: false,
    summary: null,
    error,
  };
}

/** A run that never got to its `finally` — a container killed mid-work. */
function unfinished(startedHoursAgo: number): JobRunLike {
  return {
    startedAt: hoursAgo(startedHoursAgo),
    finishedAt: null,
    ok: null,
    summary: null,
    error: null,
  };
}

describe('assessJob — has the clock actually been working', () => {
  it('calls a job that ran on time healthy', () => {
    const health = assessJob({ latest: ok(2), lastSuccess: ok(2) }, DAILY, NOW);
    assert.equal(health.severity, 'ok');
    assert.equal(health.reason, 'ok');
    assert.equal(health.staleHours, 2);
  });

  it('reports a job that has never run at all, rather than staying quiet', () => {
    // The single most likely thing to be wrong with a deployment — a sidecar
    // that was never wired, a secret that does not match — and the one a list
    // built from `JobRun` rows could not contain.
    const health = assessJob({ latest: null, lastSuccess: null }, DAILY, NOW);
    assert.equal(health.reason, 'never');
    assert.equal(health.severity, 'unknown');
    assert.equal(health.staleHours, null);
  });

  it('measures age from the last success, never from the last attempt', () => {
    // The rule the whole card turns on. This job ran ten minutes ago and has
    // achieved nothing for five days; judging it by `startedAt` would put a
    // green light on a practice whose reminders have not been queued all week.
    const health = assessJob(
      { latest: failed(0.2), lastSuccess: ok(24 * 5) },
      DAILY,
      NOW,
    );
    assert.equal(health.staleHours, 120, 'the number shown is the age of the last success');
    assert.equal(health.severity, 'critical');
    assert.equal(health.reason, 'stale');
  });

  it('scales lateness to the job’s own cadence', () => {
    // Six days without a sweep is a Tuesday; six days without the nightly queue
    // is a week of patients nobody rang. Fixed hours could not say both.
    const sixDays = { latest: ok(24 * 6), lastSuccess: ok(24 * 6) };
    assert.equal(assessJob(sixDays, WEEKLY, NOW).severity, 'ok');
    assert.equal(assessJob(sixDays, DAILY, NOW).severity, 'critical');
  });

  it('lets one missed run pass and calls two late', () => {
    // A single skipped run is a deploy landing on the wrong minute, and the
    // sidecar's own log says as much. A pattern is not.
    assert.equal(assessJob({ latest: ok(30), lastSuccess: ok(30) }, DAILY, NOW).severity, 'ok');
    const twoMissed = assessJob({ latest: ok(49), lastSuccess: ok(49) }, DAILY, NOW);
    assert.equal(twoMissed.severity, 'late');
    assert.equal(twoMissed.reason, 'stale');
  });

  it('escalates to critical at four missed runs', () => {
    assert.equal(assessJob({ latest: ok(95), lastSuccess: ok(95) }, DAILY, NOW).severity, 'late');
    assert.equal(
      assessJob({ latest: ok(97), lastSuccess: ok(97) }, DAILY, NOW).severity,
      'critical',
    );
  });

  it('treats a fresh unfinished run as work in progress', () => {
    // `runJob` opens the row before the work, so an in-flight job is exactly
    // this shape. Calling it broken would make every job look broken for as
    // long as it takes to run.
    const health = assessJob({ latest: unfinished(0.1), lastSuccess: ok(24) }, DAILY, NOW);
    assert.equal(health.severity, 'ok');
    assert.equal(health.reason, 'running');
  });

  it('calls an unfinished run stalled once it is older than the runner’s own guard', () => {
    // Past an hour, `runJob` would start a new one over the top of it — so past
    // an hour this screen must stop calling it healthy, or the two disagree
    // about the same row.
    const health = assessJob({ latest: unfinished(3), lastSuccess: ok(24) }, DAILY, NOW);
    assert.equal(health.severity, 'late');
    assert.equal(health.reason, 'stalled');
  });

  it('names a failure a failure while a recent success still stands', () => {
    const health = assessJob({ latest: failed(1), lastSuccess: ok(2) }, DAILY, NOW);
    assert.equal(health.severity, 'late');
    assert.equal(health.reason, 'failing');
  });

  it('puts staleness above the last attempt’s own outcome', () => {
    // A cheerful last row on a job whose work stopped in March must not read as
    // healthy. Age is asked first, deliberately.
    const health = assessJob({ latest: ok(24 * 40), lastSuccess: ok(24 * 40) }, DAILY, NOW);
    assert.equal(health.reason, 'stale');
    assert.equal(health.severity, 'critical');
  });

  it('is critical for a job that has run and never once succeeded', () => {
    // It exists, the clock is reaching it, and it has achieved nothing since
    // the day it was added — which is worse than never having run, not better.
    const failing = assessJob({ latest: failed(1), lastSuccess: null }, DAILY, NOW);
    assert.equal(failing.severity, 'critical');
    assert.equal(failing.reason, 'failing');

    const stalling = assessJob({ latest: unfinished(5), lastSuccess: null }, DAILY, NOW);
    assert.equal(stalling.severity, 'critical');
    assert.equal(stalling.reason, 'stalled');
  });
});

describe('worstJobSeverity — one word for a heading', () => {
  it('is calm when every job is', () => {
    assert.equal(worstJobSeverity([{ severity: 'ok' }, { severity: 'ok' }]), 'ok');
  });

  it('does not let "never run" hide a job that is failing', () => {
    // A practice with one job never wired and another throwing since March
    // needs to be told about the second.
    assert.equal(
      worstJobSeverity([{ severity: 'unknown' }, { severity: 'critical' }]),
      'critical',
    );
    assert.equal(worstJobSeverity([{ severity: 'unknown' }, { severity: 'late' }]), 'late');
  });

  it('still reports "never run" over nothing at all', () => {
    assert.equal(worstJobSeverity([{ severity: 'ok' }, { severity: 'unknown' }]), 'unknown');
  });

  it('reads an empty registry as calm rather than as a gap', () => {
    assert.equal(worstJobSeverity([]), 'ok');
  });
});
