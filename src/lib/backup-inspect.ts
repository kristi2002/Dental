/**
 * Reading a backup file back, to find out whether it is any good.
 *
 * ## Why this is not a restore button
 *
 * The obvious feature here is "upload the file, put it back". It is not built,
 * and the reason is written down in `prisma/restore-backup.ts`, which has been
 * the restore path since it shipped: **it refuses a database that is not empty.**
 * Merging a backup into a live practice cannot be done safely — the ids collide,
 * and the half that fails leaves the other half behind. The only correct restore
 * is into a fresh database, checked, and then pointed at.
 *
 * A web button cannot do that. The app is, by definition, already connected to
 * the live database, so a restore triggered from inside it would be a
 * wipe-and-replay of the practice's own medical records, mid-session, with no
 * way back. That is not a thing that should be one click away, and shipping it
 * because it was asked for would be the sort of feature that is fine for a year
 * and then ends a practice.
 *
 * ## What it does instead
 *
 * The half a web app *can* honestly do, and the half that was actually missing.
 * `docs/RESTORE.md` says an untested backup is a hope rather than a backup; the
 * Sunday drill proves the *automatic* copies, and nothing proved the file an
 * owner downloads by hand and keeps on a memory stick. Until now the only way to
 * find out whether that file decrypts, whether the passphrase typed six months
 * ago is the one being remembered today, and whether the practice is actually
 * inside it, was to build a database and try.
 *
 * So this decrypts the file, checks its shape, and says what is in it — table by
 * table, with the date it was taken and whether the audit trail was truncated.
 * It writes nothing anywhere. Everything below is pure so it can be tested
 * without a file or a database.
 */

import { createDecipheriv, pbkdf2Sync } from 'node:crypto';

/** What the export writes into the file, and what this refuses to read without. */
const FORMAT = 'dentorganizer-backup';

/** Mirrors `encrypt()` in the backup route: salt | iv | tag | body. */
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const HEADER_BYTES = SALT_BYTES + IV_BYTES + TAG_BYTES;

/** Must match the export's, or the derived key is not the same key. */
export const PBKDF2_ITERATIONS = 210_000;

/** The tables worth naming in a report, in the order a practice cares about. */
const HEADLINE_TABLES = [
  'patients',
  'appointments',
  'visits',
  'plans',
  'works',
  'prescriptions',
  'documents',
  'stock',
  'services',
  'staff',
] as const;

export type BackupReport = {
  /** When the backup was taken, as written into the file. */
  exportedAt: string | null;
  exportedBy: string | null;
  version: number | null;
  /** Whether the file was encrypted — decided by the caller, which holds bytes. */
  encrypted: boolean;
  /** Every table in the file with a row count, largest first. */
  tables: { table: string; rows: number }[];
  /** The total across every table. */
  totalRows: number;
  /**
   * The trail was cut to `AUDIT_LIMIT` when the file was written. Not a fault —
   * the rest is archived beside the patient files — but a reader has no other
   * way to tell a complete trail from a truncated one.
   */
  auditTruncated: boolean;
  auditTotal: number | null;
  /**
   * Things worth saying out loud about this file. Never an error — a backup
   * that decrypts and holds the practice is a good backup even if something
   * here is worth knowing.
   */
  notes: BackupNote[];
};

export type BackupNote =
  /** No patients in it. Almost always the wrong file rather than an empty practice. */
  | 'noPatients'
  /** Written by a newer version of the app than this one knows about. */
  | 'newerVersion'
  /** The audit trail was cut when the file was written. */
  | 'auditTruncated'
  /** Reminder, every time: these two never travel in the file. See the README. */
  | 'excludesPinsAndFiles';

/** The newest format this app writes; see the `version` note in the route. */
export const CURRENT_VERSION = 5;

export class BackupUnreadable extends Error {
  constructor(readonly reason: 'notJson' | 'notABackup' | 'badPassphrase') {
    super(reason);
    this.name = 'BackupUnreadable';
  }
}

