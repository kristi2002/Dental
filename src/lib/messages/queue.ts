import {
  AppointmentStatus,
  ContactPurpose,
  MessageKind,
  MessageStatus,
} from '@/generated/prisma/enums';
import { addDays, clinicMinutesNow, toDateKey, today } from '@/lib/dates';
import { ACTIVE_PATIENTS } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import { getRecalls } from '@/lib/recalls';
import {
  CANCEL_NOTES,
  dedupeKey,
  recallCycle,
  REMINDER_DAYS_AHEAD,
  shouldQueueRecall,
  shouldQueueReminder,
  SKIP_NOTES,
  stillWorthSending,
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
/**
 * Withdraw rows whose moment has been and gone.
 *
 * The one piece of tidying the queue cannot do for itself. Every other way a
 * PENDING row stops being worth sending is an *event* — the slot moves, the
 * patient answers, somebody cancels — and each of those has a write it can hang
 * off. Time passing is not an event: nothing happens at nine o'clock, so nothing
 * runs, and the row sits there.
 *
 * The queue screen shows these rather than filtering them away, because a
 * reminder nobody got to is worth knowing about. But shown is not the same as
 * kept: without this they would accumulate for the life of the practice, and a
 * bucket that only ever grows is one people stop reading.
 */
export async function withdrawPassedReminders(): Promise<number> {
  const now = { dateKey: toDateKey(today()), minutes: clinicMinutesNow() };

  const stale = await prisma.scheduledMessage.findMany({
    where: {
      status: MessageStatus.PENDING,
      // Everything before today is past by definition; today's rows need the
      // clock. Anything later cannot be stale, and this is what keeps the scan
      // off the whole table.
      appointment: { date: { lte: today() } },
    },
    select: { id: true, appointment: { select: { date: true, startTime: true } } },
  });

  const passed = stale
    .filter(
      (row) =>
        row.appointment &&
        !stillWorthSending(
          { date: toDateKey(row.appointment.date), startTime: row.appointment.startTime },
          now,
        ),
    )
    .map((row) => row.id);

  if (passed.length === 0) return 0;

  const { count } = await prisma.scheduledMessage.updateMany({
    where: { id: { in: passed }, status: MessageStatus.PENDING },
    data: {
      status: MessageStatus.CANCELLED,
      note: CANCEL_NOTES.passed,
      resolvedAt: new Date(),
    },
  });

  return count;
}

export async function queueAppointmentReminders(): Promise<string> {
  const withdrawn = await withdrawPassedReminders();
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

  // Reported either way, so a run that only tidied still says what it did — a
  // `JobRun` reading "no appointments tomorrow" while it withdrew nine stale
  // rows would be an accurate sentence about the wrong half of the job.
  const tidied = withdrawn > 0 ? `withdrew ${withdrawn} that had passed; ` : '';

  if (rows.length === 0) return `${tidied}no appointments tomorrow`;

  const { count } = await prisma.scheduledMessage.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const pending = rows.filter((row) => row.status === MessageStatus.PENDING).length;
  const skipped = rows.length - pending;

  return `${tidied}${appointments.length} booked tomorrow; queued ${count} new (${pending} to send, ${skipped} skipped)`;
}

/**
 * Fill the outbox with the patients the recall list is already naming.
 *
 * The second tenant of machinery built for several, and the more consequential
 * one. Until now the *appointment reminder* — a courtesy about a slot the
 * patient has already agreed to — had the clock, the queue, the dedupe and a
 * recorded reason on every row the rules declined, while the recall had a list
 * somebody had to remember to open. A patient nobody has seen for eight months
 * is the one this practice loses.
 *
 * **It decides nothing of its own.** `getRecalls` is the single authority on who
 * is due, exactly as the recall screen reads it — so the queue and the list
 * cannot disagree, and the fix that taught that list to read the contact log
 * (`lastChasedAt`) protects this too. What this adds is the two questions the
 * recall list deliberately leaves to a person: consent, and whether the practice
 * has any way to reach them.
 *
 * Idempotent by the same construction the reminder job uses — one row per
 * patient per month, enforced by `dedupeKey` on the table rather than by a
 * find-then-insert that would race.
 */
export async function queueRecalls(): Promise<string> {
  const withdrawn = await withdrawSettledRecalls();

  const due = await getRecalls();
  const now = new Date();
  const cycle = recallCycle(now);

  const rows = due.map((patient) => {
    const decision = shouldQueueRecall({
      contactConsent: patient.contactConsent,
      phone: patient.phone,
      email: patient.email,
    });

    return {
      kind: MessageKind.RECALL_DUE,
      dedupeKey: dedupeKey('RECALL_DUE', patient.id, cycle),
      patientId: patient.id,
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

  const tidied = withdrawn > 0 ? `withdrew ${withdrawn} no longer due; ` : '';
  if (rows.length === 0) return `${tidied}nobody is overdue`;

  const { count } = await prisma.scheduledMessage.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const pending = rows.filter((row) => row.status === MessageStatus.PENDING).length;
  return `${tidied}${due.length} overdue; queued ${count} new (${pending} to send, ${rows.length - pending} skipped)`;
}

/**
 * Withdraw queued recalls for patients who are no longer due.
 *
 * The counterpart to `cancelScheduledFor`, and it cannot work the same way. A
 * reminder is about one appointment, so every event that invalidates it — the
 * slot moves, is cancelled, is answered — has a write to hang the withdrawal
 * off. A recall is about an *absence*, and absences end quietly: the patient
 * rings up and books, somebody chases them by hand, somebody snoozes them. Only
 * the first of those three even touches a table this could hook into.
 *
 * So it is settled by comparison rather than by event. Whoever `getRecalls` no
 * longer names is no longer due, whatever the reason — which keeps one authority
 * for the whole question instead of a growing list of writes that must each
 * remember to prune a queue.
 */
export async function withdrawSettledRecalls(): Promise<number> {
  const pending = await prisma.scheduledMessage.findMany({
    where: { kind: MessageKind.RECALL_DUE, status: MessageStatus.PENDING },
    select: { id: true, patientId: true },
  });
  if (pending.length === 0) return 0;

  const stillDue = new Set((await getRecalls()).map((patient) => patient.id));
  const settled = pending.filter((row) => !stillDue.has(row.patientId)).map((row) => row.id);
  if (settled.length === 0) return 0;

  const { count } = await prisma.scheduledMessage.updateMany({
    where: { id: { in: settled }, status: MessageStatus.PENDING },
    data: {
      status: MessageStatus.CANCELLED,
      note: CANCEL_NOTES['no-longer-due'],
      resolvedAt: new Date(),
    },
  });

  return count;
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
