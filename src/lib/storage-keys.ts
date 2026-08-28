/**
 * Every column in the schema that names a file in `FILE_STORAGE_DIR`.
 *
 * One directory holds everything the practice uploads — radiographs, consent
 * forms, identity cards, the photograph of a box on a shelf, the snap of a
 * cracked casting pinned to a follow-up — and `files.ts` gives each one an
 * opaque generated name. Nothing about the name says which table points at it.
 *
 * That is fine until something walks the directory and asks "is anything still
 * referencing this?", because a sweeper that knows about four of the five
 * columns does not report a smaller number: it **deletes the fifth column's
 * files**. `prisma/sweep-orphan-files.ts` knew only about `PatientDocument`, so
 * it would have removed every stock photograph and every follow-up attachment
 * on the first `--apply` — silently, and an hour after upload. The fifth,
 * `EmailAttachment`, was caught by that test the day it was added, which is the
 * whole point of having written it. The sixth, `AppointmentRequestAttachment`,
 * holds what a stranger attached to a request off the public page — bytes
 * nobody signed in to upload, and in many cases the only copy the practice has
 * of somebody's radiograph from another clinic.
 *
 * So the list lives here rather than inline in the script, and
 * `tests/storage-keys.test.ts` reads `schema.prisma` and fails if a column that
 * holds a storage key is missing from it. Adding a seventh place to store a file
 * now breaks a test instead of eating the sixth.
 */

/**
 * The shape of the client this needs — the six finders, and nothing else.
 *
 * Structural rather than the generated `PrismaClient`, so the script can pass
 * its own instance and the tests never have to construct one.
 */
export type StorageKeyReader = {
  patientDocument: { findMany(args: { select: { storageKey: true } }): Promise<Array<{ storageKey: string }>> };
  followUpAttachment: { findMany(args: { select: { storageKey: true } }): Promise<Array<{ storageKey: string }>> };
  appointmentRequestAttachment: { findMany(args: { select: { storageKey: true } }): Promise<Array<{ storageKey: string }>> };
  emailAttachment: { findMany(args: { select: { storageKey: true } }): Promise<Array<{ storageKey: string }>> };
  stockItem: { findMany(args: { select: { photoKey: true } }): Promise<Array<{ photoKey: string | null }>> };
  stockProduct: { findMany(args: { select: { photoKey: true } }): Promise<Array<{ photoKey: string | null }>> };
};

/**
 * Which model and column each source is, named so the coverage test can check
 * them against the schema without parsing this file's logic.
 */
export const STORAGE_KEY_SOURCES = [
  { model: 'PatientDocument', column: 'storageKey' },
  { model: 'FollowUpAttachment', column: 'storageKey' },
  { model: 'AppointmentRequestAttachment', column: 'storageKey' },
  { model: 'EmailAttachment', column: 'storageKey' },
  { model: 'StockItem', column: 'photoKey' },
  { model: 'StockProduct', column: 'photoKey' },
] as const;

/**
 * Every on-disk name the database still points at.
 *
 * Read in one pass per table rather than joined: they share nothing but the
 * directory, and six narrow queries against a four-person practice is cheaper
 * to run and very much cheaper to read than a union.
 */
export async function referencedStorageKeys(prisma: StorageKeyReader): Promise<Set<string>> {
  const [documents, attachments, mail, requested, items, products] = await Promise.all([
    prisma.patientDocument.findMany({ select: { storageKey: true } }),
    prisma.followUpAttachment.findMany({ select: { storageKey: true } }),
    prisma.emailAttachment.findMany({ select: { storageKey: true } }),
    prisma.appointmentRequestAttachment.findMany({ select: { storageKey: true } }),
    prisma.stockItem.findMany({ select: { photoKey: true } }),
    prisma.stockProduct.findMany({ select: { photoKey: true } }),
  ]);

  const keys = new Set<string>();
  for (const row of documents) keys.add(row.storageKey);
  for (const row of attachments) keys.add(row.storageKey);
  for (const row of mail) keys.add(row.storageKey);
  // What a stranger attached to a booking request. The newest source, and the
  // one nobody signed in to create — see `AppointmentRequestAttachment`.
  for (const row of requested) keys.add(row.storageKey);
  // Nullable: most materials have no photograph, and `null` is not a filename.
  for (const row of items) if (row.photoKey) keys.add(row.photoKey);
  for (const row of products) if (row.photoKey) keys.add(row.photoKey);

  return keys;
}
