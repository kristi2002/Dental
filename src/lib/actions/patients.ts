'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppointmentStatus, ContactChannel } from '@/generated/prisma/enums';
import { redirect } from '@/i18n/navigation';
import { locales } from '@/i18n/routing';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { deleteStoredFile } from '@/lib/files';
import type { PatientOption } from '@/components/appointments/AppointmentFormDialog';
import {
  ACTIVE_PATIENTS,
  buildSearchKey,
  fold,
  patientSearchClauses,
} from '@/lib/patient-search';
import { parseMaterialList } from '@/lib/material-history';
import { completeStepForAppointment } from '@/lib/plan-sync';
import { prisma } from '@/lib/prisma';
import { findPhoneDuplicates } from '@/lib/queries';
import { takeFromShelf } from '@/lib/stock-consumption';
import { timeToMinutes, today } from '@/lib/dates';
import { DEFAULT_TOOTH_STATUS, formatSurfaces, isToothStatus, isValidTooth } from '@/lib/teeth';
import { optionalString, parseServiceList, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/** `''` → null (never asked), `'1'` → yes, anything else → no. */
function toConsent(value: string | null): boolean | null {
  if (value === null || value === '') return null;
  return value === '1';
}

function toChannel(value: string | null): ContactChannel | null {
  return value && value in ContactChannel ? (value as ContactChannel) : null;
}

function toPatientLocale(value: string | null): string | null {
  return value && (locales as readonly string[]).includes(value) ? value : null;
}

/**
 * The handful of people matching what somebody has typed so far.
 *
 * Every booking screen used to receive the *entire* patient list as a prop, and
 * three of them are the busiest pages in the app — so a practice with 3 000
 * patients serialised a few hundred KB of names into every navigation, for a
 * dropdown most visits never open. This is the same question asked properly.
 *
 * Two characters minimum: a single letter matches most of a file drawer, and
 * answering it would be the same table dump by another route.
 */
export async function searchPatients(query: string): Promise<PatientOption[]> {
  const user = await authorize('patient.view');
  if (!user) return [];

  const folded = fold(query);
  const digits = query.replace(/\D/g, '');
  if (folded.length < 2 && digits.length < 3) return [];

  const rows = await prisma.patient.findMany({
    // Same fallback as the patient list: `searchKey` is filled by a backfill,
    // and a deployment that has not run it yet must still find people.
    where: { ...ACTIVE_PATIENTS, OR: patientSearchClauses(query, folded, digits) },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    // Enough to recognise the right person, few enough that the list stays a
    // list rather than becoming the drawer again.
    take: 20,
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  return rows.map((patient) => ({
    id: patient.id,
    name: `${patient.lastName} ${patient.firstName}`,
    // Two people genuinely share a name in a small town; the number is what
    // tells them apart at the desk.
    phone: patient.phone,
  }));
}

export async function savePatient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const firstName = requiredString(formData.get('firstName'));
  const lastName = requiredString(formData.get('lastName'));
  const phone = requiredString(formData.get('phone'));

  if (!firstName || !lastName || !phone) {
    return actionError(t('fillRequired'));
  }

  // Warned about, never refused — see `findPhoneDuplicates`, which the booking
  // dialog's inline "new patient" path now asks the same question of.
  if (!id && requiredString(formData.get('force')) !== '1') {
    const duplicates = await findPhoneDuplicates(phone);
    if (duplicates.length > 0) {
      return actionError(t('duplicatePhone', { list: duplicates.join(', ') }), 'duplicate');
    }
  }

  const dob = optionalString(formData.get('dateOfBirth'));
  const data = {
    firstName,
    lastName,
    phone,
    searchKey: buildSearchKey({ firstName, lastName, phone, email: formData.get('email')?.toString() }),
    email: optionalString(formData.get('email')),
    dateOfBirth: dob ? new Date(`${dob}T00:00:00.000Z`) : null,
    // The front desk keeps the diary; the chart belongs to whoever treats.
    ...(user.permissions.includes('patient.medical.edit')
      ? { medicalNotes: optionalString(formData.get('medicalNotes')) }
      : {}),
    recallMonths: Math.min(60, Math.max(0, Number(formData.get('recallMonths') ?? 6) || 0)),
    // Three states, not two: "" is nobody-asked, which is what an imported or
    // pre-existing record honestly is.
    contactConsent: toConsent(optionalString(formData.get('contactConsent'))),
    preferredChannel: toChannel(optionalString(formData.get('preferredChannel'))),
    locale: toPatientLocale(optionalString(formData.get('locale'))),
    guardianName: optionalString(formData.get('guardianName')),
    guardianPhone: optionalString(formData.get('guardianPhone')),
    address: optionalString(formData.get('address')),
    fiscalCode: optionalString(formData.get('fiscalCode')),
    emergencyContact: optionalString(formData.get('emergencyContact')),
    referralSource: optionalString(formData.get('referralSource')),
  };

  let savedId = id;
  try {
    if (id) {
      await prisma.patient.update({ where: { id }, data });
    } else {
      savedId = (await prisma.patient.create({ data, select: { id: true } })).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'patient',
    entityId: savedId,
    summary: `${firstName} ${lastName}`,
  });

  revalidateAll();

  // Registering somebody is done on a page of its own, and the thing you do next
  // is always to the record you have just made — book them in, note an allergy.
  // An edit is submitted from a dialog on the record itself, so it stays put.
  if (!id) {
    redirect({ href: `/patients/${savedId}`, locale: await getLocale() });
  }

  return actionOk();
}

export async function deletePatient(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  if (!patient) return;

  // The rows cascade; the bytes on disk do not. Read the keys first — after the
  // delete there is nothing left pointing at them, and an X-ray that outlives
  // the record it belonged to is both a storage leak and a data-protection
  // failure: the record was deleted, the radiograph was not.
  const documents = await prisma.patientDocument.findMany({
    where: { patientId: id },
    select: { storageKey: true },
  });

  // Appointments, visits and tooth records cascade — see `onDelete: Cascade`.
  await prisma.patient.delete({ where: { id } });

  // Best-effort and after the fact: a file that will not unlink must not undo a
  // delete the database has already committed.
  await Promise.all(documents.map((document) => deleteStoredFile(document.storageKey)));

  await recordAudit(user, {
    action: 'delete',
    entity: 'patient',
    entityId: id,
    summary: `${patient.firstName} ${patient.lastName}`,
  });
  revalidateAll();

  const locale = await getLocale();
  redirect({ href: '/patients', locale });
}

/**
 * Retire a patient from the lists without touching a word of their record.
 *
 * Staff are deactivated rather than deleted, and materials are archived rather
 * than removed, both for the same stated reason: the history hanging off the row
 * is the asset and the row is only its label. Patients — who carry more history
 * than either, and whose records carry a legal retention period in every
 * jurisdiction this ships to — were the one thing the app still erased outright.
 *
 * `patient.edit`, not `patient.delete`: this is the *safe* action, the one that
 * should be easy to reach, and gating it behind the owner would leave hard
 * deletion as the only thing the front desk could do with somebody who has moved
 * away.
 */
export async function archivePatient(formData: FormData): Promise<void> {
  const user = await authorize('patient.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  // A blank `archived` un-archives: one action, both directions, so restoring
  // somebody who was filed away by mistake needs no second verb.
  const archiving = requiredString(formData.get('archived')) !== '0';

  const patient = await prisma.patient.update({
    where: { id },
    data: { archivedAt: archiving ? new Date() : null },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'patient',
    entityId: id,
    summary: `${patient.lastName} ${patient.firstName} → ${archiving ? 'archived' : 'restored'}`,
  });
  revalidateAll();
}

/**
 * Fold one duplicate record into another.
 *
 * The app has detected duplicates on the way in since inline booking made them
 * likely — "a patient with this number already exists" — and then had nothing to
 * say about the two that already exist. So the front desk's real options were to
 * leave both (and have half the history on each) or to delete one (and lose that
 * half). Both are worse than the third answer nobody could reach.
 *
 * Everything that points at the loser is repointed at the survivor, in one
 * transaction, and the blanks on the survivor are filled from the loser — which
 * is the practical reason two records exist at all: one has the email, the other
 * has the date of birth.
 *
 * The loser is archived rather than deleted. It keeps a stale link, a printed
 * slip and an audit entry resolving to *something*, and it costs one row.
 *
 * Owner-only. It is not reversible by pressing anything.
 */
export async function mergePatients(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.delete');
  if (!user) return actionError(t('forbidden'));

  const keepId = requiredString(formData.get('keepId'));
  const mergeId = requiredString(formData.get('mergeId'));
  if (!keepId || !mergeId) return actionError(t('fillRequired'));
  if (keepId === mergeId) return actionError(t('mergeSame'));

  const [keep, merge] = await Promise.all([
    prisma.patient.findUnique({ where: { id: keepId } }),
    prisma.patient.findUnique({ where: { id: mergeId } }),
  ]);
  if (!keep || !merge) return actionError(t('notFound'));

  // Only what the survivor is missing. A merge must never overwrite a value
  // somebody has looked at and confirmed with one nobody has.
  const fill: Record<string, unknown> = {};
  const takeIfBlank = <K extends keyof typeof keep>(field: K) => {
    if ((keep[field] === null || keep[field] === '') && merge[field] !== null && merge[field] !== '') {
      fill[field as string] = merge[field];
    }
  };
  takeIfBlank('email');
  takeIfBlank('dateOfBirth');
  takeIfBlank('address');
  takeIfBlank('fiscalCode');
  takeIfBlank('guardianName');
  takeIfBlank('guardianPhone');
  takeIfBlank('emergencyContact');
  takeIfBlank('referralSource');
  takeIfBlank('locale');
  takeIfBlank('preferredChannel');
  takeIfBlank('contactConsent');

  // Two sets of clinical notes are two things somebody wrote; neither may be
  // dropped, so they are joined rather than chosen between.
  if (merge.medicalNotes && merge.medicalNotes !== keep.medicalNotes) {
    fill.medicalNotes = keep.medicalNotes
      ? `${keep.medicalNotes}\n\n${merge.medicalNotes}`
      : merge.medicalNotes;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // The chart is the one table that cannot simply be repointed: it is
      // unique on (patient, tooth), so two records charting tooth 11 would
      // collide. The survivor's own row wins unless the duplicate's is newer —
      // the later note is the later examination — and the row that loses is
      // dropped rather than kept as an unreachable second opinion.
      const [keepTeeth, mergeTeeth] = await Promise.all([
        tx.toothRecord.findMany({
          where: { patientId: keepId },
          select: { id: true, toothNum: true, updatedAt: true },
        }),
        tx.toothRecord.findMany({
          where: { patientId: mergeId },
          select: { id: true, toothNum: true, updatedAt: true },
        }),
      ]);

      const keptByTooth = new Map(keepTeeth.map((row) => [row.toothNum, row]));
      const moveTeeth: string[] = [];
      const dropTeeth: string[] = [];

      for (const tooth of mergeTeeth) {
        const rival = keptByTooth.get(tooth.toothNum);
        if (!rival) {
          moveTeeth.push(tooth.id);
        } else if (tooth.updatedAt > rival.updatedAt) {
          dropTeeth.push(rival.id);
          moveTeeth.push(tooth.id);
        } else {
          dropTeeth.push(tooth.id);
        }
      }

      if (dropTeeth.length > 0) {
        await tx.toothRecord.deleteMany({ where: { id: { in: dropTeeth } } });
      }
      if (moveTeeth.length > 0) {
        await tx.toothRecord.updateMany({
          where: { id: { in: moveTeeth } },
          data: { patientId: keepId },
        });
      }

      const move = { where: { patientId: mergeId }, data: { patientId: keepId } };
      await tx.appointment.updateMany(move);
      await tx.visitRecord.updateMany(move);
      await tx.waitlistEntry.updateMany(move);
      await tx.treatmentPlan.updateMany(move);
      await tx.patientDocument.updateMany(move);
      await tx.prescription.updateMany(move);
      await tx.contact.updateMany(move);
      await tx.patientAlert.updateMany(move);
      // The works register keeps its own copy of the name and number as written
      // on the docket (see `Work.patientName`); only the link moves.
      await tx.work.updateMany(move);
      // The board too. Left behind, a line saying "ring about Berisha's bridge"
      // goes on pointing at the husk — and the bell draws every open line on
      // every page, so it keeps asking about a record that has been merged away.
      await tx.followUp.updateMany(move);

      if (Object.keys(fill).length > 0) {
        await tx.patient.update({ where: { id: keepId }, data: fill });
      }

      // Rebuilt, because the merge may have just given the survivor an email
      // address that the search key does not know about.
      const merged = await tx.patient.findUniqueOrThrow({ where: { id: keepId } });
      await tx.patient.update({
        where: { id: keepId },
        data: { searchKey: buildSearchKey(merged) },
      });

      await tx.patient.update({
        where: { id: mergeId },
        data: { archivedAt: new Date() },
      });
    });
  } catch (error) {
    console.error('[patients] merge failed', error);
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'patient',
    entityId: keepId,
    summary: `merged ${merge.lastName} ${merge.firstName} → ${keep.lastName} ${keep.firstName}`,
  });

  revalidateAll();
  return actionOk();
}

