'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  AppointmentStatus,
  ContactChannel,
  ContactPurpose,
} from '@/generated/prisma/enums';
import { recordPatientAudit } from '@/lib/auth/guard';
import { verifyConfirmationToken } from '@/lib/confirmations';
import { today, toDateKey } from '@/lib/dates';
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
      declinedAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
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

  // The token never expires, so an appointment whose day has passed is still
  // answerable unless this says otherwise — and answering "yes" to last week
  // would put a live booking back in a slot the clinic has moved on from.
  if (appointment.date < today()) return actionError(t('errorPast'));

  // A cancellation is terminal for this link — whoever made it.
  //
  // Without this: patient declines → the slot shows free → the clinic offers it
  // to the waiting list → the first patient re-opens the same WhatsApp message
  // and taps "yes" → the chair is double-booked and nobody is told, because this
  // is the one write path in the app that does not run `findConflicts`.
  // Re-booking is a decision for the clinic, made against the real calendar.
  //
  // Confirming and *then* declining stays allowed: `declinedAt` is null while an
  // appointment still stands, and somebody who confirms on Monday and cannot
  // come on Thursday must be able to say so.
  if (
    appointment.declinedAt !== null ||
    appointment.status === AppointmentStatus.CANCELLED
  ) {
    return actionError(t('cancelledNotice'));
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

  // The patient's own answer belongs in the contact history.
  //
  // Every other exchange with this person is on that tab, and this is the one
  // the clinic can be most certain of — it is not "a message was put in front of
  // them", it is them replying. Leaving it out meant the one screen that exists
  // to answer "nobody told me" was missing the strongest evidence there is.
  //
  // No actor: nobody at the practice did this.
  try {
    await prisma.contact.create({
      data: {
        patientId: appointment.patient.id,
        appointmentId,
        channel: ContactChannel.WHATSAPP,
        purpose: ContactPurpose.CONFIRMATION,
        body: coming ? t('thanksConfirmed') : t('thanksDeclined'),
      },
    });
  } catch (error) {
    // Never allowed to undo an answer the patient has already given.
    console.error('[confirmations] could not record the reply', error);
  }

  revalidatePath('/', 'layout');
  return actionOk();
}
