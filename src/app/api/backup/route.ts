import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';

/**
 * A full export of the practice's data, for the owner to keep somewhere safe.
 *
 * The realistic disaster for a single-clinic Postgres is not a breach — it is a
 * dead disk and no copy. This is the one-click copy.
 *
 * PIN hashes are excluded on purpose: a backup should restore the practice, not
 * hand someone an offline target for cracking staff credentials. Uploaded files
 * are not included either; they live under the storage directory and should be
 * copied with the ordinary file backup (see the README).
 */

const PBKDF2_ITERATIONS = 210_000;

/**
 * How many audit rows to carry.
 *
 * The trail is kept for seven years (`AUDIT_RETENTION_MONTHS`), which is far
 * more than belongs in a file somebody downloads over a clinic's broadband and
 * this route builds as one pretty-printed string in memory. So this is a
 * *transfer* bound, not a retention one, and the two should not be confused:
 * 20 000 was neither, and quietly carried a few months.
 *
 * Where the rest lives is now a real answer rather than a shrug.
 * `docker/prune-audit.mjs` archives everything past the retention period to
 * JSON lines on the same volume as the patient files, so the long trail is
 * covered by the file backup the README already asks for — see "Backups exclude
 * PIN hashes and uploaded files".
 *
 * `auditTruncated` and `auditTotal` still state plainly when this bites, because
 * a reader has no other way to tell a complete trail from a cut one.
 */
const AUDIT_LIMIT = 100_000;

