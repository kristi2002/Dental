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
    perioExams,
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
    labs,
    works,
    workLines,
    followUps,
    followUpFiles,
    scheduledMessages,
    emailThreads,
    emailMessages,
    emailAttachments,
    stockAlertDismissals,
    appointmentRequests,
    requestFiles,
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
    // The periodontal history, which is the one table here whose rows can
    // never be reconstructed from anything else: the snapshot only holds the
    // newest reading and the ones before it exist nowhere but this table.
    prisma.perioExam.findMany(),
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
    // The laboratories themselves, which is where the telephone numbers live —
    // a restore without them leaves every line naming a bench nobody can ring.
    prisma.lab.findMany(),
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
    // The correspondence, which is the one thing in this file that cannot be
    // reconstructed from anything else.
    //
    // Everything else here is the practice's own record of its own decisions —
    // painful to lose and, in principle, re-derivable from paper, from memory,
    // from the patients themselves. A message somebody sent the clinic is not:
    // it exists nowhere but this database, because the whole point of the
    // inbox is that the reply stopped landing in a mailbox nobody kept. Losing
    // these rows loses what a patient actually said.
    prisma.emailThread.findMany(),
    prisma.emailMessage.findMany(),
    // The rows, not the bytes — no upload is in this file, see the note below.
    // Without them a restored practice has the message and no idea an X-ray
    // came with it.
    prisma.emailAttachment.findMany(),
    // Which low-stock alerts somebody has already waved away, and at what count.
    // The storage room's own memory of a decision — "we can live with three" —
    // and the one stock table nothing else can rebuild: the count it was waved
    // away at exists nowhere but this row. Restoring without them hands the
    // practice a cupboard that has forgotten every such answer, so the reorder
    // list comes back shouting about material somebody already looked at and
    // settled. The fastest way to teach a dentist to ignore a stock alert is to
    // show them one they have already dismissed.
    prisma.stockAlertDismissal.findMany(),
    // What came in through the practice's public page and has not been rung back
    // yet. The only table here written by somebody who is not a patient and not
    // a member of staff, and the only one whose rows represent a person waiting
    // for a telephone call — losing them loses people who asked to be seen and
    // have no idea the practice never got the message.
    prisma.appointmentRequest.findMany(),
    // The rows, not the bytes — no upload is in this file, see the note below.
    // Without them a restored practice has the enquiry and no idea the X-ray
    // that came with it was ever sent, which for somebody choosing a clinic
    // from abroad is most of what they said.
    prisma.appointmentRequestAttachment.findMany(),
    prisma.auditLog.count(),
  ]);

  const payload = JSON.stringify(
    {
      format: 'dentorganizer-backup',
      // v9 adds the files those requests arrived with — the rows, not the bytes.
      // v8 added the requests off the practice's public page — people who asked
      // to be seen and have not been rung back. v7 added the dismissed stock
      // alerts — the shelf decisions somebody has already made. v6 added the
      // correspondence — threads, messages and the
      // rows naming their attachments. v5 added the message outbox; v4 the files
      // pinned to a follow-up; v3 the laboratory register, the follow-up board,
      // stock products and the template↔treatment links. An older file still
      // restores — the restore skips a key it does not find — it simply carries
      // none of those.
      version: 9,
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
        perioExams,
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
        labs,
        works,
        workLines,
        followUps,
        followUpFiles,
        scheduledMessages,
        emailThreads,
        emailMessages,
        emailAttachments,
        stockAlertDismissals,
        appointmentRequests,
        requestFiles,
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
