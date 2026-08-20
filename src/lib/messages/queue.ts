import { AppointmentStatus, ContactPurpose, MessageStatus } from '@/generated/prisma/enums';
import { addDays, today } from '@/lib/dates';
import { ACTIVE_PATIENTS } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import {
  CANCEL_NOTES,
  dedupeKey,
  REMINDER_DAYS_AHEAD,
  shouldQueueReminder,
  SKIP_NOTES,
  type CancelReason,
} from './outbox';

/**
 * Filling the outbox, and emptying it again when the reason goes away.
 *
 * The queueing half runs on a clock. The cancelling half runs on every write
 * that could invalidate a queued row, and is the half worth being careful
 * about: a queue nobody prunes is a queue that eventually reminds somebody
 * about an appointment they cancelled a week ago, which is worse than never
 * having reminded them at all.
 */

/**
 * Queue reminders for tomorrow's bookings.
 *
 * Idempotent by construction, not by checking: every row carries a `dedupeKey`
 * unique on the table, so a second run inside the same day collides and is
 * skipped rather than duplicating. That is why `createMany` with
 * `skipDuplicates` is right here and a find-then-insert would not be — the
 * latter has a race, and this job may well be triggered twice by a deploy
 * restarting the container at the wrong minute.
 *
 * Rows the rules refuse are recorded as SKIPPED rather than left out. A queue
 * that silently omits somebody cannot answer "why did Mr Hoxha not get one?",
 * and that is the question the front desk actually asks.
 */
export async function queueAppointmentReminders(): Promise<string> {
  const day = addDays(today(), REMINDER_DAYS_AHEAD);

  const appointments = await prisma.appointment.findMany({
    where: {
      date: day,
      status: AppointmentStatus.SCHEDULED,
      patient: ACTIVE_PATIENTS,
    },
    select: {
      id: true,
      patientId: true,
      confirmedAt: true,
      declinedAt: true,
      patient: { select: { phone: true, email: true, contactConsent: true } },
      contacts: {
        where: { purpose: ContactPurpose.REMINDER },
        select: { id: true },
        take: 1,
      },
    },
  });

  const now = new Date();
  const rows = appointments.map((appointment) => {
    const decision = shouldQueueReminder({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      contactConsent: appointment.patient.contactConsent,
      phone: appointment.patient.phone,
      email: appointment.patient.email ?? '',
      answered: appointment.confirmedAt !== null || appointment.declinedAt !== null,
      alreadyContacted: appointment.contacts.length > 0,
    });

    return {
      kind: 'APPOINTMENT_REMINDER' as const,
      dedupeKey: dedupeKey('APPOINTMENT_REMINDER', appointment.id),
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      sendAfter: now,
      ...(decision.queue
        ? { status: MessageStatus.PENDING }
        : {
            status: MessageStatus.SKIPPED,
            note: SKIP_NOTES[decision.reason],
            resolvedAt: now,
          }),
    };
  });

  if (rows.length === 0) return 'no appointments tomorrow';

  const { count } = await prisma.scheduledMessage.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const pending = rows.filter((row) => row.status === MessageStatus.PENDING).length;
  const skipped = rows.length - pending;

  return `${appointments.length} booked tomorrow; queued ${count} new (${pending} to send, ${skipped} skipped)`;
}

/**
 * Withdraw anything still waiting to be sent about one appointment.
 *
 * Called from every path that changes what a booking *is* — rescheduling,
 * status changes, deletion, and the patient answering their own confirmation
 * link. Only PENDING rows are touched: a message already sent is a fact, and a
 * row already skipped has its own reason on it that this must not overwrite.
 *
 * Never throws. A reminder that fails to withdraw is a message somebody may
 * send by hand and then wonder about; an appointment that fails to cancel
 * because the outbox was unreachable is a slot the practice believes it still
 * has. The second is much worse, so this is deliberately unable to cause it.
 */
export async function cancelScheduledFor(
  appointmentId: string,
  reason: CancelReason,
): Promise<number> {
  if (!appointmentId) return 0;

  try {
    const { count } = await prisma.scheduledMessage.updateMany({
      where: { appointmentId, status: MessageStatus.PENDING },
      data: {
        status: MessageStatus.CANCELLED,
        note: CANCEL_NOTES[reason],
        resolvedAt: new Date(),
      },
    });
    return count;
  } catch (error) {
    console.error('[messages] could not withdraw queued reminders for', appointmentId, error);
    return 0;
  }
}
