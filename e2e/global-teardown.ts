/**
 * Drops the schema the run provisioned, so a suite that can be pointed anywhere
 * does not leave a full table set behind everywhere it was pointed.
 *
 * `E2E_SCHEMA` is overridable precisely so two checkouts, or a developer and a
 * CI job sharing a database, can run at once without emptying each other's
 * tables — see `env.ts`. Nothing dropped what those runs created, so every
 * `E2E_SCHEMA=something-else` run left roughly 4.5 MB of seeded tables behind
 * permanently. Six of them had accumulated in the development database before
 * anybody looked, each frozen at whatever migration state was current the day
 * it ran.
 *
 * **It only ever drops its own.** The schema name comes from `e2eDatabaseUrl()`,
 * the same function `global-setup.ts` provisioned through, so this cannot reach
 * a schema a concurrent run is using — and that function already refuses to
 * resolve `public` at all, which is the guard that matters most here. A sweep
 * of "everything that looks like an e2e schema" would be the obvious
 * alternative and is exactly the thing that would delete a colleague's run
 * mid-test.
 *
 * **It never fails the run.** A cleanup that turns a green suite red teaches
 * people to delete the cleanup. Anything that goes wrong here is printed with
 * the SQL to finish the job by hand, and the exit code is left alone.
 */
import { Client } from 'pg';
import { e2eDatabaseUrl, E2E_SCHEMA, redact } from './env';

export default async function globalTeardown(): Promise<void> {
  // The escape hatch for the reason you actually want one: a test failed and
  // the rows it failed on are the evidence. Traces survive on disk either way;
  // database state does not, so this is what keeps it.
  if (process.env.E2E_KEEP_SCHEMA) {
    console.log(`[e2e] keeping schema "${E2E_SCHEMA}" (E2E_KEEP_SCHEMA is set)`);
    return;
  }

  let databaseUrl: string;
  try {
    databaseUrl = e2eDatabaseUrl();
  } catch (error) {
    // The run cannot have provisioned anything if this throws, because setup
    // went through the same call and would have thrown first.
    console.warn(`[e2e] no schema to drop: ${(error as Error).message.split('\n')[0]}`);
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    // Bounded rather than open-ended. The standalone server's pool may not have
    // finished closing, and `DROP SCHEMA ... CASCADE` waits on locks by
    // default — so without this, tidying up is the step that hangs the run.
    // Ten seconds is far longer than an uncontended drop needs and far shorter
    // than anybody's patience.
    await client.query("set lock_timeout = '10s'");
    await client.query(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
    console.log(`[e2e] dropped schema "${E2E_SCHEMA}"`);
  } catch (error) {
    console.warn(
      `\n[e2e] could not drop schema "${E2E_SCHEMA}" in ${redact(databaseUrl)}:\n` +
        `      ${(error as Error).message.split('\n')[0]}\n` +
        `      The run itself is unaffected. To finish by hand:\n` +
        `        DROP SCHEMA "${E2E_SCHEMA}" CASCADE;\n`,
    );
  } finally {
    await client.end().catch(() => {
      // Nothing useful to do about a socket that is already gone, and throwing
      // out of teardown would fail a suite that has already passed.
    });
  }
}
