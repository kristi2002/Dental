import assert from 'node:assert/strict';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  BackupUnreadable,
  CURRENT_VERSION,
  decryptBackup,
  inspectBackup,
  looksEncrypted,
  PBKDF2_ITERATIONS,
} from '../src/lib/backup-inspect';

/**
 * `encrypt()` from `src/app/api/backup/route.ts`, copied deliberately.
 *
 * The route cannot be imported here — it pulls in Prisma and the session — so
 * the writing half is reproduced, and that is exactly what makes the round trip
 * below worth having: if the layout in the route ever changes and the reader is
 * not changed with it, this copy still matches the reader and the *test* is what
 * has to be updated, in the file that says why. The alternative is discovering
 * the drift on the one day a practice needs the file.
 */
function encryptLikeTheRoute(plaintext: string, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  // salt | iv | authTag | ciphertext
  return Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
}

/** A file shaped exactly as `api/backup` writes one. */
function backupFile(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'dentorganizer-backup',
    version: CURRENT_VERSION,
    exportedAt: '2026-08-20T09:15:00.000Z',
    exportedBy: 'Votim Shehu',
    note: 'Staff PIN hashes and uploaded files are not included — see README.',
    auditTruncated: false,
    auditTotal: 4210,
    data: {
      patients: Array.from({ length: 3184 }, (_, i) => ({ id: String(i) })),
      appointments: Array.from({ length: 9021 }, (_, i) => ({ id: String(i) })),
      works: Array.from({ length: 412 }, (_, i) => ({ id: String(i) })),
      staff: [{ id: 'a' }, { id: 'b' }],
      operatories: [],
      closures: [],
    },
    ...overrides,
  });
}

describe('inspectBackup — describing the file rather than grading it', () => {
  it('reads the date, the author and the totals off a real backup', () => {
    const report = inspectBackup(backupFile(), true);

    assert.equal(report.exportedAt, '2026-08-20T09:15:00.000Z');
    assert.equal(report.exportedBy, 'Votim Shehu');
    assert.equal(report.version, CURRENT_VERSION);
    assert.equal(report.encrypted, true);
    assert.equal(report.totalRows, 3184 + 9021 + 412 + 2);
  });

  it('counts every table and puts the largest first', () => {
    // "It decrypted" is not the same as "the practice is in it", so the report
    // opens on the tables that answer the second question.
    const report = inspectBackup(backupFile(), false);
    assert.deepEqual(
      report.tables.slice(0, 3).map((row) => row.table),
      ['appointments', 'patients', 'works'],
    );
    // Empty tables are still listed, and in a stable order rather than whatever
    // `Object.entries` happened to produce — alphabetical, once the headline
    // ranking has nothing left to say about them.
    assert.deepEqual(
      report.tables.filter((row) => row.rows === 0).map((row) => row.table),
      ['closures', 'operatories'],
    );
  });

  it('says out loud that PINs and uploaded files are never in there', () => {
    // Every time, not only when it bites: the two things missing from every
    // backup are the two people assume are in it.
    assert.ok(inspectBackup(backupFile(), true).notes.includes('excludesPinsAndFiles'));
  });

  it('flags a file with no patients, which is nearly always the wrong file', () => {
    const empty = backupFile({ data: { patients: [], staff: [{ id: 'a' }] } });
    const report = inspectBackup(empty, false);

    assert.ok(report.notes.includes('noPatients'));
    // Still a readable backup — the note describes it, it does not reject it.
    assert.equal(report.totalRows, 1);
  });

  it('flags a file from a newer version of the app', () => {
    const report = inspectBackup(backupFile({ version: CURRENT_VERSION + 1 }), false);
    assert.ok(report.notes.includes('newerVersion'));
  });

  it('does not flag a file from an older version, which still restores', () => {
    const report = inspectBackup(backupFile({ version: 3 }), false);
    assert.ok(!report.notes.includes('newerVersion'));
  });

  it('carries the truncated-trail warning through from the file', () => {
    const report = inspectBackup(backupFile({ auditTruncated: true, auditTotal: 900_000 }), false);
    assert.ok(report.notes.includes('auditTruncated'));
    assert.equal(report.auditTotal, 900_000);
  });

  it('refuses something that is not JSON at all', () => {
    assert.throws(
      () => inspectBackup('not a file', false),
      (error: unknown) => error instanceof BackupUnreadable && error.reason === 'notJson',
    );
  });

  it('refuses JSON that is not one of ours', () => {
    // A different app's export decrypts and parses perfectly, and reporting on
    // it as though it were a backup of this practice would be worse than
    // refusing it.
    assert.throws(
      () => inspectBackup(JSON.stringify({ format: 'something-else', data: {} }), false),
      (error: unknown) => error instanceof BackupUnreadable && error.reason === 'notABackup',
    );
  });

  it('survives a backup with no data section rather than throwing', () => {
    const report = inspectBackup(JSON.stringify({ format: 'dentorganizer-backup' }), false);
    assert.deepEqual(report.tables, []);
    assert.equal(report.totalRows, 0);
    assert.equal(report.version, null);
  });
});

