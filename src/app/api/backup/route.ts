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
    stock,
    movements,
    plans,
    documents,
    prescriptions,
    templates,
    waitlist,
    audit,
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
    prisma.stockItem.findMany(),
    prisma.stockMovement.findMany(),
    prisma.treatmentPlan.findMany({ include: { steps: true } }),
    prisma.patientDocument.findMany(),
    prisma.prescription.findMany(),
    prisma.prescriptionTemplate.findMany(),
    prisma.waitlistEntry.findMany(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 }),
  ]);

  const payload = JSON.stringify(
    {
      format: 'dentorganizer-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: user.fullName,
      note: 'Staff PIN hashes and uploaded files are not included — see README.',
      data: {
        staff,
        patients,
        appointments,
        visits,
        teeth,
        services,
        serviceMaterials,
        stock,
        movements,
        plans,
        documents,
        prescriptions,
        templates,
        waitlist,
        audit,
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
