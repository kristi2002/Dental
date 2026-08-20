'use server';

import { getTranslations } from 'next-intl/server';
import { authorize, recordAudit } from '@/lib/auth/guard';
import {
  BackupUnreadable,
  decryptBackup,
  HEADER_BYTES,
  inspectBackup,
  looksEncrypted,
  type BackupReport,
} from '@/lib/backup-inspect';
import { actionError, actionOk, type ActionState } from './types';

/**
 * Proving that a backup file is worth the disk it sits on.
 *
 * `docs/RESTORE.md` says an untested backup is a hope rather than a backup, and
 * the Sunday drill proves the *automatic* copies. Nothing proved the file an
 * owner downloads by hand and keeps on a memory stick — and the specific way
 * that file fails is the worst one: a passphrase typed once, six months ago,
 * that turns out not to be the one being remembered on the day it matters.
 *
 * This decrypts the file and describes it. It writes nothing to the database —
 * see the long note in `backup-inspect.ts` for why an in-app *restore* is
 * deliberately not built, and `prisma/restore-backup.ts` for the one that is.
 */

/**
 * How large a backup this will take.
 *
 * A practice's whole database as pretty-printed JSON is a few tens of megabytes;
 * the audit trail is the bulk of it and the export already caps that. The bound
 * is on what one request can be asked to hold in memory — decrypting works on
 * the whole buffer at once, so an unbounded upload is an unbounded allocation.
 */
const MAX_BYTES = 200 * 1024 * 1024;

export type CheckState = ActionState & { report?: BackupReport };

export async function checkBackup(_prev: CheckState, formData: FormData): Promise<CheckState> {
  const t = await getTranslations('errors');
  const tb = await getTranslations('backup');

  // The same permission the export needs. Reading a backup is reading the whole
  // practice at once, so it cannot be a lesser right than making one.
  const user = await authorize('backup.export');
  if (!user) return actionError(t('forbidden'));

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return actionError(tb('checkNoFile'));
  if (file.size > MAX_BYTES) return actionError(tb('checkTooLarge'));

  const bytes = Buffer.from(await file.arrayBuffer());
  const passphrase = String(formData.get('passphrase') ?? '');
  // Decided from the bytes rather than the file name: a backup dragged out of a
  // mail client arrives called anything at all.
  const encrypted = looksEncrypted(bytes);

  if (encrypted && !passphrase) return actionError(tb('checkNeedsPassphrase'));
  if (encrypted && bytes.length <= HEADER_BYTES) return actionError(tb('checkUnreadable'));

  let text: string;
  try {
    text = encrypted ? decryptBackup(bytes, passphrase) : bytes.toString('utf8');
  } catch {
    // Never "something went wrong": the passphrase is the thing being tested,
    // and this sentence is the whole answer somebody came here for.
    return actionError(tb('checkBadPassphrase'));
  }

  let report: BackupReport;
  try {
    report = inspectBackup(text, encrypted);
  } catch (error) {
    if (error instanceof BackupUnreadable) return actionError(tb('checkNotABackup'));
    return actionError(t('generic'));
  }

  // Worth a line: somebody held the whole practice in a file and proved they
  // could open it. If a backup ever leaks, the trail should say who had one
  // open and when — the same reasoning as the export's own line.
  await recordAudit(user, {
    action: 'export',
    entity: 'backup',
    summary: `Checked a backup taken ${report.exportedAt ?? 'at an unknown time'} · ${report.totalRows} rows`,
  });

  return { ...actionOk(), report };
}
