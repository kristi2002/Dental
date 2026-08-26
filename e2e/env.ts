/**
 * Where the end-to-end run keeps its data, and what the server under test may
 * reach.
 *
 * Everything here exists to keep one promise: **an E2E run never touches the
 * schema anybody works in.** The suite's first act is `prisma db seed`, which
 * empties twenty-odd tables before it refills them, so "which schema" is not a
 * detail — it is the difference between a test run and a data loss.
 *
 * That promise was not free. Prisma's `?schema=` is honoured by the CLI and, up
 * until `src/lib/db-url.ts` existed, ignored by the running app: `PrismaPg`
 * qualifies its statements with the schema it is handed and defaults to
 * `public` when handed nothing. So a URL that said `?schema=e2e` migrated `e2e`
 * and then read and wrote `public` anyway, with no error and no symptom. The
 * guard in `e2eDatabaseUrl()` is written the way it is because that failure
 * announces itself as a passing test run.
 */
import path from 'node:path';
import { schemaFromDatabaseUrl } from '../src/lib/db-url';

// Playwright loads no `.env` of its own, and the connection string this suite
// re-aims lives in one. Same two lines, and the same reasoning, as
// `prisma.config.ts`: Node's built-in loader keeps this working without a
// dependency, and it leaves anything already in the real environment alone —
// which is what lets CI override the whole lot.
try {
  process.loadEnvFile();
} catch {
  // No `.env`. Rely on the ambient environment, and fail later with a message
  // about the variable that is actually missing.
}

/**
 * The schema the run owns outright.
 *
 * Overridable so two checkouts, or a developer and a CI job sharing a database,
 * can run at once without emptying each other's tables mid-test.
 */
export const E2E_SCHEMA = process.env.E2E_SCHEMA?.trim() || 'e2e';

/**
 * Not 3000. A developer's `next dev` lives there, and a suite that quietly
 * attaches to it would test a different build against a different schema — the
 * exact class of "green run, wrong target" this file is about.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);

export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Written by `auth.setup.ts`, replayed by every other spec. */
export const OWNER_STATE_PATH = 'e2e/.auth/owner.json';

/**
 * The seeded Owner. `prisma/seed.ts` is deterministic, so this is a fact about
 * the repository rather than a guess about the database.
 */
export const OWNER = { firstName: 'Ilir', lastName: 'Berisha', pin: '1234' } as const;

/** A seeded account with no write permissions, for the guard tests. */
export const READONLY = { firstName: 'Marco', lastName: 'Rossi', pin: '4567' } as const;

/**
 * The connection string for the run, aimed at `E2E_SCHEMA` whatever the
 * ambient `DATABASE_URL` was aimed at.
 *
 * Throws rather than falls back. Every failure mode here ends in a destructive
 * seed landing somewhere it was not meant to, and there is no value of this
 * function worth returning if it cannot say which schema it means.
 */
export function e2eDatabaseUrl(): string {
  const base = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'e2e: neither E2E_DATABASE_URL nor DATABASE_URL is set. The suite provisions\n' +
        'its own schema inside an existing database and cannot invent the server.',
    );
  }

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`e2e: DATABASE_URL is not a parseable URL: ${redact(base)}`);
  }

  url.searchParams.set('schema', E2E_SCHEMA);
  const resolved = url.toString();

  // Belt and braces. `schemaFromDatabaseUrl` is what the app and the seed will
  // actually read, so asking *it* — rather than trusting the line above — is
  // the only check that proves the two agree.
  const effective = schemaFromDatabaseUrl(resolved);
  if (effective !== E2E_SCHEMA) {
    throw new Error(`e2e: could not aim the URL at "${E2E_SCHEMA}" (got "${effective}").`);
  }
  if (effective === 'public') {
    throw new Error(
      'e2e: refusing to run against the "public" schema. The suite seeds, which\n' +
        'deletes every row first. Set E2E_SCHEMA to something else.',
    );
  }

  return resolved;
}

/**
 * The environment `next start` is given for the run.
 *
 * Note what is blanked. `.env` on a developer's machine carries a live Brevo
 * key, and Next's loader leaves an explicitly-set variable alone — including an
 * empty one — so these four assignments are what stands between a test that
 * presses **Send** and a real message arriving at a real address. `email.ts`
 * reads an empty `MAIL_PROVIDER` as `unset`, which is the same state a practice
 * that has not configured sending is in, and therefore also worth testing.
 */
export function e2eServerEnv(): Record<string, string> {
  return {
    DATABASE_URL: e2eDatabaseUrl(),
    NODE_ENV: 'production',
    PORT: String(E2E_PORT),

    // No outbound mail, from any code path, for any reason.
    MAIL_PROVIDER: '',
    MAIL_API_KEY: '',
    MAIL_FROM: '',
    MAIL_REPLY_TO: '',

    // Uploads land in the run's own directory rather than the working copy's
    // `storage/`, so a test that attaches a file leaves nothing behind.
    // Absolute, because the standalone server chdirs into `.next/standalone`
    // before it reads this and a relative path would land inside the build.
    FILE_STORAGE_DIR: path.join(process.cwd(), 'e2e', '.storage'),

    // The standalone server binds what `HOSTNAME` names, and defaults to
    // `0.0.0.0` — which works, and also puts the practice's data on every
    // interface of whatever machine runs the suite.
    HOSTNAME: '127.0.0.1',

    // Stable across runs so `storageState` stays valid between them; explicit so
    // the run does not depend on `.env` having one.
    AUTH_SECRET: process.env.AUTH_SECRET || 'e2e-secret-not-for-anything-real-0000000000',
    JOBS_SECRET: process.env.JOBS_SECRET || 'e2e-jobs-secret',

    NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
    NEXT_TELEMETRY_DISABLED: '1',
  };
}

/** For error messages: never print a password, not even into a local log. */
export function redact(url: string): string {
  return url.replace(/:[^:@/]*@/, ':***@');
}
