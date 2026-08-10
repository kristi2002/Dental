'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { AppointmentStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { toDateKey } from '@/lib/dates';
import { findConflicts } from '@/lib/scheduling';
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

  const user = await authorize('appointment.edit');
  if (!user) return actionError(t('forbidden'));

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

  // Double-booking is a warning, not a wall: an emergency squeezed between two
  // slots is a real thing a dentist does. Submitting again with `force` books it.
  if (requiredString(formData.get('force')) !== '1') {
    const conflicts = await findConflicts({
      date: data.date,
      startTime: data.startTime,
      durationMin: data.durationMin,
      excludeId: id,
    });

    if (conflicts.length > 0) {
      const names = conflicts
        .map((c) => `${c.startTime} ${c.patient.firstName} ${c.patient.lastName}`)
        .join(', ');
      return actionError(t('overlap', { list: names }), 'overlap');
    }
  }

  let savedId = id;
  try {
    if (id) {
      await prisma.appointment.update({ where: { id }, data });
    } else {
      savedId = (await prisma.appointment.create({ data, select: { id: true } })).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'appointment',
    entityId: savedId,
    summary: `${patient ? `${patient.firstName} ${patient.lastName}` : patientId} · ${date} ${startTime}`,
  });

  revalidateAll();
  return actionOk();
}

export async function setAppointmentStatus(formData: FormData): Promise<void> {
  const user = await authorize('appointment.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const status = toStatus(requiredString(formData.get('status')));
  if (!id) return;

  const appointment = await prisma.appointment.update({
    where: { id },
    data: { status },
    select: {
      date: true,
      startTime: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'appointment',
    entityId: id,
    summary: `${appointment.patient.firstName} ${appointment.patient.lastName} · ${toDateKey(appointment.date)} ${appointment.startTime} → ${status}`,
  });
  revalidateAll();
}

export async function deleteAppointment(formData: FormData): Promise<void> {
  const user = await authorize('appointment.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: {
      date: true,
      startTime: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appointment) return;

  await prisma.appointment.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'appointment',
    entityId: id,
    summary: `${appointment.patient.firstName} ${appointment.patient.lastName} · ${toDateKey(appointment.date)} ${appointment.startTime}`,
  });
  revalidateAll();
}
