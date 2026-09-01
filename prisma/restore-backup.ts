/**
 * Replay a backup file into an empty database.
 *
 * An untested backup is a hope, not a backup. The export has been a good piece
 * of work since it shipped — full copy, optional AES-256-GCM, PIN hashes left
 * out on purpose — and there was no way to get any of it back, which meant
 * nobody had ever proved the file was worth the disk it sat on.
 *
 *     npx tsx --env-file=.env prisma/restore-backup.ts backup.json          # dry run
 *     npx tsx --env-file=.env prisma/restore-backup.ts backup.json --apply
 *     npx tsx --env-file=.env prisma/restore-backup.ts backup.json.enc --passphrase "…" --apply
 *
 * **Refuses a database that is not empty.** Merging a backup into a live
 * practice is not something this can do safely — ids would collide, and the
 * half that failed would leave the other half behind. Restore into a fresh
 * database, check it, then point the app at it.
 *
 * Two things do not come back, and the script says so rather than letting
 * somebody discover it later:
 *
 *  - **Staff PINs.** Deliberately never exported. Every account is restored
 *    disabled with an unusable credential; create the first owner with
 *    `docker/create-owner.mjs` and re-enable the rest from the Staff page.
 *  - **Uploaded files.** The `PatientDocument` rows come back and point at
 *    storage keys; the bytes have to be copied from the `storage/` directory
 *    separately. Anything missing shows up as a broken document, not as a
 *    silent gap.
 */
import { createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const PASSPHRASE = args.includes('--passphrase') ? args[args.indexOf('--passphrase') + 1] : null;

const PBKDF2_ITERATIONS = 210_000;

/** Mirrors `encrypt()` in `src/app/api/backup/route.ts`: salt | iv | tag | body. */
function decrypt(blob: Buffer, passphrase: string): string {
  const salt = blob.subarray(0, 16);
  const iv = blob.subarray(16, 28);
  const tag = blob.subarray(28, 44);
  const body = blob.subarray(44);

  const key = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/** Dates come back from JSON as strings; Prisma wants Dates. */
const DATE_FIELD = /(At|Date|Until|From|To)$/;
function revive<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] =
      typeof value === 'string' && DATE_FIELD.test(key) && !Number.isNaN(Date.parse(value))
        ? new Date(value)
        : value;
  }
  return out as T;
}

/**
 * Insert order is foreign-key order — parents before children, all the way
 * down. `stockMovements` sits late because it references items, visits *and*
 * staff, and `auditLog` last because it references everything and nothing.
 */
const ORDER = [
  'staff',
  'clinicProfile',
  'clinicHours',
  'operatories',
  'suppliers',
  'serviceCategories',
  'services',
  'stockCategories',
  // Before `stock`: a material may be one variant of a product, and a row
  // carrying a `productId` that names nothing is a foreign key violation that
  // stops the restore partway.
  'stockProducts',
  'stock',
  'productBarcodes',
  'batches',
  // After `suppliers`, `stock` and `staff`, all of which an order names. The
  // lines come after their order for the same reason everything here does.
  'purchaseOrders',
  'purchaseOrderLines',
  // After the material it is about, and far after the staff member who waved it
  // away. Both are foreign keys; `stock` is directly above and `staff` is first.
  'stockAlertDismissals',
  'patients',
  'appointments',
  'visits',
  'visitServices',
  'teeth',
  // After the visits they may name and the patients they belong to.
  'toothFindings',
  // After the visits it may name and the patients it belongs to, both above.
  'perioExams',
  // Same two parents, same reason.
  'chartExams',
  'plans',
  'documents',
  'templates',
  // After both sides it joins: the template above, the service far earlier.
  'templateServices',
  'prescriptions',
  'alerts',
  'closures',
  'waitlist',
  // The laboratory register. `workProcedures` and `labs` are free-standing
  // catalogues with no foreign keys; a case may name a patient, and a line needs
  // both its case and — since laboratories became rows — the laboratory it was
  // sent to.
  'workProcedures',
  'labs',
  'works',
  'workLines',
  // Last of the live tables, because a line may point at a patient, a case or a
  // material, and names the staff who wrote, own and closed it.
  'followUps',
  // After the lines they hang off, for the same reason every other child table
  // is: a row naming a follow-up that has not been written yet is a foreign key
  // violation partway through the restore.
  'followUpFiles',
  // The message outbox. After the patient it is addressed to, the appointment
  // it is about and the staff member who resolved it — all three are foreign
  // keys, and all three are far above.
  'scheduledMessages',
  // **After the outbox**, which it did not used to be. A contact records what
  // was put in front of a patient, and since `Contact.scheduledMessageId` exists
  // it may name the queue row it answers — so restoring it first is a foreign
  // key violation that stops the restore partway, which is the failure every
  // other comment in this list is about.
  'contacts',
  // One row a morning, and no foreign keys at all — it holds ten integers and a
  // date. Placed here rather than first only because it reads as part of the
  // same story as the outbox above it.
  'practiceDigests',
  // The correspondence, parents first: a thread points at a patient (optional,
  // and far above), a message points at its thread and at the staff member who
  // sent it, and an attachment points at its message.
  'emailThreads',
  'emailMessages',
  'emailAttachments',
  // Requests off the public page. One optional foreign key — the member of staff
  // who picked it up — so it only has to come after `staff`, which is first.
  'appointmentRequests',
  // After the requests they came with, for the reason every other child table
  // is after its parent.
  'requestFiles',
  'movements',
  'audit',
] as const;

type Key = (typeof ORDER)[number];