export async function saveVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const notes = requiredString(formData.get('notes'));
  const services = requiredString(formData.get('services'));
  const visitDate = optionalString(formData.get('visitDate'));
  // Ids of catalog services picked as chips. Free-typed names have none, which
  // is what keeps a treatment written by hand out of the statistics as a
  // catalogue entry it never was.
  const serviceIds = requiredString(formData.get('serviceIds'))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!patientId || !notes) {
    return actionError(t('fillRequired'));
  }

  // `today()`, not `toDay(new Date())`: the second is the server's UTC day, and
  // this value is both the date the visit is filed under *and* the key the
  // candidate slots below are matched on. A container running UTC would file a
  // late-evening write-up on tomorrow — and then find no appointment on it,
  // because the diary is keyed to the clinic's own calendar day.
  const day = visitDate ? new Date(`${visitDate}T00:00:00.000Z`) : today();

  // What was done, as rows rather than as a sentence to be split on commas.
  //
  // The chips carry catalogue ids; anything typed by hand has none, and gets a
  // row with a name and a null `serviceId` — which is honest. Ids are matched
  // back to the text in the order the names were typed, so the line reads the
  // way it was written.
  const catalogue = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, name: true },
  });
  const idByName = new Map(catalogue.map((service) => [service.name, service.id]));

  const performed = parseServiceList(services).map((name, index) => ({
    name,
    serviceId: idByName.get(name) ?? null,
    position: index + 1,
  }));

  // Which slot this write-up is of. Chosen before the row is created so the
  // link is written as part of it rather than as a second statement that can
  // fail on its own and leave the visit floating.
  //
  // Earliest first, and only ones nobody has written up yet: a patient booked
  // twice in a day has had one of them, and guessing which is worse than taking
  // the first. Already-COMPLETED slots are candidates too, because the desk
  // closing the slot when the patient leaves and the dentist typing the note an
  // hour later are the same event arriving in either order — and it is the
  // *link* being made here, not the status.
  const candidates = await prisma.appointment.findMany({
    where: {
      patientId,
      date: day,
      status: {
        in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED, AppointmentStatus.COMPLETED],
      },
      // The gate that stands in for the unique constraint the deploy will not
      // accept: a slot already written up is not a candidate for a second one.
      visitRecords: { none: {} },
    },
    select: { id: true, startTime: true, status: true },
  });

  const slot =
    candidates.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0] ?? null;

  let visitId: string;
  try {
    const visit = await prisma.visitRecord.create({
      data: {
        patientId,
        notes,
        servicesText: services,
        services: { create: performed },
        visitDate: day,
        appointmentId: slot?.id ?? null,
        staffUserId: user.id,
        // Who typed it and who did it are the same person often enough to
        // default, and different often enough to ask.
        performedById: optionalString(formData.get('performedById')) ?? user.id,
      },
      select: { id: true },
    });
    visitId = visit.id;
  } catch {
    return actionError(t('generic'));
  }

  // Writing up the visit is the same event as the appointment happening, and
  // leaving the slot open afterwards is how a day quietly ends with six
  // still-SCHEDULED rows that then corrupt the no-show score. Skipped when the
  // slot was already closed at the desk — re-closing it would only produce a
  // second audit line saying nothing changed.
  if (
    slot &&
    slot.status !== AppointmentStatus.COMPLETED &&
    user.permissions.includes('appointment.edit')
  ) {
    await prisma.appointment.update({
      where: { id: slot.id },
      data: { status: AppointmentStatus.COMPLETED },
    });
    await recordAudit(user, {
      action: 'update',
      entity: 'appointment',
      entityId: slot.id,
      summary: `${slot.startTime} → COMPLETED`,
    });

    // Same consequence as pressing "completed" on the calendar — the visit
    // note is just the other door into the same event.
    const step = await completeStepForAppointment(slot.id);
    if (step) {
      await recordAudit(user, {
        action: 'update',
        entity: 'plan',
        entityId: step.planId,
        summary: `${step.title} → DONE`,
      });
    }
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : patientId;

  // What came off the shelf, as stated on the form.
  //
  // Nothing is deducted from a *prediction* here — the treatment's old bill of
  // materials is gone and stays gone. These are the amounts somebody looked at
  // and confirmed, seeded from what past visits for the same treatment actually
  // spent (see `suggestMaterials`), and they go through the same guarded take,
  // the same oldest-lot-first allocation and the same ledger as a scan. The
  // scanner is still the better instrument; this is for the practice that has
  // one at the chair and not in the surgery.
  //
  // After the visit exists, and unable to fail it: a cupboard that has drifted
  // must not cost somebody their clinical note.
  const materials = parseMaterialList(requiredString(formData.get('materials')));
  if (materials.length > 0 && user.permissions.includes('stock.edit')) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const material of materials) {
          await takeFromShelf(tx, {
            itemId: material.itemId,
            quantity: material.quantity,
            reason: 'used in visit',
            staffUserId: user.id,
            visitRecordId: visitId,
          });
        }
      });
    } catch (error) {
      console.error('[visit] material consumption failed', error);
    }
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'visit',
    entityId: visitId,
    summary: patientName,
  });

  // The next appointment, booked from the chair.
  //
  // Deliberately after the visit is committed and deliberately unable to fail
  // it: the write-up is the thing that must not be lost, and refusing to record
  // a treatment because the follow-up slot turned out to be busy would throw
  // away the wrong half. A clash is booked over — the same "warn, don't block"
  // rule the booking dialog applies, minus the dialog, because there is no
  // second screen here to warn on — and the audit line says a follow-up was made.
  const followUpDate = optionalString(formData.get('followUpDate'));
  const followUpStartTime = optionalString(formData.get('followUpStartTime'));

  if (
    followUpDate &&
    followUpStartTime &&
    /^\d{4}-\d{2}-\d{2}$/.test(followUpDate) &&
    /^\d{1,2}:\d{2}$/.test(followUpStartTime) &&
    user.permissions.includes('appointment.edit')
  ) {
    try {
      const booked = await prisma.appointment.create({
        data: {
          patientId,
          date: new Date(`${followUpDate}T00:00:00.000Z`),
          startTime: followUpStartTime,
          durationMin: Math.max(5, toInt(formData.get('followUpDurationMin'), 30)),
          status: AppointmentStatus.SCHEDULED,
          // Whoever did the work is the sensible default for who does the next
          // of it, and it is the only answer this form has.
          staffUserId: optionalString(formData.get('performedById')) ?? user.id,
        },
        select: { id: true },
      });

      await recordAudit(user, {
        action: 'create',
        entity: 'appointment',
        entityId: booked.id,
        summary: `${patientName} · ${followUpDate} ${followUpStartTime} · follow-up`,
      });
    } catch (error) {
      console.error('[visit] follow-up booking failed', error);
    }
  }

  revalidateAll();
  return actionOk();
}

