/**
 * Which Postgres schema a connection string actually asks for.
 *
 * `?schema=` is documented in `.env.example` and `.env.production.example` and,
 * until this module existed, read by nothing. That is worse than it sounds.
 * Prisma's driver adapters do not parse the URL: `PrismaPg` qualifies every
 * generated statement with the schema it is *handed*, and falls back to
 * `public` when it is handed nothing — so a URL ending `?schema=staging`
 * connects to the right database, reports the right `search_path`, and then
 * reads and writes `public` anyway. Nothing errors. The only symptom is a
 * migration that ran somewhere the app never looks, or a seed that lands on
 * data it was pointed away from.
 *
 * The Prisma CLI *does* honour `?schema=` — `migrate deploy` and `db seed`
 * target it correctly. That disagreement between the CLI and the running app is
 * the whole hazard, and it is why this is parsed in one place and passed to
 * every adapter the repository constructs.
 */
export function schemaFromDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const schema = new URL(url).searchParams.get('schema');
    return schema ? schema : undefined;
  } catch {
    // Not a parseable URL. Nothing to say about it here — whoever opens the
    // connection will fail with a message about the connection, which is the
    // more useful error of the two.
    return undefined;
  }
}

/**
 * The options object `PrismaPg` should be constructed with, for a given URL.
 *
 * Returns `undefined` rather than `{ schema: undefined }` when the URL names no
 * schema, so the adapter keeps its own default instead of being handed an
 * explicit nothing.
 */
export function pgAdapterOptions(url: string | undefined): { schema: string } | undefined {
  const schema = schemaFromDatabaseUrl(url);
  return schema ? { schema } : undefined;
}
