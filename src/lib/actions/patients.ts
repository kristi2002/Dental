'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { toDay } from '@/lib/dates';
import { DEFAULT_TOOTH_STATUS, isToothStatus } from '@/lib/teeth';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function savePatient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

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
    medicalNotes: optionalString(formData.get('medicalNotes')),
  };

  try {
    if (id) {
      await prisma.patient.update({ where: { id }, data });
    } else {
      await prisma.patient.create({ data });
    }
  } catch {
    return actionError(t('generic'));
  }

  revalidateAll();
  return actionOk();
}

export async function deletePatient(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  if (!id) return;

  // Appointments, visits and tooth records cascade — see `onDelete: Cascade`.
  await prisma.patient.delete({ where: { id } });
  revalidateAll();

  const locale = await getLocale();
  redirect({ href: '/patients', locale });
}

export async function saveVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const patientId = requiredString(formData.get('patientId'));
  const notes = requiredString(formData.get('notes'));
  const services = requiredString(formData.get('services'));
  const visitDate = optionalString(formData.get('visitDate'));

  if (!patientId || !notes) {
    return actionError(t('fillRequired'));
  }

  try {
    await prisma.visitRecord.create({
      data: {
        patientId,
        notes,
        services,
        visitDate: visitDate ? new Date(`${visitDate}T00:00:00.000Z`) : toDay(new Date()),
      },
    });
  } catch {
    return actionError(t('generic'));
  }

  revalidateAll();
  return actionOk();
}

export async function deleteVisit(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  if (!id) return;

  await prisma.visitRecord.delete({ where: { id } });
  revalidateAll();
}

export async function saveToothRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

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

  revalidateAll();
  return actionOk();
}
