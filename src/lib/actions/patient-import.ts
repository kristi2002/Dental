'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { buildSearchKey, phoneKey } from '@/lib/patient-search';
import {
  IMPORT_LIMIT,
  isImportable,
  type DraftPatient,
  type ImportRow,
} from '@/lib/patients-import';
import { prisma } from '@/lib/prisma';
import { IMPORT_TX_OPTIONS, logImportFailure } from './import-tx';
import { actionError, actionOk, type ActionState } from './types';

/**
 * Writing an imported list into the practice.
 *
 * The parsing happens in the browser — `patients-import.ts` is pure, and a file
 * the practice is only *considering* importing has no business being uploaded
 * anywhere. What crosses to the server is the drafts the screen has already
 * shown somebody, and then only when they press the button.
 *
 * Two actions rather than one, because there are two questions and they are
 * asked at different moments: "who among these do we already have" is asked
 * while the preview is on screen, and "write them" is asked afterwards.
 */

/**
 * Which of these numbers the practice already has.
 *
 * Compared on `phoneKey` — the trailing nine digits — so `069 12 34 567` and
 * `+355 69 1234567` are recognised as one person, which is the whole reason a
 * duplicate check exists. Returns the *keys*, not the patients: the preview
 * needs to mark rows, and shipping names back would hand the browser a slice of
 * the patient list in answer to a question about a file.
 *
 * Archived people count. Somebody archived last year is still on the books, and
 * importing a second copy of them is exactly the mess this prevents.
 */
export async function findTakenPhones(phones: string[]): Promise<string[]> {
  const user = await authorize('patient.edit');
  if (!user) return [];

  const wanted = new Set(phones.map(phoneKey).filter(Boolean));
  if (wanted.size === 0) return [];

  // Every phone in the practice, keyed the same way. A `findMany` per number
  // would be one query per row of the file; this is one query, and the column
  // is small enough to hold — it is the same list the export writes.
  const existing = await prisma.patient.findMany({ select: { phone: true } });

  const taken = new Set<string>();
  for (const { phone } of existing) {
    const key = phoneKey(phone);
    if (wanted.has(key)) taken.add(key);
  }

  return [...taken];
}

/** What the commit did, so the screen can say it rather than just going quiet. */
export type ImportOutcome = ActionState & { created?: number; skipped?: number };

/**
 * Create the rows the screen offered to create.
 *
 * Re-checks everything rather than trusting the preview. The preview was taken
 * at some earlier moment, the form post is ordinary HTTP, and between the two a
 * colleague may have registered one of these people at the desk — so the
 * duplicate check is done again here, inside the same transaction that writes.
 *
 * Skips rather than fails. An import that refuses all three thousand because
 * one number was taken in the meantime is an import nobody can use; the count
 * of what was skipped comes back and the screen says so.
 */
export async function commitPatientImport(
  _prev: ImportOutcome,
  formData: FormData,
): Promise<ImportOutcome> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.edit');
  if (!user) return actionError(t('forbidden'));

  let rows: ImportRow[];
  try {
    const parsed: unknown = JSON.parse(String(formData.get('rows') ?? '[]'));
    if (!Array.isArray(parsed)) throw new Error('not a list');
    rows = parsed as ImportRow[];
  } catch {
    return actionError(t('generic'));
  }

  if (rows.length === 0) return actionError(t('fillRequired'));
  if (rows.length > IMPORT_LIMIT) return actionError(t('importTooMany', { limit: IMPORT_LIMIT }));

  // The browser's own verdict is a convenience, not a permission: everything it
  // decided is decided again here against the same pure functions.
  const usable = rows.filter((row) => row && row.draft && isImportable(row));

  let created = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.patient.findMany({ select: { phone: true } });
      const taken = new Set(existing.map(({ phone }) => phoneKey(phone)).filter(Boolean));

      const data = [];
      for (const row of usable) {
        const key = phoneKey(row.draft.phone ?? '');
        // Guards the file against itself as well as against the practice: two
        // rows carrying one number would otherwise both pass this loop.
        if (!key || taken.has(key)) continue;
        taken.add(key);
        data.push(toPatientData(row.draft));
      }

      if (data.length === 0) return;
      // `skipDuplicates` is about the unique indexes, not about phones — those
      // are handled above. It is here so a race on any other constraint costs
      // one row rather than the whole import.
      const result = await tx.patient.createMany({ data, skipDuplicates: true });
      created = result.count;
    }, IMPORT_TX_OPTIONS);
  } catch (error) {
    logImportFailure('the patient import', error);
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'patient',
    // No names: this is one line standing for up to five thousand records, and
    // the trail is read as a list. The figures are what makes it checkable.
    summary: `Imported ${created} patients from a file (${rows.length} rows offered)`,
  });

  revalidatePath('/', 'layout');
  return { ...actionOk(), created, skipped: rows.length - created };
}

/**
 * A draft as the `Patient` table wants it.
 *
 * Deliberately the same shape `savePatient` builds, including `searchKey` —
 * which is written on save and never typed, and without which an imported
 * patient is invisible to every search box in the app until something edits
 * them. That is the sort of bug that only shows up in the practice.
 *
 * `contactConsent` is left null on purpose. Nobody has asked these people
 * anything; a bulk import is the single clearest case of "unknown" the
 * tri-state column exists for, and defaulting it to yes would send reminders to
 * three thousand people who never agreed to receive them.
 */
function toPatientData(draft: DraftPatient) {
  const firstName = draft.firstName ?? '';
  const lastName = draft.lastName ?? '';
  const phone = draft.phone ?? '';

  return {
    firstName,
    lastName,
    phone,
    email: draft.email ?? null,
    searchKey: buildSearchKey({ firstName, lastName, phone, email: draft.email }),
    dateOfBirth: draft.dateOfBirth ? new Date(`${draft.dateOfBirth}T00:00:00.000Z`) : null,
    address: draft.address ?? null,
    fiscalCode: draft.fiscalCode ?? null,
    guardianName: draft.guardianName ?? null,
    guardianPhone: draft.guardianPhone ?? null,
    emergencyContact: draft.emergencyContact ?? null,
    referralSource: draft.referralSource ?? null,
  };
}