/** Which Prisma model each payload key restores into. */
const MODEL: Record<Key, string> = {
  staff: 'staffUser',
  clinicProfile: 'clinicProfile',
  clinicHours: 'clinicHours',
  operatories: 'operatory',
  suppliers: 'supplier',
  serviceCategories: 'serviceCategory',
  services: 'service',
  stockCategories: 'stockCategory',
  stockProducts: 'stockProduct',
  stock: 'stockItem',
  productBarcodes: 'productBarcode',
  batches: 'stockBatch',
  purchaseOrders: 'purchaseOrder',
  purchaseOrderLines: 'purchaseOrderLine',
  stockAlertDismissals: 'stockAlertDismissal',
  appointmentRequests: 'appointmentRequest',
  requestFiles: 'appointmentRequestAttachment',
  patients: 'patient',
  appointments: 'appointment',
  visits: 'visitRecord',
  visitServices: 'visitService',
  teeth: 'toothRecord',
  toothFindings: 'toothFinding',
  perioExams: 'perioExam',
  chartExams: 'chartExam',
  plans: 'treatmentPlan',
  documents: 'patientDocument',
  templates: 'prescriptionTemplate',
  templateServices: 'prescriptionTemplateService',
  prescriptions: 'prescription',
  alerts: 'patientAlert',
  contacts: 'contact',
  closures: 'closure',
  waitlist: 'waitlistEntry',
  workProcedures: 'workProcedure',
  labs: 'lab',
  works: 'work',
  workLines: 'workLine',
  followUps: 'followUp',
  followUpFiles: 'followUpAttachment',
  scheduledMessages: 'scheduledMessage',
  practiceDigests: 'practiceDigest',
  emailThreads: 'emailThread',
  emailMessages: 'emailMessage',
  emailAttachments: 'emailAttachment',
  movements: 'stockMovement',
  audit: 'auditLog',
};

/** Rows nested inside their parent by the export, restored after it. */
const NESTED: Partial<Record<Key, { field: string; model: string }>> = {
  plans: { field: 'steps', model: 'treatmentStep' },
};

async function main() {
  if (!FILE) {
    console.error('Usage: restore-backup.ts <file> [--passphrase "…"] [--apply]');
    process.exit(1);
  }

  const raw = await readFile(FILE);
  const text = PASSPHRASE ? decrypt(raw, PASSPHRASE) : raw.toString('utf8');

  let payload: { format?: string; version?: number; data?: Record<string, unknown[]> };
  try {
    payload = JSON.parse(text);
  } catch {
    console.error(
      'Could not parse the file. If it is encrypted, pass --passphrase.',
    );
    process.exit(1);
  }

  if (payload.format !== 'dentorganizer-backup') {
    console.error(`Not a DentOrganizer backup (format: ${payload.format ?? 'missing'}).`);
    process.exit(1);
  }
  console.log(`Backup format v${payload.version}, exported ${(payload as { exportedAt?: string }).exportedAt ?? '?'}`);

  const data = payload.data ?? {};

  // ---- Refuse a database that already holds a practice ---------------------
  const existing = await prisma.patient.count();
  const existingStaff = await prisma.staffUser.count();
  if (existing > 0 || existingStaff > 0) {
    console.error(
      `\nRefusing: this database already holds ${existingStaff} staff and ${existing} patients.\n` +
        'Restore into an empty database instead — merging would collide on ids and\n' +
        'could leave half a practice behind.',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('\nWhat the file holds:');
  for (const key of ORDER) {
    const rows = data[key];
    if (Array.isArray(rows) && rows.length > 0) {
      console.log(`  ${String(rows.length).padStart(6)}  ${key}`);
    }
  }
  if ((payload as { auditTruncated?: boolean }).auditTruncated) {
    console.log('\n  Note: the audit trail in this file is truncated.');
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    await prisma.$disconnect();
    return;
  }

  console.log('\nRestoring…');
  const client = prisma as unknown as Record<string, { createMany: (a: unknown) => Promise<{ count: number }> }>;

  for (const key of ORDER) {
    const rows = data[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const nested = NESTED[key];
    const children: Record<string, unknown>[] = [];

    const parents = (rows as Record<string, unknown>[]).map((row) => {
      const copy = { ...row };
      if (nested) {
        const kids = copy[nested.field];
        if (Array.isArray(kids)) children.push(...(kids as Record<string, unknown>[]));
        delete copy[nested.field];
      }
      // PIN hashes were never exported, so every account comes back with an
      // unusable credential and switched off. Better than a placeholder that
      // somebody might mistake for a working login.
      if (key === 'staff') {
        copy.pinHash = randomBytes(32).toString('hex');
        copy.pinSalt = randomBytes(16).toString('hex');
        copy.active = false;
      }
      return revive(copy);
    });

    const { count } = await client[MODEL[key]].createMany({ data: parents });
    console.log(`  ${String(count).padStart(6)}  ${MODEL[key]}`);

    if (nested && children.length > 0) {
      const { count: kidCount } = await client[nested.model].createMany({
        data: children.map((child) => revive(child)),
      });
      console.log(`  ${String(kidCount).padStart(6)}  ${nested.model}`);
    }
  }

  console.log('\nRestored.');
  console.log('Two things did NOT come back and need doing by hand:');
  console.log('  1. Staff PINs. Every account is disabled — create the first owner with');
  console.log('     `node docker/create-owner.mjs "First" "Last"`, then re-enable the rest.');
  console.log('  2. Uploaded files. Copy the storage/ directory alongside this file.');

  // A quick shape check, so a silent partial restore does not pass for a good one.
  const [patients, appointments, visits] = await Promise.all([
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.visitRecord.count(),
  ]);
  console.log(
    `\nDatabase now holds ${patients} patients, ${appointments} appointments, ${visits} visits.`,
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