/**
 * The encrypted form back to text.
 *
 * Mirrors `encrypt()` in `api/backup/route.ts` byte for byte — salt, iv, tag,
 * body — and that mirroring is the whole risk here: the two halves live in
 * different files, and a backup whose layout drifted would be a file that opens
 * on the day it is written and never again. Which is why this sits in a pure
 * module rather than inside the action that calls it, and why the test beside it
 * encrypts with the route's own recipe before asking this to open it.
 *
 * Throws `badPassphrase` for a wrong key *and* for a file damaged in transit:
 * AES-GCM's tag cannot tell those apart, and neither can the reader.
 */
export function decryptBackup(blob: Buffer, passphrase: string): string {
  if (blob.length <= HEADER_BYTES) throw new BackupUnreadable('badPassphrase');

  const salt = blob.subarray(0, SALT_BYTES);
  const iv = blob.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const tag = blob.subarray(SALT_BYTES + IV_BYTES, HEADER_BYTES);
  const body = blob.subarray(HEADER_BYTES);

  const key = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    // `final()` is where the tag is verified.
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    throw new BackupUnreadable('badPassphrase');
  }
}

/**
 * The decrypted text as a report.
 *
 * Throws only when the file is not a backup at all. Everything else — an empty
 * practice, a version from the future, a cut trail — comes back as a note,
 * because the whole point is to *describe* the file rather than to grade it.
 */
export function inspectBackup(text: string, encrypted: boolean): BackupReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupUnreadable('notJson');
  }

  if (typeof parsed !== 'object' || parsed === null) throw new BackupUnreadable('notABackup');
  const file = parsed as Record<string, unknown>;
  if (file.format !== FORMAT) throw new BackupUnreadable('notABackup');

  const data =
    typeof file.data === 'object' && file.data !== null
      ? (file.data as Record<string, unknown>)
      : {};

  const tables = Object.entries(data)
    .map(([table, rows]) => ({ table, rows: Array.isArray(rows) ? rows.length : 0 }))
    // Largest first, so the report opens on the tables that say whether this is
    // a real practice or an empty shell. `HEADLINE_TABLES` breaks the ties, so
    // two empty tables come out in a stable and sensible order rather than in
    // whatever order `Object.entries` happened to produce.
    .sort(
      (a, b) =>
        b.rows - a.rows ||
        headlineRank(a.table) - headlineRank(b.table) ||
        a.table.localeCompare(b.table),
    );

  const version = typeof file.version === 'number' ? file.version : null;
  const auditTruncated = file.auditTruncated === true;

  const notes: BackupNote[] = [];
  const patients = tables.find((row) => row.table === 'patients')?.rows ?? 0;
  // Far more often the wrong file than a practice with no patients — an empty
  // one is exactly what a backup taken against a fresh database looks like.
  if (patients === 0) notes.push('noPatients');
  if (version !== null && version > CURRENT_VERSION) notes.push('newerVersion');
  if (auditTruncated) notes.push('auditTruncated');
  // Said every time rather than only when it bites: the two things missing from
  // every backup are the two people assume are in it.
  notes.push('excludesPinsAndFiles');

  return {
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null,
    exportedBy: typeof file.exportedBy === 'string' ? file.exportedBy : null,
    version,
    encrypted,
    tables,
    totalRows: tables.reduce((sum, row) => sum + row.rows, 0),
    auditTruncated,
    auditTotal: typeof file.auditTotal === 'number' ? file.auditTotal : null,
    notes,
  };
}

function headlineRank(table: string): number {
  const index = (HEADLINE_TABLES as readonly string[]).indexOf(table);
  return index === -1 ? HEADLINE_TABLES.length : index;
}

/**
 * Whether these bytes look like the encrypted form rather than plain JSON.
 *
 * The export names the two apart — `.json` and `.json.enc` — but a file that has
 * been renamed, or dragged out of a mail client, arrives called anything at all.
 * Plain JSON from this app always opens `{`, optionally behind whitespace; the
 * encrypted form opens with 16 bytes of random salt, which begins with `{` about
 * once in 256 files and is then rejected as unreadable rather than misread.
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  for (const byte of bytes.subarray(0, 8)) {
    // Space, tab, CR, LF — the only things allowed before the brace.
    if (byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a) continue;
    return byte !== 0x7b; // '{'
  }
  return true;
}
