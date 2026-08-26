/**
 * Provisions the schema the suite owns, before Playwright starts the server.
 *
 * Three steps, in this order, and the third is not ceremony: replay the
 * migrations into `E2E_SCHEMA`, seed it, then *prove* the seed landed there by
 * reading the row counts out of that schema by name. The proof exists because
 * the failure it guards against is silent — a misconfigured adapter seeds
 * `public`, reports "patients: 10", and every test that follows passes against
 * the wrong data. Counting from outside Prisma is the only check that cannot be
 * fooled by the same bug twice.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Client } from 'pg';
import { e2eDatabaseUrl, E2E_SCHEMA, redact } from './env';

// Anchored on the working directory rather than on `import.meta.url`, which is
// a syntax error in the CommonJS Playwright transpiles this file into, or on
// `__filename`, which does not exist if it ever stops doing so. The resolution
// root only has to be inside the project for `node_modules` lookup to work.
const require_ = createRequire(path.join(process.cwd(), 'playwright.config.ts'));

function run(label: string, args: string[], databaseUrl: string): void {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' },
  });
  if (result.status !== 0) {
    throw new Error(`e2e: ${label} failed (exit ${result.status ?? 'signal ' + result.signal}).`);
  }
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = e2eDatabaseUrl();
  console.log(`\n[e2e] schema "${E2E_SCHEMA}" in ${redact(databaseUrl)}`);

  // `migrate deploy` creates the schema when it is absent and replays forward
  // only — the same command the production deploy runs, which is the point.
  run('prisma migrate deploy', [require_.resolve('prisma/build/index.js'), 'migrate', 'deploy'], databaseUrl);

  // Straight at the script rather than through `prisma db seed`, so the child
  // process is one link shorter and the DATABASE_URL above cannot be reinterpreted
  // by a config file on the way.
  run('prisma/seed.ts', ['--import', 'tsx', 'prisma/seed.ts'], databaseUrl);

  await assertSeededInto(databaseUrl);
}

/**
 * Reads the seeded rows back out of `E2E_SCHEMA` by name, with plain SQL.
 *
 * Also asserts `public` was *not* the target, by checking the schema really
 * holds the data. A run that seeded the wrong place leaves these tables empty.
 */
async function assertSeededInto(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const counts: Record<string, number> = {};
    for (const table of ['StaffUser', 'Patient', 'Appointment', 'StockItem']) {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from "${E2E_SCHEMA}"."${table}"`,
      );
      counts[table] = rows[0].n;
    }

    const empty = Object.entries(counts).filter(([, n]) => n === 0);
    if (empty.length > 0) {
      throw new Error(
        `e2e: the seed reported success but "${E2E_SCHEMA}" is empty ` +
          `(${empty.map(([t]) => t).join(', ')}).\n` +
          'That is the signature of a seed that wrote to another schema — check\n' +
          'that `src/lib/db-url.ts` is still wired into `prisma/seed.ts`.',
      );
    }

    console.log(
      `[e2e] seeded ${Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(' ')}\n`,
    );
  } finally {
    await client.end();
  }
}
