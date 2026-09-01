import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { locales } from '../src/i18n/routing';

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
const BUILD_WORKFLOW = path.join(process.cwd(), '.github', 'workflows', 'build-and-push.yml');

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
  it('runs the sidecar and gives both halves the same secret', async () => {
    const compose = await readFile(COMPOSE, 'utf8');

    // The sidecar has to be *a service in this file*. How its image comes to
    // exist is the next test's business — this one only asks whether the stack
    // Coolify reads contains a clock at all. Without it the app is a thing with
    // an unreachable `/api/jobs/*` and no reminder ever queued.
    assert.match(compose, /^ {2}jobs:$/m, 'docker-compose.prod.yml defines no jobs service');
    assert.match(
      compose,
      /image:\s*ghcr\.io\/[\w-]+\/dental-jobs:/,
      'the jobs service does not run the sidecar image',
    );

    // Two references: the app, which checks it, and the sidecar, which sends it.
    // One would mean a clock nobody listens to, or an app nothing can trigger.
    const uses = [...compose.matchAll(/JOBS_SECRET:/g)].length;
    assert.equal(uses, 2, `JOBS_SECRET appears ${uses} times; the app and the sidecar both need it`);
  });

  /**
   * The half of the wiring that moved out of this file.
   *
   * `docker-compose.prod.yml` used to carry `build: docker/jobs/Dockerfile`, and
   * this suite asserted on it. Since the deploy switched to prebuilt images
   * (`da55e4e`) the compose file only *names* an image, and nothing on the
   * server builds it — so the Dockerfile's one remaining caller is the CI
   * workflow, and that is now where the invariant lives.
   *
   * It is worth keeping rather than dropping. A compose file naming
   * `dental-jobs:latest` that no workflow ever pushes is the same silent failure
   * the old assertion guarded, wearing different clothes: the stack comes up,
   * Docker pulls a stale tag or none at all, and nothing says the clock is gone.
   */
  it('builds the sidecar image in CI, since the server no longer does', async () => {
    const [compose, workflow] = await Promise.all([
      readFile(COMPOSE, 'utf8'),
      readFile(BUILD_WORKFLOW, 'utf8'),
    ]);

    assert.doesNotMatch(
      compose,
      /docker\/jobs\/Dockerfile/,
      'the compose file builds the sidecar again — the deploy pulls prebuilt images, so this would never run',
    );
    assert.match(
      workflow,
      /dockerfile:\s*docker\/jobs\/Dockerfile/,
      'nothing builds docker/jobs/Dockerfile; the image the compose file pulls would go stale',
    );
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

/**
 * The fourth file that has to agree: the words.
 *
 * A job with no `jobs.name.<name>` does not fail a build and does not fail this
 * suite's parity check either — `messages.test.ts` compares the locales against
 * each other, and a job added without labels is missing from all three equally.
 * What happens instead is that the staff page logs `MISSING_MESSAGE` and prints
 * the key path where the job's name should be, which is how three jobs reached
 * a running dev server captioned `jobs.name.queue-post-op-checks`.
 *
 * Read as text for the reason the checks above are: the registry imports the
 * database and half the message layer, and none of that is needed to ask
 * whether somebody wrote the label.
 */
describe('jobs — the registry and the labels agree', () => {
  it('names and explains every job, in every language', async () => {
    const registry = await readFile(REGISTRY, 'utf8');
    const defined = jobNames(registry);
    assert.ok(defined.length > 0, 'no jobs found in the registry — the parser is wrong');

    const missing: string[] = [];
    for (const locale of locales) {
      const messages = JSON.parse(
        await readFile(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
      );
      for (const name of defined) {
        // Both halves: the card prints the name and the hint on one line, so a
        // job with one and not the other still renders a key path on screen.
        for (const part of ['name', 'hint'] as const) {
          if (typeof messages.jobs?.[part]?.[name] !== 'string') {
            missing.push(`${locale}: jobs.${part}.${name}`);
          }
        }
      }
    }

    assert.deepEqual(
      missing,
      [],
      `the staff page would print these key paths instead of words: ${missing.join(', ')}`,
    );
  });
});
