'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { AppointmentStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

function toStatus(value: string): AppointmentStatus {
  return value in AppointmentStatus
    ? (value as AppointmentStatus)
    : AppointmentStatus.SCHEDULED;
}

export async function saveAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const id = optionalString(formData.get('id'));
  const patientId = requiredString(formData.get('patientId'));
  const date = requiredString(formData.get('date'));
  const startTime = requiredString(formData.get('startTime'));

  if (!patientId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(startTime)) {
    return actionError(t('fillRequired'));
  }

  const data = {
    patientId,
    // Stored at UTC midnight so a calendar day is one exact value.
    date: new Date(`${date}T00:00:00.000Z`),
    startTime,
    durationMin: Math.max(5, toInt(formData.get('durationMin'), 30)),
    status: toStatus(requiredString(formData.get('status'))),
    serviceName: optionalString(formData.get('serviceName')),
    notes: optionalString(formData.get('notes')),
  };

  try {
    if (id) {
      await prisma.appointment.update({ where: { id }, data });
    } else {
      await prisma.appointment.create({ data });
    }
  } catch {
    return actionError(t('generic'));
  }

  revalidateAll();
  return actionOk();
}

export async function setAppointmentStatus(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  const status = toStatus(requiredString(formData.get('status')));
  if (!id) return;

  await prisma.appointment.update({ where: { id }, data: { status } });
  revalidateAll();
}

export async function deleteAppointment(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  if (!id) return;

  await prisma.appointment.delete({ where: { id } });
  revalidateAll();
}
