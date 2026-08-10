'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { toDay } from '@/lib/dates';
import { consumeMaterialsForServices } from '@/lib/stock-consumption';
import { DEFAULT_TOOTH_STATUS, isToothStatus } from '@/lib/teeth';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function savePatient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const firstName = requiredString(formData.get('firstName'));
  const lastName = requiredString(formData.get('lastName'));
  const phone = requiredString(formData.get('phone'));

  if (!firstName || !lastName || !phone) {
    return actionError(t('fillRequired'));
  }

  const dob = optionalString(formData.get('dateOfBirth'));
  const data = {
    firstName,
    lastName,
    phone,
    email: optionalString(formData.get('email')),
    dateOfBirth: dob ? new Date(`${dob}T00:00:00.000Z`) : null,
    // The front desk keeps the diary; the chart belongs to whoever treats.
    ...(user.permissions.includes('patient.medical.edit')
      ? { medicalNotes: optionalString(formData.get('medicalNotes')) }
      : {}),
    recallMonths: Math.min(60, Math.max(0, Number(formData.get('recallMonths') ?? 6) || 0)),
  };

  let savedId = id;
  try {
    if (id) {
      await prisma.patient.update({ where: { id }, data });
    } else {
      savedId = (await prisma.patient.create({ data, select: { id: true } })).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'patient',
    entityId: savedId,
    summary: `${firstName} ${lastName}`,
  });

  revalidateAll();
  return actionOk();
}

export async function deletePatient(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  if (!patient) return;

  // Appointments, visits and tooth records cascade — see `onDelete: Cascade`.
  await prisma.patient.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'patient',
    entityId: id,
    summary: `${patient.firstName} ${patient.lastName}`,
  });
  revalidateAll();

  const locale = await getLocale();
  redirect({ href: '/patients', locale });
}

export async function saveVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const notes = requiredString(formData.get('notes'));
  const services = requiredString(formData.get('services'));
  const visitDate = optionalString(formData.get('visitDate'));
  // Ids of catalog services picked as chips — free-typed names have none, which
  // is exactly why deduction is driven by ids rather than by the text field.
  const serviceIds = requiredString(formData.get('serviceIds'))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!patientId || !notes) {
    return actionError(t('fillRequired'));
  }

  let visitId: string;
  try {
    const visit = await prisma.visitRecord.create({
      data: {
        patientId,
        notes,
        services,
        visitDate: visitDate ? new Date(`${visitDate}T00:00:00.000Z`) : toDay(new Date()),
        staffUserId: user.id,
      },
      select: { id: true },
    });
    visitId = visit.id;
  } catch {
    return actionError(t('generic'));
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : patientId;

  // Recording the visit is also the moment the materials left the cupboard.
  const consumed = await consumeMaterialsForServices(serviceIds, user.id);
  if (consumed.length > 0) {
    await recordAudit(user, {
      action: 'update',
      entity: 'stock',
      summary: consumed.map((line) => `${line.name} −${line.quantity}`).join(', '),
    });
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'visit',
    entityId: visitId,
    summary: patientName,
  });

  revalidateAll();
  return actionOk();
}

export async function deleteVisit(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const visit = await prisma.visitRecord.findUnique({
    where: { id },
    select: { patient: { select: { firstName: true, lastName: true } } },
  });

  await prisma.visitRecord.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'visit',
    entityId: id,
    summary: visit ? `${visit.patient.firstName} ${visit.patient.lastName}` : id,
  });
  revalidateAll();
}

export async function saveToothRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const toothNum = Number.parseInt(requiredString(formData.get('toothNum')), 10);
  const rawStatus = requiredString(formData.get('status'));
  const notes = optionalString(formData.get('notes'));

  if (!patientId || !Number.isInteger(toothNum) || toothNum < 1 || toothNum > 32) {
    return actionError(t('generic'));
  }
  const status = isToothStatus(rawStatus) ? rawStatus : DEFAULT_TOOTH_STATUS;

  try {
    if (status === DEFAULT_TOOTH_STATUS && !notes) {
      // "Healthy with no note" is the implicit default — drop the row instead of
      // storing noise, so the chart summary stays meaningful.
      await prisma.toothRecord.deleteMany({ where: { patientId, toothNum } });
    } else {
      await prisma.toothRecord.upsert({
        where: { patientId_toothNum: { patientId, toothNum } },
        create: { patientId, toothNum, status, notes },
        update: { status, notes },
      });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'tooth',
    entityId: patientId,
    summary: `#${toothNum} · ${status}`,
  });

  revalidateAll();
  return actionOk();
}

/** "Reminder sent" — stops the recall list nagging about someone already contacted. */
export async function markRecallContacted(formData: FormData): Promise<void> {
  const user = await authorize('recall.send');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const patient = await prisma.patient.update({
    where: { id },
    data: { lastRecallAt: new Date() },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'recall',
    entityId: id,
    summary: `${patient.firstName} ${patient.lastName}`,
  });
  revalidateAll();
}

/** "Not now" — hides someone from the recall list for a while without losing them. */
export async function snoozeRecall(formData: FormData): Promise<void> {
  const user = await authorize('recall.send');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const days = Math.min(365, Math.max(1, Number(formData.get('days')) || 30));
  if (!id) return;

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);

  const patient = await prisma.patient.update({
    where: { id },
    data: { recallSnoozedUntil: until },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'recall',
    entityId: id,
    summary: `${patient.firstName} ${patient.lastName} · +${days}d`,
  });
  revalidateAll();
}
