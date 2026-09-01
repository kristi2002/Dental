'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  AppointmentRequestStatus,
  AppointmentStatus,
  ContactChannel,
  PatientSex,
} from '@/generated/prisma/enums';
import { redirect } from '@/i18n/navigation';
import { locales } from '@/i18n/routing';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { followUpFileKeys, forgetFiles } from '@/lib/cascade-files';
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
import { sameDayVisitId } from '@/lib/visit-link';
import { findPhoneDuplicates } from '@/lib/queries';
import { reverseVisitConsumption, takeFromShelf } from '@/lib/stock-consumption';
import { isDateKey, isTimeOfDay, timeToMinutes, today } from '@/lib/dates';
import {
  formatBleeding,
  formatPockets,
  formatRecession,
  hasFurcation,
  hasPerio,
  parseFurcation,
  parseMobility,
  parsePockets,
  PERIO_SITE_COUNT,
  toPocketDepth,
  toRecession,
} from '@/lib/perio';
import {
  ALL_TEETH,
  DEFAULT_TOOTH_STATUS,
  formatSurfaces,
  isExclusive,
  isToothFindingKind,
  isToothStatus,
  isValidTooth,
  statusTakesSurfaces,
  type ToothFindingKind,
} from '@/lib/teeth';
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

/** `''` → null (nobody has asked), otherwise one of the three, or null. */
function toSex(value: string | null): PatientSex | null {
  return value && value in PatientSex ? (value as PatientSex) : null;
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
    sex: toSex(optionalString(formData.get('sex'))),
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
      // A new address is a new answer to the question a bounce recorded, so the
      // bounce is cleared with it — otherwise correcting the typo that caused
      // the bounce leaves the corrected address permanently unusable, and the
      // only way back would be a database console. Only when it actually
      // changed: re-saving a record for an unrelated reason must not quietly
      // re-arm an address the provider has already refused twice.
      const before = await prisma.patient.findUnique({
        where: { id },
        select: { email: true },
      });
      const changed = (before?.email ?? null) !== data.email;

      await prisma.patient.update({
        where: { id },
        data: changed ? { ...data, emailBouncedAt: null, emailBounceKind: null } : data,
      });
    } else {
      savedId = (await prisma.patient.create({ data, select: { id: true } })).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  // The enquiry this record came out of, when the desk opened the form from
  // one — `/patients/new?request=…` carries the id and nothing else does.
  //
  // Only on a create, and only onto a request nothing has claimed. Editing a
  // record months later must not re-point an old enquiry at it, and a request
  // already tied to somebody is not re-tied by a second person being registered
  // from the same screen.
  //
  // Deliberately not fatal. The patient exists; failing the save now would
  // report that they do not, and the link is a reporting nicety beside that.
  const requestId = optionalString(formData.get('requestId'));
  if (!id && savedId && requestId) {
    try {
      // Two writes rather than one, because the status is conditional and the
      // link is not. Registering somebody *is* picking the enquiry up, so a
      // request still sitting in the new pile stops sitting there — while one
      // the desk has already answered or closed keeps whatever they decided,
      // and only gains the link.
      //
      // The second is guarded on `patientId: null` too, so a request claimed by
      // the first is not touched again.
      await prisma.appointmentRequest.updateMany({
        where: { id: requestId, patientId: null, status: AppointmentRequestStatus.NEW },
        data: {
          patientId: savedId,
          status: AppointmentRequestStatus.CONTACTED,
          handledAt: new Date(),
          handledById: user.id,
        },
      });
      await prisma.appointmentRequest.updateMany({
        where: { id: requestId, patientId: null },
        data: { patientId: savedId },
      });
    } catch (error) {
      console.error('[patients] could not link request', requestId, error);
    }
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
  //
  // Two sources, not one. The patient's own documents were always read here; the
  // follow-ups filed against them cascade too, and a follow-up carries
  // attachments of its own — so a radiograph pinned to "chase the laboratory
  // about Mrs Hoxha" survived a delete that removed everything it referred to.
  // See `cascade-files.ts`.
  const [documents, followUpFiles] = await Promise.all([
    prisma.patientDocument.findMany({ where: { patientId: id }, select: { storageKey: true } }),
    followUpFileKeys({ patientId: id }),
  ]);

  // Appointments, visits, tooth records and follow-ups cascade — see `onDelete: Cascade`.
  await prisma.patient.delete({ where: { id } });

  // Best-effort and after the fact: a file that will not unlink must not undo a
  // delete the database has already committed.
  await forgetFiles([...documents.map((document) => document.storageKey), ...followUpFiles]);

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
      // A slot already written up is not a candidate for a second one. Backed
      // by a unique index on `VisitRecord.appointmentId` since
      // `20260820110000_constraints_the_deploy_can_now_carry`; this filter is
      // still what makes the common case pick the *next* free slot rather than
      // failing, and the index is what settles a genuine race.
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
    isDateKey(followUpDate) &&
    isTimeOfDay(followUpStartTime) &&
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
  // The summary below already allowed for this being null, and the delete a line
  // later did not — a second press of the button, or a page left open while
  // somebody else removed the same write-up, threw P2025 out of a server action
  // and put an error screen in front of the dentist. Nothing to delete is not a
  // failure; it is the state the press was asking for.
  if (!visit) return;

  // What the visit took off the shelf goes back on it, in the same transaction
  // that removes the visit — see `reverseVisitConsumption`. Deleting the record
  // of a treatment and leaving its materials deducted left the cupboard short by
  // boxes with nothing left in the ledger to explain them.
  const returned = await prisma.$transaction(async (tx) => {
    const boxes = await reverseVisitConsumption(tx, id, user.id);
    await tx.visitRecord.delete({ where: { id } });
    return boxes;
  });

  const patientName = `${visit.patient.firstName} ${visit.patient.lastName}`;

  await recordAudit(user, {
    action: 'delete',
    entity: 'visit',
    entityId: id,
    // The returned boxes are named here because the compensating movements
    // cannot name the visit — it no longer exists to be pointed at.
    summary: returned > 0 ? `${patientName} · returned ${returned} to stock` : patientName,
  });
  revalidateAll();
}

/**
 * What is already on file for this tooth, for the writes that must not take
 * the rest of the row with them.
 *
 * Two things live on a `ToothRecord` that the form doing the writing does not
 * show: the note somebody typed, and the periodontal readings. Both of them
 * decide whether "healthy with nothing on it" is really an empty row — a tooth
 * with perfect enamel sitting in an 8mm pocket is a row worth keeping, and
 * dropping it would silently delete the examination.
 */
async function toothRowContext(patientId: string, toothNum: number) {
  const row = await prisma.toothRecord.findUnique({
    where: { patientId_toothNum: { patientId, toothNum } },
    // The findings are not asked for and no longer live here: both callers want
    // the two things that decide whether the row is empty, which are the note
    // and the readings.
    select: {
      notes: true,
      mobility: true,
      pockets: true,
      bleeding: true,
    },
  });
  return { row, perio: row !== null && hasPerio(row) };
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

  /**
   * The dialog records *one* finding and leaves the rest of the tooth alone.
   *
   * It used to set the tooth's only status, so saving was replacing. Now that a
   * tooth holds a list, saving a crown on a root-filled tooth has to mean "and
   * a crown" rather than "instead of the root filling" — the dentist who opens
   * the dialog is recording the thing they just did, not restating everything
   * ever done to the tooth.
   *
   * `HEALTHY` is still the eraser, because that is what picking it has always
   * meant here and there is nowhere else in the dialog to say "none of this is
   * true any more".
   */
  const existing = await prisma.toothFinding.findMany({
    where: { patientId, toothNum },
    orderBy: { recordedAt: 'desc' },
  });
  const merged =
    status === DEFAULT_TOOTH_STATUS
      ? []
      : normaliseFindings([
          { status, surfaces: surfaces ?? '' },
          ...existing
            .filter((finding) => finding.status !== status)
            .map((finding) => ({ status: finding.status, surfaces: finding.surfaces ?? '' })),
        ]);
  if (merged === null) return actionError(t('generic'));

  const [visitId, { perio }] = await Promise.all([
    sameDayVisitId(patientId),
    toothRowContext(patientId, toothNum),
  ]);

  try {
    await writeFindings(patientId, toothNum, merged, user.id);

    // The note lives on `ToothRecord`, which is now the periodontal row. A
    // tooth left with no findings, no note and no readings keeps no row at all,
    // so a mistyped tooth, corrected, leaves nothing behind.
    if (merged.length === 0 && !notes && !perio) {
      await prisma.toothRecord.deleteMany({ where: { patientId, toothNum } });
    } else {
      await prisma.toothRecord.upsert({
        where: { patientId_toothNum: { patientId, toothNum } },
        create: { patientId, toothNum, notes, visitRecordId: visitId },
        update: { notes, visitRecordId: visitId },
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

/**
 * Everything true of one tooth, written straight down without a form.
 *
 * This is what the chart's marking tools call. Charting a mouth is thirty-two
 * findings entered one after another, and routing each of them through the
 * dialog — open, read the options, pick, press save, wait for it to close —
 * turned a two-minute examination into a filing exercise. With a tool selected
 * the click *is* the record.
 *
 * **The whole list arrives, not a delta.** The client has already worked out the
 * resulting state with `applyFinding`, which is what lets the drawing update on
 * the click rather than after the round trip; sending the answer means the
 * server has one job — make the tooth look like this — and cannot land in a
 * state the screen never predicted. It is still checked rather than trusted:
 * every status has to be a real one, a status that names no surface has its
 * surfaces dropped however they arrived, and the exclusivity rule is applied
 * here as well as there, because a form is not a permission.
 *
 * The note and the periodontal readings are deliberately not in the payload.
 * Marking a tooth is not a statement about either, and a quick tool that
 * silently wiped a typed note would be the worst kind of fast.
 */
export async function setToothFindings(input: {
  patientId: string;
  toothNum: number;
  findings: { status: string; surfaces: string }[];
}): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const { patientId, toothNum } = input;
  if (!patientId || !Number.isInteger(toothNum) || !isValidTooth(toothNum)) {
    return actionError(t('generic'));
  }

  const cleaned = normaliseFindings(input.findings);
  if (cleaned === null) return actionError(t('generic'));

  try {
    await writeFindings(patientId, toothNum, cleaned, user.id);
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'tooth',
    entityId: patientId,
    summary: `#${toothNum} · ${
      cleaned.length === 0
        ? DEFAULT_TOOTH_STATUS
        : cleaned
            .map((f) => `${f.status}${f.surfaces ? ` (${f.surfaces})` : ''}`)
            .join(', ')
    }`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * The same write, over several teeth at once.
 *
 * Charting is not one tooth at a time. "Every molar is sealed", "the whole
 * lower left is sound", "these three are the bridge" — each of those is one
 * decision that used to cost one click and one round trip per tooth, and the
 * chart's drag-to-mark makes the same stroke over eight of them. Sent one at a
 * time that is eight actions, eight revalidations of the whole page and eight
 * chances for two of them to land out of order; sent together it is one.
 *
 * Each tooth still arrives as its **whole resolved list**, exactly as
 * `setToothFindings` takes one, for exactly the same reason: the client has
 * already worked out the answer with `applyFinding`, and handing over the
 * answer rather than a delta is what stops the server reaching a state the
 * drawing never predicted. Nothing here is trusted any more than there — every
 * status is checked, every tooth number is checked, and the whole batch is
 * refused if any part of it is wrong rather than the good half being written.
 *
 * One audit line for the stroke rather than one per tooth: a hand that sealed
 * six molars did one thing, and six identical entries a second apart is how a
 * trail becomes unreadable.
 */
export async function markTeeth(input: {
  patientId: string;
  teeth: { toothNum: number; findings: { status: string; surfaces: string }[] }[];
}): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const { patientId, teeth } = input;
  // The whole mouth is 52 teeth. Anything past that is not a stroke across an
  // arch, so it is refused rather than clamped — a truncated batch would look
  // to the chart exactly like a batch that worked.
  if (!patientId || !Array.isArray(teeth) || teeth.length === 0 || teeth.length > ALL_TEETH.length) {
    return actionError(t('generic'));
  }

  const seen = new Set<number>();
  const batch: {
    toothNum: number;
    findings: { status: ToothFindingKind; surfaces: string | null }[];
  }[] = [];

  for (const tooth of teeth) {
    if (!Number.isInteger(tooth.toothNum) || !isValidTooth(tooth.toothNum)) {
      return actionError(t('generic'));
    }
    // One entry per tooth. Two lists for the same tooth in one payload is a
    // client that has lost track of its own stroke, and whichever landed last
    // would silently win.
    if (seen.has(tooth.toothNum)) return actionError(t('generic'));
    seen.add(tooth.toothNum);

    const cleaned = normaliseFindings(tooth.findings);
    if (cleaned === null) return actionError(t('generic'));
    batch.push({ toothNum: tooth.toothNum, findings: cleaned });
  }

  try {
    // Sequential rather than concurrent: `writeFindings` opens a transaction
    // per tooth and reads the row it is about to replace, and a fan-out of
    // those against one patient buys nothing but lock contention on a stroke
    // that is eight teeth at the outside.
    for (const tooth of batch) {
      await writeFindings(patientId, tooth.toothNum, tooth.findings, user.id);
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'tooth',
    entityId: patientId,
    summary: batch
      .map(
        (tooth) =>
          `#${tooth.toothNum} · ${
            tooth.findings.length === 0
              ? DEFAULT_TOOTH_STATUS
              : tooth.findings
                  .map((f) => `${f.status}${f.surfaces ? ` (${f.surfaces})` : ''}`)
                  .join(', ')
          }`,
      )
      .join(' · '),
  });

  revalidateAll();
  return actionOk();
}

/**
 * That this mouth was examined today, by this person.
 *
 * The chart records what is wrong with each tooth and has never been able to
 * record that somebody looked. A healthy tooth is one with no findings — which
 * is the right model, and which leaves a fully examined sound mouth and a mouth
 * nobody has ever opened drawing the same thirty-two clean teeth. Everything
 * else in this record is dated and attributed; this was not.
 *
 * **Pressed rather than inferred.** The obvious alternative was to treat the
 * newest finding's date as the examination date, and it is wrong in the case
 * that matters most: the patient whose chart is clean has no findings to take a
 * date from, and they are exactly the patient whose examination somebody will
 * later need to prove happened.
 *
 * Same person, same day, one row. A second press is somebody making sure rather
 * than a second examination, and two rows an hour apart would read as one.
 */
export async function recordChartExam(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  if (!patientId) return actionError(t('generic'));

  const note = optionalString(formData.get('note'));

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  try {
    const already = await prisma.chartExam.findFirst({
      where: { patientId, examinedById: user.id, examinedAt: { gte: since } },
      orderBy: { examinedAt: 'desc' },
      select: { id: true },
    });

    if (already) {
      await prisma.chartExam.update({
        where: { id: already.id },
        data: { examinedAt: new Date(), note },
      });
    } else {
      await prisma.chartExam.create({
        data: {
          patientId,
          examinedById: user.id,
          visitRecordId: await sameDayVisitId(patientId),
          note,
        },
      });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'tooth',
    entityId: patientId,
    summary: `Examined${note ? ` · ${note}` : ''}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * The findings as they will be stored, or null if any of them is not a finding.
 *
 * Rejects rather than filters. A payload naming a status this app does not have
 * is a client that has gone wrong or one that is not ours, and quietly writing
 * the half of it that parsed is how a tooth ends up in a state nobody chose.
 *
 * Returns `ToothFindingKind`, which is the narrower list the column can hold.
 * The `HEALTHY` rejection below has been here since the table existed and was
 * invisible to the type system, so every caller was handed something wider than
 * this function ever produces and `writeFindings` had to take it on trust.
 */
function normaliseFindings(
  findings: readonly { status: string; surfaces: string }[],
): { status: ToothFindingKind; surfaces: string | null }[] | null {
  const seen = new Set<string>();
  const out: { status: ToothFindingKind; surfaces: string | null }[] = [];

  for (const finding of findings) {
    // `HEALTHY` is the absence of findings, so it is never one — a list that
    // names it is a client still thinking in single statuses.
    if (!isToothStatus(finding.status) || !isToothFindingKind(finding.status)) return null;
    if (seen.has(finding.status)) return null;
    seen.add(finding.status);
    out.push({
      status: finding.status,
      surfaces: statusTakesSurfaces(finding.status)
        ? formatSurfaces(finding.surfaces) || null
        : null,
    });
  }

  // Gone is gone. `EXCLUSIVE_STATUSES` is the same list the chart predicts with,
  // and applying it here too is what stops a stale tab writing an implant onto a
  // tooth another tab has just recorded as missing.
  const exclusive = out.find((finding) => isExclusive(finding.status));
  return exclusive ? [exclusive] : out;
}

/**
 * Make the tooth's findings look exactly like this.
 *
 * Delete-then-insert inside one transaction rather than a diff: the list is
 * short, the write is rare, and a diff would need the exclusivity rule applied
 * twice — once to decide what to remove and once to decide what to add — which
 * is two places for it to be applied differently.
 *
 * The `ToothRecord` row is left alone. It holds the note and the periodontal
 * examination now, and neither is a statement about the findings; the one thing
 * done to it is the reverse of what the old code did — a row that has nothing
 * left on it at all is removed, so a mistyped tooth, corrected, does not leave a
 * permanent empty record behind.
 */
async function writeFindings(
  patientId: string,
  toothNum: number,
  /**
   * `ToothFindingKind` and not `ToothStatus`: `HEALTHY` is the eraser, and the
   * way to erase is to pass an empty list. The column is an enum that cannot
   * hold it, so the narrowing that used to be a comment is now the signature —
   * every caller already filtered it out, and this is what stops the next one
   * forgetting to.
   */
  findings: readonly { status: ToothFindingKind; surfaces: string | null }[],
  /** Who is charting. Stamped on findings this write actually adds. */
  recordedById: string,
): Promise<void> {
  const visitId = await sameDayVisitId(patientId);

  /**
   * What this tooth already carried, by status.
   *
   * The rewrite below deletes and re-inserts, which is what made a finding's
   * provenance quietly disposable: every row came back with today's date, the
   * current visit and — once there was one — the current author. So adding a
   * crown in August re-dated the caries found in March and put the crowning
   * dentist's name on somebody else's diagnosis, and the chart lost the one
   * distinction its own comments said it was keeping ("caries found two years
   * ago and caries found this morning are the same red and two very different
   * conversations").
   *
   * Carried across by **status**, which is what the unique key is and what a
   * finding's identity is here: caries on 26 is one finding whether it reaches
   * one face or three. Amending its surfaces is learning more about the same
   * decay, not finding new decay, so it keeps its date.
   */
  const before = await prisma.toothFinding.findMany({
    where: { patientId, toothNum },
    select: { status: true, recordedAt: true, recordedById: true, visitRecordId: true },
  });
  const kept = new Map(before.map((finding) => [finding.status, finding]));

  await prisma.$transaction(async (tx) => {
    await tx.toothFinding.deleteMany({ where: { patientId, toothNum } });
    if (findings.length > 0) {
      await tx.toothFinding.createMany({
        data: findings.map((finding) => {
          const prior = kept.get(finding.status);
          return {
            patientId,
            toothNum,
            status: finding.status,
            surfaces: finding.surfaces,
            // `undefined` rather than a date on a genuinely new finding, so the
            // column's own default stamps it — one place decides what "now" is.
            recordedAt: prior?.recordedAt,
            recordedById: prior ? prior.recordedById : recordedById,
            visitRecordId: prior ? prior.visitRecordId : visitId,
          };
        }),
      });
    }
  });

  if (findings.length === 0) {
    const row = await prisma.toothRecord.findUnique({
      where: { patientId_toothNum: { patientId, toothNum } },
    });
    if (row && !row.notes && !hasPerio(row)) {
      await prisma.toothRecord.deleteMany({ where: { patientId, toothNum } });
    }
  }
}

/**
 * The periodontal examination of one tooth: six probe depths, which of those
 * sites bled, and how much the tooth moves.
 *
 * Its own action rather than more fields on `saveToothRecord`, because the two
 * are separate examinations that happen at separate moments — the condition is
 * charted looking at the tooth and the pocket depths are charted with a probe,
 * often by different people. Sharing one form would mean each save rewriting
 * the other's findings from whatever was on screen at the time.
 *
 * `visitRecordId` is set on create only. A perio row's visit says which visit
 * *charted the tooth*, and re-probing a gum months later is not a statement
 * about when the filling went in.
 */
export async function saveToothPerio(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const toothNum = Number.parseInt(requiredString(formData.get('toothNum')), 10);
  if (!patientId || !Number.isInteger(toothNum) || !isValidTooth(toothNum)) {
    return actionError(t('generic'));
  }

  // Out-of-range and unreadable readings become "not probed" rather than an
  // error: a slipped keypress in the middle of six boxes should cost that one
  // box, not the whole examination the nurse just read out.
  const pockets = formatPockets(
    Array.from({ length: PERIO_SITE_COUNT }, (_, site) =>
      toPocketDepth(requiredString(formData.get(`depth${site}`))),
    ),
  );

  // Bleeding is only meaningful where a probe went in, so a tick left behind on
  // a box that was then cleared is dropped with it.
  //
  // Read back off `pockets` rather than off what was typed, so "went in" means
  // the reading that is actually being stored. Asking the typed value instead
  // let a depth the column refuses — a 0, which is not a pocket any mouth has —
  // keep its tick, leaving a site that bled at no depth and a mouth whose
  // bleeding score was a percentage of more sites than were probed.
  const stored = parsePockets(pockets);
  const bleeding = formatBleeding(
    Array.from(
      { length: PERIO_SITE_COUNT },
      (_, site) => stored[site] !== null && formData.get(`bop${site}`) !== null,
    ),
  );
  const mobility = parseMobility(optionalString(formData.get('mobility')));

  // Recession is read even where no pocket was: a receded margin at a site the
  // probe found nothing in is a real finding, and pairing it with the depth is
  // the reader's job, not this one's.
  const recession = formatRecession(
    Array.from({ length: PERIO_SITE_COUNT }, (_, site) =>
      toRecession(requiredString(formData.get(`recession${site}`))),
    ),
  );
  // Refused outright on a tooth that has no furcation, rather than stored and
  // ignored — a grade on a central incisor is a category error, and a column
  // that quietly holds one will eventually be read by something that believes
  // it.
  const furcation = hasFurcation(toothNum)
    ? parseFurcation(optionalString(formData.get('furcation')))
    : null;

  const { row } = await toothRowContext(patientId, toothNum);
  const empty =
    pockets === null &&
    bleeding === null &&
    mobility === null &&
    recession === null &&
    furcation === null;

  try {
    // Clearing the last reading off a tooth that has nothing else recorded takes
    // the row with it, the same way clearing the condition does — otherwise a
    // mistyped examination, corrected, leaves a permanent healthy-looking row.
    // The findings are not consulted: they are their own rows now, and a tooth
    // keeps every one of them whether or not anybody ever probed it.
    if (empty && (!row || !row.notes)) {
      await prisma.toothRecord.deleteMany({ where: { patientId, toothNum } });
    } else {
      await prisma.toothRecord.upsert({
        where: { patientId_toothNum: { patientId, toothNum } },
        create: {
          patientId,
          toothNum,
          mobility,
          pockets,
          bleeding,
          recession,
          furcation,
          visitRecordId: await sameDayVisitId(patientId),
        },
        update: { mobility, pockets, bleeding, recession, furcation },
      });
    }

    // And the same reading into the history, which is the whole reason this
    // change exists. The snapshot above is overwritten on every save; this is
    // append-only, so a pocket that was 3mm last year and is 5mm today is still
    // two readings tomorrow instead of one.
    //
    // Written for a clearing save too — `empty` is itself a finding. "Probed
    // and found nothing" is the record of an examination, and dropping it would
    // make a resolved pocket look like a tooth nobody ever went back to.
    //
    // Inside the same `try` as the snapshot but deliberately *after* it: if the
    // history insert fails the snapshot still stands, which is the right way
    // round. The reverse would leave the practice with a history of a reading
    // the chart does not show.
    await prisma.perioExam.create({
      data: {
        patientId,
        toothNum,
        pockets,
        bleeding,
        recession,
        mobility,
        furcation,
        visitRecordId: await sameDayVisitId(patientId),
      },
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'tooth',
    entityId: patientId,
    summary: `#${toothNum} · perio ${pockets ?? '—'}${
      mobility !== null ? ` · M${mobility}` : ''
    }`,
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