export async function deleteVisit(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const visit = await prisma.visitRecord.findUnique({
    where: { id },
    select: { patient: { select: { firstName: true, lastName: true } } },
  });

  await prisma.visitRecord.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'visit',
    entityId: id,
    summary: visit ? `${visit.patient.firstName} ${visit.patient.lastName}` : id,
  });
  revalidateAll();
}

export async function saveToothRecord(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const toothNum = Number.parseInt(requiredString(formData.get('toothNum')), 10);
  const rawStatus = requiredString(formData.get('status'));
  const notes = optionalString(formData.get('notes'));

  // FDI, so the valid set is not a contiguous range — 19 and 29 are not teeth.
  if (!patientId || !Number.isInteger(toothNum) || !isValidTooth(toothNum)) {
    return actionError(t('generic'));
  }
  const status = isToothStatus(rawStatus) ? rawStatus : DEFAULT_TOOTH_STATUS;

  // Normalised to anatomical order, so "DOM" and "MOD" are the same record.
  const surfaces =
    formatSurfaces(formData.getAll('surfaces').filter((v) => typeof v === 'string').join('')) ||
    null;

  // Which visit put the tooth in this state.
  //
  // The chart is edited from its own tab rather than from inside the visit form,
  // so there is no id to thread through — but charting is something done *while*
  // writing up today's treatment, and a change made on the same day as a visit
  // belongs to that visit far more often than it belongs to nothing. Anything
  // charted on a day with no visit recorded stays unattributed, which is honest.
  const sameDayVisit = await prisma.visitRecord.findFirst({
    where: { patientId, visitDate: today() },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  try {
    if (status === DEFAULT_TOOTH_STATUS && !notes && !surfaces) {
      // "Healthy with no note" is the implicit default — drop the row instead of
      // storing noise, so the chart summary stays meaningful.
      await prisma.toothRecord.deleteMany({ where: { patientId, toothNum } });
    } else {
      await prisma.toothRecord.upsert({
        where: { patientId_toothNum: { patientId, toothNum } },
        create: { patientId, toothNum, status, notes, surfaces, visitRecordId: sameDayVisit?.id },
        update: { status, notes, surfaces, visitRecordId: sameDayVisit?.id ?? null },
      });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'tooth',
    entityId: patientId,
    summary: `#${toothNum}${surfaces ? ` (${surfaces})` : ''} · ${status}`,
  });

  revalidateAll();
  return actionOk();
}

/** "Reminder sent" — stops the recall list nagging about someone already contacted. */
export async function markRecallContacted(formData: FormData): Promise<void> {
  const user = await authorize('recall.send');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const patient = await prisma.patient.update({
    where: { id },
    data: { lastRecallAt: new Date() },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'recall',
    entityId: id,
    summary: `${patient.firstName} ${patient.lastName}`,
  });
  revalidateAll();
}

/** "Not now" — hides someone from the recall list for a while without losing them. */
export async function snoozeRecall(formData: FormData): Promise<void> {
  const user = await authorize('recall.send');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const days = Math.min(365, Math.max(1, Number(formData.get('days')) || 30));
  if (!id) return;

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);

  const patient = await prisma.patient.update({
    where: { id },
    data: { recallSnoozedUntil: until },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'recall',
    entityId: id,
    summary: `${patient.firstName} ${patient.lastName} · +${days}d`,
  });
  revalidateAll();
}