function encrypt(plaintext: string, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  // salt | iv | authTag | ciphertext — everything needed to decrypt except the
  // passphrase, which is never stored anywhere.
  return Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('backup.export')) {
    return new NextResponse(null, { status: 404 });
  }

  const form = await request.formData();
  const passphrase = String(form.get('passphrase') ?? '').trim();

  const [
    staff,
    patients,
    appointments,
    visits,
    teeth,
    services,
    serviceMaterials,
    stockProducts,
    stock,
    movements,
    plans,
    documents,
    prescriptions,
    templates,
    waitlist,
    audit,
    visitServices,
    alerts,
    contacts,
    suppliers,
    batches,
    productBarcodes,
    stockCategories,
    serviceCategories,
    operatories,
    closures,
    clinicHours,
    clinicProfile,
    templateServices,
    workProcedures,
    works,
    workLines,
    followUps,
    followUpFiles,
    scheduledMessages,
    auditTotal,
  ] = await Promise.all([
    prisma.staffUser.findMany({
      // Everything except the credentials.
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        active: true,
        createdAt: true,
      },
    }),
    prisma.patient.findMany(),
    prisma.appointment.findMany(),
    prisma.visitRecord.findMany(),
    prisma.toothRecord.findMany(),
    prisma.service.findMany(),
    prisma.serviceMaterial.findMany(),
    // Before `stock`, because every material may name the product it is a
    // variant of. Without these the restore inserts a `StockItem` holding a
    // `productId` that names nothing and stops there, partway through — which is
    // the worst way for a restore to fail, because everything before it worked.
    prisma.stockProduct.findMany(),
    prisma.stockItem.findMany(),
    prisma.stockMovement.findMany(),
    prisma.treatmentPlan.findMany({ include: { steps: true } }),
    prisma.patientDocument.findMany(),
    prisma.prescription.findMany(),
    prisma.prescriptionTemplate.findMany(),
    prisma.waitlistEntry.findMany(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: AUDIT_LIMIT }),
    // Everything added since this export was first written. A backup that
    // restores two thirds of a practice is not a backup — it is a file that
    // makes somebody believe they have one.
    prisma.visitService.findMany(),
    prisma.patientAlert.findMany(),
    prisma.contact.findMany(),
    prisma.supplier.findMany(),
    prisma.stockBatch.findMany(),
    // Which code names which material. Learned one carton at a time by whoever
    // was holding it, and impossible to reconstruct from anywhere else — a
    // restore without these hands the practice a working cupboard and a scanner
    // that has forgotten every product in it.
    prisma.productBarcode.findMany(),
    // Without these the materials restore holding an id that names nothing, and
    // the storage room comes back as one undivided list.
    prisma.stockCategory.findMany(),
    // Same for the catalogue: without these the services restore holding an id
    // that names nothing, and the price list comes back as one undivided list.
    //
    // Departments first, because this table references itself and the restore
    // writes each key in one `createMany` — a subcategory ahead of its own
    // department is a foreign key violation partway through the restore.
    prisma.serviceCategory.findMany({ orderBy: { parentId: { sort: 'asc', nulls: 'first' } } }),
    prisma.operatory.findMany(),
    prisma.closure.findMany(),
    prisma.clinicHours.findMany(),
    prisma.clinicProfile.findMany(),
    // Which standard wording follows which treatment. A join table, and the only
    // record of a decision somebody made once per template — restoring the
    // templates without it hands the dentist the flat list of everything the
    // practice has ever saved, which is the state the link was added to end.
    prisma.prescriptionTemplateService.findMany(),
    // The laboratory register, in full. Three tables and an entire module of the
    // app, absent from every export written before this: a practice restoring
    // from backup got its patients and its cupboard back and lost every case it
    // had ever sent out, along with the serial numbers the lab bills against.
    prisma.workProcedure.findMany(),
    prisma.work.findMany(),
    prisma.workLine.findMany(),
    // The practice's own board of things to come back to. Same story — a whole
    // module, and the one table holding work that has not happened yet.
    prisma.followUp.findMany(),
    // What is pinned to those lines. The bytes are not in this file — no upload
    // ever is, see the note below — but without the rows a restored practice
    // has the errand and no idea a photograph of the casting was ever attached.
    prisma.followUpAttachment.findMany(),
    // The outbox: patient messages queued but not yet sent, and the record of
    // which ones somebody cancelled and why.
    //
    // This one is worse to lose than it looks. `dedupeKey` is unique, and it is
    // the only thing making the reminder job safe to run twice — a restore
    // without these rows brings back a practice whose every already-handled
    // reminder has lost its key, so the next sweep queues the lot again and the
    // patients get them a second time. The backup would not have lost data so
    // much as re-armed it.
    prisma.scheduledMessage.findMany(),
    prisma.auditLog.count(),
  ]);

  const payload = JSON.stringify(
    {
      format: 'dentorganizer-backup',
      // v5 adds the message outbox. v4 added the files pinned to a follow-up;
      // v3 the laboratory register, the follow-up board, stock products and the
      // template↔treatment links. An older file still restores — the restore
      // skips a key it does not find — it simply carries none of those.
      version: 5,
      exportedAt: new Date().toISOString(),
      exportedBy: user.fullName,
      note: 'Staff PIN hashes and uploaded files are not included — see README.',
      // Stated rather than implied: a reader has no other way to tell a
      // complete trail from a truncated one.
      auditTruncated: auditTotal > audit.length,
      auditTotal,
      data: {
        staff,
        patients,
        appointments,
        visits,
        teeth,
        services,
        serviceMaterials,
        stockProducts,
        stock,
        movements,
        plans,
        documents,
        prescriptions,
        templates,
        waitlist,
        audit,
        visitServices,
        alerts,
        contacts,
        suppliers,
        batches,
        productBarcodes,
        stockCategories,
        serviceCategories,
        operatories,
        closures,
        clinicHours,
        clinicProfile,
        templateServices,
        workProcedures,
        works,
        workLines,
        followUps,
        followUpFiles,
        scheduledMessages,
      },
    },
    null,
    2,
  );

  const encrypted = passphrase.length > 0;
  const body = encrypted ? encrypt(payload, passphrase) : Buffer.from(payload, 'utf8');
  const fileName = `dentorganizer-${toDateKey(today())}.json${encrypted ? '.enc' : ''}`;

  await recordAudit(user, {
    action: 'create',
    entity: 'backup',
    summary: encrypted ? `${fileName} (encrypted)` : fileName,
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': encrypted ? 'application/octet-stream' : 'application/json',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
