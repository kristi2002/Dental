'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  AppointmentStatus,
  CancelledBy,
  ContactChannel,
  ContactPurpose,
} from '@/generated/prisma/enums';
import { recordPatientAudit } from '@/lib/auth/guard';
import { verifyConfirmationToken } from '@/lib/confirmations';
import { today, toDateKey } from '@/lib/dates';
import { cancelScheduledFor } from '@/lib/messages/queue';
import { prisma } from '@/lib/prisma';
import { CONFIRM_RATE, confirmBucket, rateLimit } from '@/lib/rate-limit';
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

  // Before the token is looked at, and on the same bucket the page spends from.
  // The page's limiter was the only one, and a server action is reachable
  // without ever loading the page it belongs to — so this is the door a guesser
  // would actually have used. See `CONFIRM_RATE`.
  const limit = rateLimit(confirmBucket(await headers()), CONFIRM_RATE);
  if (!limit.allowed) return actionError(t('tooMany'));

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
        ? {
            confirmedAt: now,
            declinedAt: null,
            // **The status is deliberately not written.**
            //
            // It used to be set to `SCHEDULED` here, which was a no-op in every
            // case this path can still reach except one — and in that one it
            // was a regression. The guards above refuse a cancelled, declined,
            // completed, no-show or past appointment, so what arrives here is
            // either `SCHEDULED` already or `ARRIVED`. Writing `SCHEDULED` over
            // `ARRIVED` un-arrives a patient who is standing at the desk: the
            // front desk's most-pressed button undone by the patient opening
            // yesterday's WhatsApp and tapping "yes", leaving `arrivedAt`
            // stamped at 09:02 against a row claiming they have not turned up.
            //
            // Confirming is a fact about the patient's intention, and
            // `confirmedAt` is where that fact lives. It has never been the
            // status's job to carry it.
            //
            // Clearing the cancellation columns stays: they belong to
            // `declinedAt`, which this branch is clearing, and leaving a reason
            // behind an appointment that is going ahead is exactly the kind of
            // disagreement the pair exists to prevent.
            cancelledBy: null,
            cancelReason: null,
          }
        : {
            declinedAt: now,
            confirmedAt: null,
            status: AppointmentStatus.CANCELLED,
            // Said, rather than left blank. Both staff cancellation paths
            // record who called it off; this one did not, so the single
            // cancellation the practice is *most* certain about — the patient
            // pressing "no" themselves — was the one filed as cancelled by
            // nobody. That is the column's whole purpose, and it left the
            // reliability score and the cancellation figures unable to tell a
            // patient who rang ahead from a row with no provenance at all.
            //
            // `cancelReason` is deliberately left alone: it holds a sentence a
            // member of staff typed, and `declinedAt` beside `cancelledBy`
            // already says everything this path knows. Filling it with
            // generated wording — in whichever of the three languages the
            // patient happened to be reading — would put words in the
            // practice's mouth to no end.
            cancelledBy: CancelledBy.PATIENT,
          },
    });
  } catch {
    return actionError(t('errorGeneric'));
  }

  // They have answered, so there is nothing left to ask. This is the case the
  // outbox most needs to honour: a patient who confirms at nine in the evening
  // and is reminded at six the next morning has been made to answer twice, and
  // the second one reads as the practice not listening.
  await cancelScheduledFor(appointmentId, 'answered');

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