describe('looksEncrypted — telling the two shapes apart by their bytes', () => {
  const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));

  it('reads plain JSON as plain, even behind whitespace', () => {
    // A file dragged out of a mail client arrives called anything at all, so the
    // name is no help and the bytes have to answer.
    assert.equal(looksEncrypted(bytes('{"format":"dentorganizer-backup"}')), false);
    assert.equal(looksEncrypted(bytes('\r\n  {"format":"x"}')), false);
  });

  it('reads a random salt as encrypted', () => {
    assert.equal(looksEncrypted(new Uint8Array([0x9f, 0x21, 0x04, 0xd3, 0x7a])), true);
  });

  it('treats an empty file as encrypted, so it fails on the passphrase path', () => {
    // Either way it is unreadable; this route gives the clearer message.
    assert.equal(looksEncrypted(new Uint8Array([])), true);
  });
});

describe('decryptBackup — opening a file the export actually wrote', () => {
  const PASSPHRASE = 'a passphrase somebody typed once in March';

  it('opens an encrypted backup and reports on what is inside it', () => {
    // The whole promise of the check screen, end to end: written the way the
    // route writes one, opened the way the screen opens one.
    const blob = encryptLikeTheRoute(backupFile(), PASSPHRASE);

    assert.equal(looksEncrypted(blob), true, 'the bytes should not look like JSON');

    const report = inspectBackup(decryptBackup(blob, PASSPHRASE), true);
    assert.equal(report.exportedBy, 'Votim Shehu');
    assert.equal(report.tables.find((row) => row.table === 'patients')?.rows, 3184);
  });

  it('refuses the wrong passphrase rather than returning nonsense', () => {
    // This is the failure the screen exists to surface: a passphrase remembered
    // wrong, found out at a moment when it can still be fixed.
    const blob = encryptLikeTheRoute(backupFile(), PASSPHRASE);

    assert.throws(
      () => decryptBackup(blob, 'the one they thought it was'),
      (error: unknown) => error instanceof BackupUnreadable && error.reason === 'badPassphrase',
    );
  });

  it('refuses a file damaged in transit, which the tag cannot tell apart', () => {
    const blob = encryptLikeTheRoute(backupFile(), PASSPHRASE);
    // One byte of the ciphertext, flipped.
    blob[blob.length - 1] ^= 0xff;

    assert.throws(
      () => decryptBackup(blob, PASSPHRASE),
      (error: unknown) => error instanceof BackupUnreadable && error.reason === 'badPassphrase',
    );
  });

  it('refuses a file too short to hold a header at all', () => {
    assert.throws(
      () => decryptBackup(Buffer.alloc(10), PASSPHRASE),
      (error: unknown) => error instanceof BackupUnreadable && error.reason === 'badPassphrase',
    );
  });

  it('leaves an unencrypted backup readable as plain text', () => {
    // The export writes `.json` when no passphrase is given, and the screen has
    // to handle that without asking for one.
    const plain = Buffer.from(backupFile(), 'utf8');
    assert.equal(looksEncrypted(plain), false);
    assert.equal(inspectBackup(plain.toString('utf8'), false).encrypted, false);
  });
});
