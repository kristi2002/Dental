import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The scheduler's wiring, which no unit test can reach and no reader checks.
 *
 * A job is defined in three files that have to agree and that live nowhere near
 * each other: the registry the app runs it from, the crontab the sidecar fires
 * it with, and the compose file that gives both halves the same secret. Every
 * way they can disagree fails *silently* — a job in the registry with no
 * schedule simply never runs, and nothing anywhere says so.
 *
 * The same schema-reading trick as `backup.test.ts` and `storage-keys.test.ts`,
 * applied to configuration instead of to a schema.
 */
const REGISTRY = path.join(process.cwd(), 'src', 'lib', 'jobs', 'registry.ts');
const ENTRYPOINT = path.join(process.cwd(), 'docker', 'jobs', 'entrypoint.sh');
const RUN_JOB = path.join(process.cwd(), 'docker', 'jobs', 'run-job.sh');
const COMPOSE = path.join(process.cwd(), 'docker-compose.prod.yml');

/** The keys of the `JOBS` record, read as text so no database is needed. */
function jobNames(registry: string): string[] {
  const block = registry.slice(registry.indexOf('export const JOBS'));
  return [...block.matchAll(/^ {2}'([a-z][a-z0-9-]*)':/gm)].map((m) => m[1]);
}

/** Job names the crontab actually invokes. */
function scheduledNames(entrypoint: string): string[] {
  return [...entrypoint.matchAll(/run-job\.sh\s+([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
}

describe('jobs — the registry and the clock agree', () => {
  it('schedules every job the registry defines', async () => {
    const [registry, entrypoint] = await Promise.all([
      readFile(REGISTRY, 'utf8'),
      readFile(ENTRYPOINT, 'utf8'),
    ]);

    const defined = jobNames(registry);
    assert.ok(defined.length > 0, 'no jobs found in the registry — the parser is wrong');

    const scheduled = new Set(scheduledNames(entrypoint));
    const unscheduled = defined.filter((name) => !scheduled.has(name));

    assert.deepEqual(
      unscheduled,
      [],
      `defined in the registry but never fired by the crontab, so they would never run: ${unscheduled.join(', ')}`,
    );
  });

  it('fires no job the registry does not define', async () => {
    const [registry, entrypoint] = await Promise.all([
      readFile(REGISTRY, 'utf8'),
      readFile(ENTRYPOINT, 'utf8'),
    ]);

    const defined = new Set(jobNames(registry));
    const unknown = scheduledNames(entrypoint).filter((name) => !defined.has(name));

    assert.deepEqual(
      unknown,
      [],
      `the crontab fires these and the app would answer 404 every time: ${unknown.join(', ')}`,
    );
  });
});

describe('jobs — run-job.sh asks exactly once', () => {
  it('makes a single request, because asking twice would run the job twice', async () => {
    const script = await readFile(RUN_JOB, 'utf8');

    // The bug this guards: an earlier draft POSTed, and on failure POSTed again
    // to read the status code. Survivable for a sweep; not for anything that
    // sends a patient a message.
    const posts = [...script.matchAll(/-X POST/g)].length;
    assert.equal(
      posts,
      1,
      `run-job.sh contains ${posts} POSTs; a retry to inspect the response runs the job again`,
    );
  });

  it('reads the body and the status from that one call', async () => {
    const script = await readFile(RUN_JOB, 'utf8');
    assert.match(script, /-w '%\{http_code\}'/, 'the status code must come from the same request');
    assert.match(script, /-o "\$BODY_FILE"/, 'the body must come from the same request');
  });
});

describe('jobs — the compose file wires both halves', () => {
  it('builds the sidecar and gives both halves the same secret', async () => {
    const compose = await readFile(COMPOSE, 'utf8');

    assert.match(compose, /docker\/jobs\/Dockerfile/, 'the jobs sidecar is not built');

    // Two references: the app, which checks it, and the sidecar, which sends it.
    // One would mean a clock nobody listens to, or an app nothing can trigger.
    const uses = [...compose.matchAll(/JOBS_SECRET:/g)].length;
    assert.equal(uses, 2, `JOBS_SECRET appears ${uses} times; the app and the sidecar both need it`);
  });

  it('leaves the sweep reporting rather than deleting', async () => {
    const compose = await readFile(COMPOSE, 'utf8');
    assert.match(
      compose,
      /JOBS_SWEEP_APPLY:\s*\$\{JOBS_SWEEP_APPLY:-false\}/,
      'the file-deleting job must default to reporting only',
    );
  });
});
