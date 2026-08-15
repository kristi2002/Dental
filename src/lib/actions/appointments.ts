'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { AppointmentStatus, CancelledBy } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { NEW_PATIENT_VALUE } from '@/lib/booking';
import { toDateKey } from '@/lib/dates';
import { buildSearchKey } from '@/lib/patient-search';
import { addDays, fromDateKey, today } from '@/lib/dates';
import { getDaySchedule } from '@/lib/queries';
import { completeStepForAppointment } from '@/lib/plan-sync';
import { findConflicts, findNextGaps, nextSlotTime, type DatedGap } from '@/lib/scheduling';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * The next few openings long enough to hold a treatment.
 *
 * An action rather than a page load because the question is asked *inside* the
 * booking dialog, after the duration is known — and the duration is exactly what
 * changes when somebody picks a different treatment. Rendering an answer with
 * the page would mean answering before the question was asked.
 */
export async function findNextSlots({
  minutes,
  staffUserId,
  fromDate,
}: {
  minutes: number;
  staffUserId?: string;
  /** `YYYY-MM-DD` to start looking from. Defaults to today. */
  fromDate?: string;
}): Promise<DatedGap[]> {
  const user = await authorize('appointment.view');
  if (!user) return [];

  const from = fromDate ? fromDateKey(fromDate) : today();
  const isToday = from.getTime() === today().getTime();

  return findNextGaps({
    from,
    minutes: Math.max(5, minutes),
    staffUserId: staffUserId || null,
    // Free time that has already passed is not an opportunity, it is a regret.
    after: isToday ? nextSlotTime() : undefined,
  });
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

  // Someone booking for the first time arrives with a name and a phone number,
  // not a record. Their details ride along with the booking and are validated
  // here; nothing is written until the slot itself is known to be free.
  let newPatient: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    dateOfBirth: Date | null;
    searchKey: string;
  } | null = null;

  if (patientId === NEW_PATIENT_VALUE) {
    if (!user.permissions.includes('patient.edit')) return actionError(t('forbidden'));

    const firstName = requiredString(formData.get('newPatientFirstName'));
    const lastName = requiredString(formData.get('newPatientLastName'));
    const phone = requiredString(formData.get('newPatientPhone'));
    if (!firstName || !lastName || !phone) return actionError(t('fillRequired'));

    const dob = optionalString(formData.get('newPatientDateOfBirth'));
    const email = optionalString(formData.get('newPatientEmail'));
    newPatient = {
      firstName,
      lastName,
      phone,
      email,
      dateOfBirth: dob ? new Date(`${dob}T00:00:00.000Z`) : null,
      // Maintained here as well as in `savePatient`: a patient created inline
      // during a booking is still a patient somebody will search for.
      searchKey: buildSearchKey({ firstName, lastName, phone, email }),
    };
  }

  const data = {
    // Stored at UTC midnight so a calendar day is one exact value.
    date: new Date(`${date}T00:00:00.000Z`),
    startTime,
    durationMin: Math.max(5, toInt(formData.get('durationMin'), 30)),
    status: toStatus(requiredString(formData.get('status'))),
    // The pair: the id to group by, the name to print. Both may be absent —
    // "no service" is a legitimate booking, and so is a name with no catalogue
    // entry behind it, which is every appointment made before the id existed.
    serviceId: optionalString(formData.get('serviceId')),
    serviceName: optionalString(formData.get('serviceName')),
    notes: optionalString(formData.get('notes')),
    // Both optional: a single-chair practice never fills them in, and the
    // conflict check falls back to treating the whole clinic as one resource.
    staffUserId: optionalString(formData.get('staffUserId')),
    operatoryId: optionalString(formData.get('operatoryId')),
  };

  // Double-booking is a warning, not a wall: an emergency squeezed between two
  // slots is a real thing a dentist does. Submitting again with `force` books it.
  //
  // Checked before anything is written, so a refused booking never leaves a
  // half-created patient behind for the retry to duplicate.
  if (requiredString(formData.get('force')) !== '1') {
    const conflicts = await findConflicts({
      date: data.date,
      startTime: data.startTime,
      durationMin: data.durationMin,
      staffUserId: data.staffUserId,
      operatoryId: data.operatoryId,
      excludeId: id,
    });

    if (conflicts.length > 0) {
      // Naming the resource matters once there is more than one: "clashes with
      // Dr B" and "clashes in chair 2" call for different fixes.
      const names = conflicts
        .map((c) => {
          const where = [c.staffName, c.operatoryName].filter(Boolean).join(' · ');
          return `${c.startTime} ${c.patient.firstName} ${c.patient.lastName}${where ? ` (${where})` : ''}`;
        })
        .join(', ');
      return actionError(t('overlap', { list: names }), 'overlap');
    }
  }

  // The plan step this booking fulfils, when it was started from one.
  const planStepId = optionalString(formData.get('planStepId'));

  // A course booked as a course: the same slot, every N days, N times.
  //
  // The follow-ups are resolved *before* anything is written and only where they
  // genuinely fit — a run at a fixed interval walks onto a closed Saturday and
  // into somebody else's crown sooner or later, and quietly double-booking eight
  // slots is a far worse answer than booking six and saying so. The form states
  // that contract before the press; the audit line states the outcome after it.
  const repeatEveryDays = id ? 0 : Math.max(0, toInt(formData.get('repeatEveryDays'), 0));
  const repeatCount = Math.min(24, Math.max(2, toInt(formData.get('repeatCount'), 2)));
  const followUps: Date[] = [];

  if (repeatEveryDays > 0) {
    for (let occurrence = 1; occurrence < repeatCount; occurrence += 1) {
      const when = addDays(data.date, repeatEveryDays * occurrence);

      const schedule = await getDaySchedule(when, data.staffUserId);
      if (schedule.closed) continue;

      const clashes = await findConflicts({
        date: when,
        startTime: data.startTime,
        durationMin: data.durationMin,
        staffUserId: data.staffUserId,
        operatoryId: data.operatoryId,
      });
      if (clashes.length > 0) continue;

      followUps.push(when);
    }
  }

  const seriesId = repeatEveryDays > 0 && followUps.length > 0 ? randomUUID() : null;

  let savedId = id;
  let createdPatientId: string | null = null;
  let resolvedWaiting = 0;
  let linkedStep = false;
  try {
    // One transaction: a patient record with no appointment is exactly the
    // orphan this feature exists to avoid creating by hand.
    await prisma.$transaction(async (tx) => {
      if (newPatient) {
        createdPatientId = (await tx.patient.create({ data: newPatient, select: { id: true } })).id;
      }
      const targetPatientId = createdPatientId ?? patientId;

      if (id) {
        await tx.appointment.update({ where: { id }, data: { ...data, patientId: targetPatientId } });

        // The waiting-room clock, kept honest from the edit form too — the
        // status select can move a slot into and out of `ARRIVED` just as the
        // one-press button can. Conditional on `arrivedAt: null` so re-saving
        // an appointment that is already in the waiting room does not restart
        // the clock and quietly report a forty-minute wait as nought.
        if (data.status === AppointmentStatus.ARRIVED) {
          await tx.appointment.updateMany({
            where: { id, arrivedAt: null },
            data: { arrivedAt: new Date() },
          });
        } else if (data.status !== AppointmentStatus.COMPLETED) {
          await tx.appointment.updateMany({ where: { id }, data: { arrivedAt: null } });
        }
      } else {
        savedId = (
          await tx.appointment.create({
            data: { ...data, patientId: targetPatientId, seriesId },
            select: { id: true },
          })
        ).id;

        // The rest of the run. Same slot, same treatment, same chair — only the
        // day moves. `createMany` because none of them needs its id back: a
        // series is read through `seriesId`, never through a list of ids.
        if (followUps.length > 0) {
          await tx.appointment.createMany({
            data: followUps.map((when) => ({
              ...data,
              date: when,
              patientId: targetPatientId,
              seriesId,
            })),
          });
        }

        // Booking somebody IS resolving their request for an earlier slot.
        // Leaving it open meant the list kept offering slots to people who had
        // already been given one, which is how a waiting list stops being read.
        // Only on create: editing an existing appointment is not a new offer.
        if (data.status === AppointmentStatus.SCHEDULED) {
          resolvedWaiting = (
            await tx.waitlistEntry.updateMany({
              where: { patientId: targetPatientId, resolvedAt: null },
              data: { resolvedAt: new Date() },
            })
          ).count;
        }

        // Booked from a treatment plan: bind the step to the slot.
        //
        // The schema has carried this relation, and a comment promising it,
        // since plans existed — with nothing on either side writing it. Until it
        // is set, "3 of 5 done" and the calendar are two separate accounts of
        // the same course of treatment, and only one of them gets updated.
        //
        // `updateMany` scoped to a still-unbooked step, so a stale id from a
        // step somebody else already booked matches nothing rather than
        // stealing its link.
        if (planStepId) {
          linkedStep = (
            await tx.treatmentStep.updateMany({
              where: { id: planStepId, appointmentId: null },
              data: { appointmentId: savedId },
            })
          ).count > 0;
        }
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  const patient = await prisma.patient.findUnique({
    where: { id: createdPatientId ?? patientId },
    select: { firstName: true, lastName: true },
  });
  const patientName = patient
    ? `${patient.firstName} ${patient.lastName}`
    : newPatient
      ? `${newPatient.firstName} ${newPatient.lastName}`
      : patientId;

  if (createdPatientId) {
    await recordAudit(user, {
      action: 'create',
      entity: 'patient',
      entityId: createdPatientId,
      summary: patientName,
    });
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'appointment',
    entityId: savedId,
    summary: `${patientName} · ${date} ${startTime}`,
  });

  // What was asked for against what actually fitted — the one place the app can
  // say "you asked for eight, six were free" after the dialog has closed.
  if (repeatEveryDays > 0) {
    await recordAudit(user, {
      action: 'create',
      entity: 'appointment',
      entityId: savedId,
      summary: `${patientName} · series ${followUps.length + 1}/${repeatCount} · every ${repeatEveryDays}d`,
    });
  }

  if (resolvedWaiting > 0) {
    await recordAudit(user, {
      action: 'update',
      entity: 'waitlist',
      entityId: createdPatientId ?? patientId,
      summary: `${patientName} · booked`,
    });
  }

  if (linkedStep) {
    await recordAudit(user, {
      action: 'update',
      entity: 'plan',
      entityId: planStepId,
      summary: `${patientName} · ${date} ${startTime}`,
    });
  }

  revalidateAll();
  return actionOk();
}

export async function setAppointmentStatus(formData: FormData): Promise<void> {
  const user = await authorize('appointment.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const status = toStatus(requiredString(formData.get('status')));
  if (!id) return;

  // Recorded only when it is actually a cancellation, so re-opening a slot
  // clears the reason rather than leaving last week's excuse attached to it.
  const cancelling = status === AppointmentStatus.CANCELLED;
  const rawBy = requiredString(formData.get('cancelledBy'));

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      status,
      cancelReason: cancelling ? optionalString(formData.get('cancelReason')) : null,
      cancelledBy: cancelling
        ? rawBy in CancelledBy
          ? (rawBy as CancelledBy)
          : CancelledBy.PATIENT
        : null,
      // The waiting-room clock. Started when they walk in, left running through
      // `COMPLETED` — how long somebody waited before being seen is worth
      // keeping — and wound back to null on any status that means they are not
      // in the waiting room at all, so a mis-tap does not leave the day sheet
      // claiming a patient who went home has been waiting four hours.
      arrivedAt:
        status === AppointmentStatus.ARRIVED
          ? new Date()
          : status === AppointmentStatus.COMPLETED
            ? undefined
            : null,
    },
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

  // The step this slot was booked for is now done, and the plan closes itself
  // if it was the last one. Nobody has to remember to say so on another screen.
  if (status === AppointmentStatus.COMPLETED) {
    const step = await completeStepForAppointment(id);
    if (step) {
      await recordAudit(user, {
        action: 'update',
        entity: 'plan',
        entityId: step.planId,
        summary: `${step.title} → DONE`,
      });
    }
  }

  revalidateAll();
}

/**
 * Move an appointment to another slot, leaving a trail that says so.
 *
 * Editing the date on a booking is not the same act and never was: it rewrites
 * the row, so the slot that was promised disappears, the patient's history shows
 * one appointment that was always on the new day, and "this has moved three
 * times" — the thing the front desk most needs to see before moving it a
 * fourth — is unrecoverable. `Appointment.rescheduledFromId` has carried a
 * comment promising exactly that since it was added, with nothing on either side
 * writing it.
 *
 * So a move is two rows: the original is called off, and a new booking points
 * back at it. The superseded slot is recorded as a **clinic** cancellation
 * whoever asked for the move, because `reliability.ts` reads that column to
 * decide who gets chased — and a patient who rings a week ahead to move an
 * appointment has done the opposite of missing it.
 */
export async function rescheduleAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('appointment.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  const date = requiredString(formData.get('date'));
  const startTime = requiredString(formData.get('startTime'));
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(startTime)) {
    return actionError(t('fillRequired'));
  }

  const original = await prisma.appointment.findUnique({
    where: { id },
    select: {
      patientId: true,
      durationMin: true,
      serviceId: true,
      serviceName: true,
      notes: true,
      staffUserId: true,
      operatoryId: true,
      seriesId: true,
      status: true,
      rescheduledTo: { select: { id: true } },
      planStep: { select: { id: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!original) return actionError(t('notFound'));

  // A slot that has already been moved must not be moved again: its replacement
  // is the live booking, and `rescheduledFromId` is unique, so a second move
  // from the same origin is a row the database would refuse anyway. Sending
  // people to the replacement is a better answer than an error about a constraint.
  if (original.rescheduledTo) return actionError(t('alreadyMoved'));

  const durationMin = Math.max(5, toInt(formData.get('durationMin'), original.durationMin));
  const when = new Date(`${date}T00:00:00.000Z`);

  if (requiredString(formData.get('force')) !== '1') {
    const conflicts = await findConflicts({
      date: when,
      startTime,
      durationMin,
      staffUserId: original.staffUserId,
      operatoryId: original.operatoryId,
      // The slot being vacated cannot clash with the slot replacing it.
      excludeId: id,
    });

    if (conflicts.length > 0) {
      const names = conflicts
        .map((c) => {
          const where = [c.staffName, c.operatoryName].filter(Boolean).join(' · ');
          return `${c.startTime} ${c.patient.firstName} ${c.patient.lastName}${where ? ` (${where})` : ''}`;
        })
        .join(', ');
      return actionError(t('overlap', { list: names }), 'overlap');
    }
  }

  const reason = optionalString(formData.get('reason'));
  let movedId = '';

  try {
    await prisma.$transaction(async (tx) => {
      movedId = (
        await tx.appointment.create({
          data: {
            patientId: original.patientId,
            date: when,
            startTime,
            durationMin,
            status: AppointmentStatus.SCHEDULED,
            serviceId: original.serviceId,
            serviceName: original.serviceName,
            notes: original.notes,
            staffUserId: original.staffUserId,
            operatoryId: original.operatoryId,
            // A moved appointment stays part of its course of treatment.
            seriesId: original.seriesId,
            rescheduledFromId: id,
          },
          select: { id: true },
        })
      ).id;

      await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledBy: CancelledBy.CLINIC,
          cancelReason: reason,
          // Whoever was in the waiting room is not any more.
          arrivedAt: null,
        },
      });

      // The plan step follows the appointment that fulfils it. Left behind, a
      // cancelled slot would go on claiming the step and completing the new
      // booking would tick nothing off.
      if (original.planStep) {
        await tx.treatmentStep.update({
          where: { id: original.planStep.id },
          data: { appointmentId: movedId },
        });
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'appointment',
    entityId: movedId,
    summary: `${original.patient.lastName} ${original.patient.firstName} · moved → ${date} ${startTime}${reason ? ` · ${reason}` : ''}`,
  });

  revalidateAll();
  return actionOk();
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
