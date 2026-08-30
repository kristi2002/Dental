import { prisma } from '@/lib/prisma';
import { deleteStoredFile } from '@/lib/files';

/**
 * The bytes a delete takes with it, which the database does not.
 *
 * `onDelete: Cascade` removes rows and knows nothing about the storage
 * directory, so every hard delete in this application has to read the file names
 * it is about to make unreachable *before* it commits — after the delete there
 * is nothing left pointing at them.
 *
 * `deletePatient` has always done this for the patient's own documents, and its
 * comment states the stake better than this one can: an X-ray that outlives the
 * record it belonged to is both a storage leak and a data-protection failure.
 * What it missed is that a patient also cascades into their **follow-ups**, and
 * a follow-up carries attachments of its own — the snap of a cracked casting,
 * a scan somebody pinned to an errand. Three deletes reach that table by
 * cascade and none of them cleaned it:
 *
 * | delete | reaches the follow-up by |
 * | --- | --- |
 * | `deletePatient` | `FollowUp.patientId` |
 * | `deleteWork` | `FollowUp.workId` |
 * | `deleteStockItem` | `FollowUp.stockItemId` |
 *
 * `deleteFollowUp` cleaned its own attachments from the day it was written,
 * which is what makes the other three read as oversights rather than as a
 * decision.
 *
 * **`sweep-orphan-files` is not the answer to this.** It reports by default and
 * only deletes when `JOBS_SWEEP_APPLY` is set, so on an ordinary deployment
 * those files stay for ever; and even where it is set, "the radiograph is
 * removed within a week" is not what deleting a record is understood to mean.
 *
 * Everything here is best-effort and runs *after* the row is gone, for the
 * reason `deletePatient` gives: a file that will not unlink must not undo a
 * delete the database has already committed.
 */

/** Which relation the follow-ups hang off. Exactly one is ever set. */
export type FollowUpOwner =
  | { patientId: string }
  | { workId: string }
  | { stockItemId: string };

/**
 * The attachment keys belonging to every follow-up about this record.
 *
 * Read as a separate query rather than included in the caller's own lookup,
 * because the callers select wildly different things and the one thing they must
 * not do is forget this. A function with a name is harder to leave out than a
 * nested `select`.
 */
export async function followUpFileKeys(owner: FollowUpOwner): Promise<string[]> {
  const attachments = await prisma.followUpAttachment.findMany({
    where: { followUp: owner },
    select: { storageKey: true },
  });

  return attachments.map((attachment) => attachment.storageKey);
}

/**
 * Unlink what is no longer pointed at, and never throw doing it.
 *
 * A rejected unlink is logged and swallowed: the row is already gone, the caller
 * has already told somebody it worked, and re-raising here would turn a tidy-up
 * failure into an error on a screen where nothing is wrong.
 */
export async function forgetFiles(keys: ReadonlyArray<string | null | undefined>): Promise<void> {
  await Promise.all(
    keys.filter((key): key is string => Boolean(key)).map(async (key) => {
      try {
        await deleteStoredFile(key);
      } catch (error) {
        console.error('[files] could not remove an orphaned file', key, error);
      }
    }),
  );
}
