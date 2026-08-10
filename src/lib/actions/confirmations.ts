'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { AppointmentStatus } from '@/generated/prisma/enums';
import { recordPatientAudit } from '@/lib/auth/guard';
import { verifyConfirmationToken } from '@/lib/confirmations';
import { toDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The only action in the app that runs without a session.
 *
 * Its whole authority is the HMAC in the link, so it does exactly two things to
 * exactly one appointment and reads nothing else. Declining marks the
 * appointment cancelled, which frees the slot for the waiting list — that is
 * the entire point of asking.
 */
export async function respondToAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('confirm');

  const token = requiredString(formData.get('token'));
  const coming = requiredString(formData.get('answer')) === 'yes';

  const appointmentId = await verifyConfirmationToken(token);
  if (!appointmentId) return actionError(t('errorInvalid'));

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      date: true,
      startTime: true,
      status: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appointment) return actionError(t('errorInvalid'));

  // Nothing to answer about an appointment the clinic has already closed.
  if (
    appointment.status === AppointmentStatus.COMPLETED ||
    appointment.status === AppointmentStatus.NO_SHOW
  ) {
    return actionError(t('errorPast'));
  }

  const now = new Date();
  try {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: coming
        ? { confirmedAt: now, declinedAt: null, status: AppointmentStatus.SCHEDULED }
        : { declinedAt: now, confirmedAt: null, status: AppointmentStatus.CANCELLED },
    });
  } catch {
    return actionError(t('errorGeneric'));
  }

  await recordPatientAudit(`${appointment.patient.firstName} ${appointment.patient.lastName}`, {
    action: coming ? 'confirmed' : 'declined',
    entity: 'appointment',
    entityId: appointmentId,
    summary: `${toDateKey(appointment.date)} ${appointment.startTime}`,
  });

  revalidatePath('/', 'layout');
  return actionOk();
}
