'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { AppointmentStatus, CancelledBy, LabCaseStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { NEW_PATIENT_VALUE } from '@/lib/booking';
import { toDateKey } from '@/lib/dates';
import { buildSearchKey } from '@/lib/patient-search';
import { completeStepForAppointment } from '@/lib/plan-progress';
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

    // The thing the lab feature was built to prevent, finally checked.
    //
    // A crown promised for the 14th cannot be fitted on the 12th, and until now
    // nothing said so — the due date lived on a list nobody had open while
    // booking. Same shape as the double-booking warning, and overridable for the
    // same reason: labs deliver early, and the practice may know something the
    // date does not.
    //
    // Skipped for a patient being created here, who cannot have a case yet.
    if (patientId !== NEW_PATIENT_VALUE) {
      const pending = await prisma.labCase.findMany({
        where: {
          patientId,
          status: LabCaseStatus.SENT,
          dueAt: { gt: data.date },
        },
        select: { kind: true, labName: true, dueAt: true },
        orderBy: { dueAt: 'asc' },
      });

      if (pending.length > 0) {
        const list = pending
          .map((c) => `${c.kind} · ${c.labName} · ${toDateKey(c.dueAt!)}`)
          .join(', ');
        return actionError(t('labPending', { list }), 'labPending');
      }
    }
  }

  // The plan step this booking fulfils, when it was started from one.
  const planStepId = optionalString(formData.get('planStepId'));

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
      } else {
        savedId = (
          await tx.appointment.create({
            data: { ...data, patientId: targetPatientId },
            select: { id: true },
          })
        ).id;

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
