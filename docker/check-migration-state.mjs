/**
 * Which of three states is the database in, before the entrypoint touches it?
 *
 * The container used to run `prisma db push` on every boot, which needs to know
 * nothing: it reads the schema file and makes the database match. `migrate
 * deploy` is not like that. It replays a numbered history and records what it
 * replayed in `_prisma_migrations`, so it has to be told apart:
 *
 *   empty        nothing here yet — replay the whole history, the normal first boot
 *   managed      `_prisma_migrations` is present — replay whatever is pending
 *   unbaselined  our tables are here but the history table is not
 *
 * The third is the one this script exists for. It is what a database built by
 * the old `db push` workflow looks like, and running `migrate deploy` against it
 * would start at `0_init` — `CREATE TABLE "Patient"` against a Patient table
 * that already holds patients — and fail. That failure is loud and harmless, but
 * the remedy is a decision about which migrations are already reflected in those
 * tables, and a container at boot is the wrong thing to be making it. So this
 * reports the state and the entrypoint stops.
 *
 * Uses only `pg`, which the runtime image already has — see `create-owner.mjs`.
 *
 * Exit codes: 0 with the state on stdout · 2 could not connect (worth retrying)
 * · 1 anything else.
 */
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
} catch (error) {
  // Postgres is often still starting when the app container is. The caller
  // retries on this code rather than treating it as a verdict.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

try {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_history,
      EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = current_schema()
          AND tablename NOT LIKE '\\_prisma%'
      ) AS has_tables
  `);

  const { has_history: hasHistory, has_tables: hasTables } = rows[0];

  // Order matters: a managed database also has tables, and the history is what
  // makes it managed.
  if (hasHistory) process.stdout.write('managed');
  else if (hasTables) process.stdout.write('unbaselined');
  else process.stdout.write('empty');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await client.end();
}
