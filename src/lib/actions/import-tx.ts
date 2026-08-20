/**
 * How long an import is allowed to take, and how it is allowed to fail.
 *
 * Prisma gives an interactive transaction **five seconds** by default and then
 * rolls it back with P2028. Every import in this app runs inside one, and
 * `IMPORT_LIMIT` lets a file carry 5000 rows — so the ceiling that actually
 * applied was never the row limit the operator was shown.
 *
 * That matters more than the numbers suggest, because importing is the first
 * thing a practice does. The old patient list arrives as a spreadsheet on day
 * one, and the whole of the app is empty until it lands. A 3000-row file that
 * rolls back after five seconds writes nothing, reports only "something went
 * wrong", and does it again on every retry: the practice cannot start, and
 * cannot find out why.
 *
 * Two minutes is far more than any of these imports needs (the patient import
 * is one `findMany` and one `createMany`; the catalogue imports add a handful
 * of round trips for categories and suppliers). It is chosen to be beyond
 * argument on a slow mini-PC rather than to be tight — nothing else is waiting
 * on this transaction, and a bounded wait that succeeds beats a fast failure
 * that loses the file.
 *
 * `maxWait` is the separate budget for *getting* a connection from the pool
 * before the transaction starts; the default two seconds is short for a machine
 * that is also serving the surgery.
 */
export const IMPORT_TX_OPTIONS = {
  timeout: 120_000,
  maxWait: 15_000,
} as const;

/**
 * Report an import failure to the operator, and leave the cause somewhere a
 * person can find it.
 *
 * Each of these `catch` blocks discarded the error entirely. The screen said
 * "something went wrong" — correct, and all a receptionist can act on — but the
 * server said nothing at all, so a P2028 timeout, a bad column and an unreachable
 * database were indistinguishable to whoever was asked to look into it.
 */
export function logImportFailure(what: string, error: unknown): void {
  console.error(`[import] ${what} failed and was rolled back:`, error);
}
