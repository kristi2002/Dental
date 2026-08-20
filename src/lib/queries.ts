import { cache } from 'react';
import type {
  OperatoryOption,
  ServiceOption,
  StaffOption,
} from '@/components/appointments/AppointmentFormDialog';
import {
  AppointmentStatus,
  ContactPurpose,
  Role,
  type ToothNumbering,
} from '@/generated/prisma/enums';
import type { AppointmentView } from '@/components/appointments/types';
import {
  DEFAULT_WEEK,
  scheduleFor,
  type ClosureRange,
  type DayHours,
  type DaySchedule,
} from '@/lib/clinic-hours';
import { departmentOf } from '@/lib/catalog';
import { usableQuantity } from '@/lib/expiry';
import { ACTIVE_PATIENTS, phoneKey } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import { addDays, toDateKey, timeToMinutes, today } from '@/lib/dates';
import { DUE_SOON_DAYS } from '@/lib/works';

/**
 * The seven weekday rows, with any the database has not been given yet filled
 * in from `DEFAULT_WEEK`. A fresh install therefore behaves like a configured
 * one, and the settings form always has seven rows to render.
 */
export const getClinicWeek = cache(async (): Promise<DayHours[]> => {
  const rows = await prisma.clinicHours.findMany();

  return DEFAULT_WEEK.map((fallback) => {
    const row = rows.find((entry) => entry.weekday === fallback.weekday);
    return row ? { ...row } : { ...fallback };
  });
});

/** Every closure, cached per request — the list is a handful of rows a year. */
export const getClosures = cache(
  async (): Promise<ClosureRange[]> =>
    prisma.closure.findMany({
      orderBy: { from: 'asc' },
      select: { from: true, to: true, reason: true, staffUserId: true },
    }),
);

/**
 * The combined answer for one day — the thing scheduling code should ask for.
 * Pass a dentist to have their own leave counted; leave it out to ask whether
 * the practice as a whole is open.
 */
export async function getDaySchedule(
  date: Date,
  staffUserId?: string | null,
): Promise<DaySchedule> {
  const [week, closures] = await Promise.all([getClinicWeek(), getClosures()]);
  return scheduleFor(date, week, closures, staffUserId);
}

/**
 * The people an appointment can be booked with. Front-desk-only accounts are
 * left out: a receptionist is not somebody a patient is booked *with*, and
 * offering them would make the dentist filter meaningless.
 */
export const getProviderOptions = cache(async (): Promise<StaffOption[]> => {
  const staff = await prisma.staffUser.findMany({
    where: { active: true, role: { in: [Role.OWNER, Role.ASSISTANT] } },
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true },
  });

  return staff.map((person) => ({
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
  }));
});

/**
 * Practice-wide preferences. A single row, created on first read so no install
 * step is needed and every screen can assume it exists.
 */
export const getClinicProfile = cache(
  async (): Promise<{ name: string; toothNumbering: ToothNumbering; currency: string }> => {
    const profile = await prisma.clinicProfile.upsert({
      where: { id: 'clinic' },
      create: {},
      update: {},
      select: { name: true, toothNumbering: true, currency: true },
    });
    return profile;
  },
);

export const getOperatoryOptions = cache(async (): Promise<OperatoryOption[]> => {
  return prisma.operatory.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
});

export type ServiceCategoryOption = {
  id: string;
  name: string;
  /** Null for a department; the department's id for a subcategory. */
  parentId: string | null;
};

/**
 * The catalogue's headings, flat and in name order — and the only place the old
 * free-text categories are carried over to them.
 *
 * Flat rather than nested because every caller wants a different shape of tree,
 * and one level of `parentId` is cheaper to re-nest than to un-nest.
 *
 * The carry-over is `getStockCategories`' twin, for the same reason: the
 * categories the practice already typed are real information — the whole
 * catalogue is grouped by them — and it is done on first read so that a
 * practice sees its own headings without anybody having to run anything. A
 * migration could do it now that the deploy replays them, and this could be
 * retired into one; it is left here because it is idempotent, costs an empty
 * query once adopted, and works the same on a database restored from backup.
 * Each distinct spelling becomes one top-level `ServiceCategory`; nothing
 * arrives as a subcategory, because the old text box could not express one.
 */
export async function getServiceCategories(): Promise<ServiceCategoryOption[]> {
  const orphaned = await prisma.service.findMany({
    where: { categoryId: null, NOT: { legacyCategory: null } },
    select: { id: true, legacyCategory: true },
  });
  if (orphaned.length > 0) await adoptLegacyServiceCategories(orphaned);

  return prisma.serviceCategory.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, parentId: true },
  });
}

/**
 * Turn the typed-in category names into rows, once.
 *
 * Two requests can arrive together on the deploy that first exposes this, and
 * without a unique index on `name` (see `saveServiceCategory`) both would create
 * their own "Kirurgji". The advisory lock is held for the transaction only, so
 * the second request waits, then finds nothing left to adopt.
 */
async function adoptLegacyServiceCategories(
  orphaned: Array<{ id: string; legacyCategory: string | null }>,
): Promise<void> {
  const wanted = new Map<string, { name: string; serviceIds: string[] }>();
  for (const service of orphaned) {
    const name = service.legacyCategory?.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    const group = wanted.get(key) ?? { name, serviceIds: [] };
    group.serviceIds.push(service.id);
    wanted.set(key, group);
  }
  if (wanted.size === 0) return;

  await prisma.$transaction(async (tx) => {
    // A second arbitrary constant, distinct from the storage room's: the two
    // adoptions touch different tables and must not queue behind each other.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4207310002)`;

    const known = new Map(
      (
        await tx.serviceCategory.findMany({
          where: { parentId: null },
          select: { id: true, name: true },
        })
      ).map((category) => [category.name.toLowerCase(), category.id]),
    );

    for (const [key, group] of wanted) {
      const categoryId =
        known.get(key) ??
        (await tx.serviceCategory.create({ data: { name: group.name }, select: { id: true } })).id;

      await tx.service.updateMany({
        // `categoryId: null` again: a treatment somebody has since filed by hand
        // keeps the heading they chose, not the one the old text box remembers.
        where: { id: { in: group.serviceIds }, categoryId: null },
        data: { categoryId, legacyCategory: null },
      });
    }

    // Anything left holding a blank or whitespace-only category — nothing to
    // adopt, but it would make this run again on every single load.
    await tx.service.updateMany({
      where: { id: { in: orphaned.map((service) => service.id) }, categoryId: null },
      data: { legacyCategory: null },
    });
  });
}

/**
 * The catalog in picker order: by department, then by name inside each one.
 *
 * `category` is the *department* even for a treatment filed under a
 * subcategory — every picker in the app groups by this string and prints it as
 * a heading, and "Kirurgji" is the heading whether the treatment sits directly
 * under it or under "Implantologji" inside it.
 *
 * The categories are read first, and not beside the services: this is the call
 * every other screen makes, so it is also where the practice's old typed-in
 * categories get adopted for anyone who books an appointment before opening the
 * services page.
 */
export async function getServiceOptions(): Promise<ServiceOption[]> {
  await getServiceCategories();

  const services = await prisma.service.findMany({
    select: {
      id: true,
      name: true,
      durationMin: true,
      category: { select: { name: true, parent: { select: { name: true } } } },
    },
  });

  // Sorted here rather than by the database, which can order by the leaf
  // heading but not by the department above it.
  return services
    .map(({ category, ...service }) => ({
      ...service,
      category: departmentOf(category),
      subcategory: category?.parent ? category.name : '',
    }))
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.subcategory.localeCompare(b.subcategory) ||
        a.name.localeCompare(b.name),
    )
    .map(({ subcategory: _subcategory, ...option }) => option);
}

type AppointmentWithPatient = {
  id: string;
  date: Date;
  startTime: string;
  durationMin: number;
  status: string;
  notes: string | null;
  serviceName: string | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  staffUserId: string | null;
  staffUser: { firstName: string; lastName: string } | null;
  operatoryId: string | null;
  operatory: { name: string } | null;
  arrivedAt: Date | null;
  rescheduledFromId: string | null;
  seriesId: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    locale: string | null;
    contactConsent: boolean | null;
  };
};

export function toAppointmentView(appointment: AppointmentWithPatient): AppointmentView {
  return {
    id: appointment.id,
    date: toDateKey(appointment.date),
    startTime: appointment.startTime,
    durationMin: appointment.durationMin,
    status: appointment.status,
    serviceName: appointment.serviceName ?? '',
    notes: appointment.notes ?? '',
    confirmed: appointment.confirmedAt !== null,
    declined: appointment.declinedAt !== null,
    staffUserId: appointment.staffUserId ?? '',
    staffName: appointment.staffUser
      ? `${appointment.staffUser.firstName} ${appointment.staffUser.lastName}`
      : '',
    operatoryId: appointment.operatoryId ?? '',
    operatoryName: appointment.operatory?.name ?? '',
    // An instant rather than a count of minutes: the page is rendered once and
    // read for the next twenty, and a number baked in at render time would be
    // wrong the moment it was printed. The reader works out the wait.
    arrivedAt: appointment.arrivedAt?.toISOString() ?? '',
    moved: appointment.rescheduledFromId !== null,
    seriesId: appointment.seriesId ?? '',
    patient: {
      id: appointment.patient.id,
      firstName: appointment.patient.firstName,
      lastName: appointment.patient.lastName,
      phone: appointment.patient.phone,
      email: appointment.patient.email ?? '',
      locale: appointment.patient.locale ?? '',
      contactConsent: appointment.patient.contactConsent,
    },
  };
}

const APPOINTMENT_SELECT = {
  id: true,
  date: true,
  startTime: true,
  durationMin: true,
  status: true,
  notes: true,
  serviceName: true,
  confirmedAt: true,
  declinedAt: true,
  staffUserId: true,
  staffUser: { select: { firstName: true, lastName: true } },
  operatoryId: true,
  operatory: { select: { name: true } },
  arrivedAt: true,
  rescheduledFromId: true,
  seriesId: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      locale: true,
      contactConsent: true,
    },
  },
} as const;

/** Appointments in `[from, to]` (both UTC midnights, inclusive), ordered by day then clock time. */
export async function getAppointmentsBetween(
  from: Date,
  to: Date,
  /** Narrow to one dentist's list — the calendar's provider filter. */
  staffUserId?: string | null,
): Promise<AppointmentView[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(staffUserId ? { staffUserId } : {}),
    },
    select: APPOINTMENT_SELECT,
    orderBy: { date: 'asc' },
  });

  // `startTime` is a string, so the clock ordering happens here rather than in SQL.
  return rows
    .map(toAppointmentView)
    .sort((a, b) =>
      a.date === b.date
        ? timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
        : a.date.localeCompare(b.date),
    );
}

/**
 * Appointments whose day has passed and which nobody ever closed out.
 *
 * An unclosed slot is the one failure in this app that costs nothing today and
 * corrupts three things quietly afterwards: the reliability score never learns
 * about a no-show, the completion rate on the statistics page counts a slot that
 * never happened as still pending, and the day it sat on stops being a record of
 * what the practice actually did.
 *
 * Nothing marks them automatically. A missed appointment and a treatment nobody
 * wrote up look identical from here, and only the person who was in the room
 * knows which it was — so this asks rather than deciding.
 */
export async function getOpenPastAppointments(limit = 12): Promise<AppointmentView[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      date: { lt: today() },
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED] },
    },
    select: APPOINTMENT_SELECT,
    // Oldest first: the longest-standing loose end is the one most likely to be
    // forgotten, and the one whose answer is hardest to recover.
    orderBy: { date: 'asc' },
    take: limit,
  });

  return rows.map(toAppointmentView);
}

/** How many there are in total, so the panel can say what it is not showing. */
export async function countOpenPastAppointments(): Promise<number> {
  return prisma.appointment.count({
    where: {
      date: { lt: today() },
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED] },
    },
  });
}

/**
 * Today's finished appointments that nobody has written up.
 *
 * Marking a slot COMPLETED and recording what happened in the chair are two
 * halves of the same event, done on two different screens — so the second half
 * gets left until the end of the day, and then until tomorrow. This is the
 * closing half of the loop that `saveVisit` opens from the other side, where
 * writing the note completes the appointment.
 *
 * Asked of the slot itself now that `VisitRecord.appointment` exists. The
 * patient-and-date clause behind it is the old approximation, kept for the
 * visits that predate the link and will never grow one — but narrowed to
 * *unlinked* visits, so a patient booked twice in a day no longer has both
 * slots counted as written up because one of them was.
 */
export async function getUnrecordedToday(): Promise<AppointmentView[]> {
  const day = today();

  const rows = await prisma.appointment.findMany({
    where: {
      date: day,
      status: AppointmentStatus.COMPLETED,
      visitRecords: { none: {} },
      patient: { visitRecords: { none: { visitDate: day, appointmentId: null } } },
    },
    select: APPOINTMENT_SELECT,
  });

  return rows
    .map(toAppointmentView)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

/** Everyone still waiting for an earlier slot, fairest order first. */
export async function getOpenWaitlist() {
  return prisma.waitlistEntry.findMany({
    where: { resolvedAt: null },
    // Urgent first, then oldest request — the fairest order to work down.
    orderBy: [{ urgent: 'desc' }, { createdAt: 'asc' }],
    include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } } },
  });
}

/**
 * People already on the register wearing this phone number.
 *
 * Two people can share a line — a family does — so this is only ever material
 * for a warning, never a refusal. What it stops is the silent second "Arta
 * Krasniqi", created once at the front desk and once from a hurried booking,
 * whose history is then split across two records.
 *
 * Here rather than inside `savePatient` because there are two doors onto
 * creating a patient and only one of them was checking: the booking dialog
 * writes a record inline, which is exactly the "hurried booking" that
 * `mergePatients` was written to clean up after. One definition, both callers.
 *
 * Archived records are deliberately included. An archived duplicate is the one
 * most worth warning about — it is out of every list and picker, so the person
 * about to make a second record has no way to have seen it.
 *
 * Returns display names, longest-established first, or an empty list when the
 * number is too short to be worth comparing.
 */
export async function findPhoneDuplicates(
  phone: string,
  excludeId?: string | null,
): Promise<string[]> {
  const key = phoneKey(phone);
  if (key.length < 6) return [];

  const existing = await prisma.patient.findMany({
    where: { phone: { endsWith: key }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { firstName: true, lastName: true },
    take: 5,
  });

  return existing.map((patient) => `${patient.lastName} ${patient.firstName}`);
}

/**
 * Every record id the activity log might have filed something about this person
 * under — the answer to "what has ever happened to this patient".
 *
 * `AuditLog.entityId` is one column holding whichever record the line was about,
 * and for a patient that is not one id but a family of them. Their own row, the
 * chart, a recall and a contact are all filed under the *patient's* id; every
 * appointment, visit, document, prescription and plan is filed under its own.
 * Matching the patient id alone therefore answers a narrower question than the
 * one being asked, and silently — which is the failure mode worth avoiding on a
 * screen somebody consults when a record is disputed.
 *
 * The `in` list is a few hundred ids for a long-standing patient, which Postgres
 * takes without complaint, and it is bounded by how much treatment one person
 * has had rather than by how big the practice is.
 *
 * Appointments cannot be reached through their own audit rows any other way:
 * there is no page per appointment, so nothing else would ever surface them.
 */
export async function patientAuditIds(patientId: string): Promise<string[]> {
  const [appointments, visits, documents, prescriptions, plans] = await Promise.all([
    prisma.appointment.findMany({ where: { patientId }, select: { id: true } }),
    prisma.visitRecord.findMany({ where: { patientId }, select: { id: true } }),
    prisma.patientDocument.findMany({ where: { patientId }, select: { id: true } }),
    prisma.prescription.findMany({ where: { patientId }, select: { id: true } }),
    prisma.treatmentPlan.findMany({ where: { patientId }, select: { id: true } }),
  ]);

  return [
    patientId,
    ...appointments.map((row) => row.id),
    ...visits.map((row) => row.id),
    ...documents.map((row) => row.id),
    ...prescriptions.map((row) => row.id),
    ...plans.map((row) => row.id),
  ];
}

export async function getPatientAppointments(patientId: string): Promise<AppointmentView[]> {
  const rows = await prisma.appointment.findMany({
    where: { patientId },
    select: APPOINTMENT_SELECT,
    orderBy: { date: 'desc' },
  });

  return rows.map(toAppointmentView);
}

/**
 * Materials at or below their minimum. Prisma cannot compare two columns portably,
 * and a clinic's catalog is small, so the comparison happens in memory.
 *
 * `ACTIVE_STOCK` is the shared "not retired" filter — a discontinued material
 * keeps its ledger (see `StockItem.archivedAt`) but must not show up as
 * something to count, order or run out of.
 */
export const ACTIVE_STOCK = { archivedAt: null } as const;

export type StockCategoryOption = { id: string; name: string };

/**
 * The shelves, in picker order — and the only place the old free-text
 * categories are carried over to them.
 *
 * The categories the practice already has were typed into a text box, one
 * material at a time, and they are real information: the stocktake screen walks
 * the room by them. This moves them on first read rather than in a migration —
 * see `getServiceCategories` above for why that is still the case now that
 * migrations do run.
 *
 * Each distinct spelling becomes one `StockCategory`, the materials wearing it
 * are pointed at that row, and `legacyCategory` is cleared in the same
 * transaction — which is what makes this run once and cost a single empty query
 * on every load afterwards, rather than being a permanent second code path.
 */
export async function getStockCategories(): Promise<StockCategoryOption[]> {
  const orphaned = await prisma.stockItem.findMany({
    where: { categoryId: null, NOT: { legacyCategory: null } },
    select: { id: true, legacyCategory: true },
  });
  if (orphaned.length > 0) await adoptLegacyCategories(orphaned);

  return prisma.stockCategory.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/**
 * Turn the typed-in category names into rows, once.
 *
 * Two requests can arrive together on the deploy that first exposes this, and
 * without a unique index on `name` (see `StockCategory`) both would create their
 * own "Higjienë". The advisory lock is held for the transaction only, so the
 * second request waits, then finds nothing left to adopt.
 */
async function adoptLegacyCategories(
  orphaned: Array<{ id: string; legacyCategory: string | null }>,
): Promise<void> {
  const wanted = new Map<string, { name: string; itemIds: string[] }>();
  for (const item of orphaned) {
    const name = item.legacyCategory?.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    const group = wanted.get(key) ?? { name, itemIds: [] };
    group.itemIds.push(item.id);
    wanted.set(key, group);
  }
  if (wanted.size === 0) return;

  await prisma.$transaction(async (tx) => {
    // An arbitrary constant, and the only advisory lock in the app.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4207310001)`;

    const known = new Map(
      (await tx.stockCategory.findMany({ select: { id: true, name: true } })).map((category) => [
        category.name.toLowerCase(),
        category.id,
      ]),
    );

    for (const [key, group] of wanted) {
      const categoryId =
        known.get(key) ??
        (await tx.stockCategory.create({ data: { name: group.name }, select: { id: true } })).id;

      await tx.stockItem.updateMany({
        // `categoryId: null` again: a material somebody has since filed by hand
        // keeps the shelf they chose, not the one the old text box remembers.
        where: { id: { in: group.itemIds }, categoryId: null },
        data: { categoryId, legacyCategory: null },
      });
    }

    // Anything left holding a blank or whitespace-only category — nothing to
    // adopt, but it would make this run again on every single load.
    await tx.stockItem.updateMany({
      where: { id: { in: orphaned.map((item) => item.id) }, categoryId: null },
      data: { legacyCategory: null },
    });
  });
}

export async function getLowStockItems() {
  const items = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: { name: 'asc' },
    // `usedQuantity` as well as `quantity`: an expired lot only counts against
    // the shelf for what is still in it. See `remainingOf`.
    include: { batches: { select: { expiryDate: true, quantity: true, usedQuantity: true } } },
  });

  // Against what is *usable*, not what is on the shelf. An expired box counted
  // toward the minimum like any other, so an item could read as well stocked
  // while every unit of it was unusable.
  return items
    .map((item) => ({ ...item, usable: usableQuantity(item.quantity, item.batches) }))
    .filter((item) => item.usable <= item.minLimit);
}

/**
 * Tomorrow's appointments that nobody has reminded yet.
 *
 * The app never sends anything on its own — that is a deliberate choice and it
 * stays — so a scheduled job would have nothing to do. What was actually
 * missing is that reminding was invisible: it only happened when somebody
 * thought to open the calendar and work down it. The contact log from Phase 3
 * finally makes "who has not been told" answerable, so the dashboard can ask
 * the question instead of waiting to be asked.
 *
 * A patient who has already confirmed needs nothing, and one who has declined
 * has answered — neither belongs on a chase list.
 */
export async function getUnremindedTomorrow(): Promise<AppointmentView[]> {
  const day = addDays(today(), 1);

  const rows = await prisma.appointment.findMany({
    where: {
      date: day,
      status: AppointmentStatus.SCHEDULED,
      confirmedAt: null,
      declinedAt: null,
      // Nothing sent about this appointment, by anyone, through any channel.
      contacts: { none: { purpose: ContactPurpose.REMINDER } },
      // Asking somebody who said not to is worse than not asking at all.
      patient: { contactConsent: { not: false } },
    },
    select: APPOINTMENT_SELECT,
  });

  return rows
    .map(toAppointmentView)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

/**
 * Every follow-up still open, soonest first.
 *
 * Uncapped on purpose. The bell draws a count on every page in the app, and a
 * count taken from a truncated list is a count that is quietly wrong — which is
 * worse than no badge at all, because the whole point of the thing is that it
 * can be trusted without opening it. A four-person practice's board is tens of
 * rows; `sortFollowUps` then puts them in reading order, which the database
 * cannot do because the buckets depend on what today is.
 *
 * The three links are joined here rather than looked up per row: a line in the
 * bell has to say whose crown it is about, and one query beats twenty.
 *
 * `cache`d for the same reason `loadCandidates` in `recalls.ts` is: the bell in
 * `AppShell` and the board on the dashboard both ask for this, and on the
 * dashboard they ask within one render — so the heaviest query on the page ran
 * twice for exactly the same rows. Every other shared read in this file is
 * already wrapped this way; this one was missed.
 */
export const getOpenFollowUps = cache(async () => {
  return prisma.followUp.findMany({
    where: {
      doneAt: null,
      // A line about somebody who has been filed away is not work any more —
      // the same rule the recall list and every patient list already follow.
      // Written as "no patient, or a patient who is still active" rather than
      // as a plain `patient: ACTIVE_PATIENTS`, because most lines are about
      // nothing in particular ("order more gloves") and a null relation would
      // fail that filter and empty the board.
      OR: [{ patientId: null }, { patient: ACTIVE_PATIENTS }],
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      work: { select: { number: true, patientName: true } },
      stockItem: { select: { name: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { attachments: true } },
    },
  });
});

export type OpenFollowUp = Awaited<ReturnType<typeof getOpenFollowUps>>[number];

/**
 * Cases still out at the laboratory that are late or nearly so.
 *
 * Bounded by date rather than by row count: what makes this list useful is that
 * it is short because the practice is on top of things, not because the query
 * stopped early.
 */
export async function getWorksToChase() {
  return prisma.work.findMany({
    where: { receivedAt: null, dueAt: { not: null, lte: addDays(today(), DUE_SOON_DAYS) } },
    orderBy: [{ urgent: 'desc' }, { dueAt: 'asc' }],
    select: {
      id: true,
      number: true,
      patientName: true,
      phone: true,
      patientId: true,
      dueAt: true,
      receivedAt: true,
      urgent: true,
      sentAt: true,
    },
  });
}

/**
 * Everyone a follow-up can be handed to.
 *
 * Wider than `getProviderOptions`, which is deliberately clinicians only: the
 * front desk is who rings the laboratory and who orders the gloves, so a list
 * that could not name them would be missing the person most of these lines are
 * actually for.
 */
export const getAssignableStaff = cache(async (): Promise<StaffOption[]> => {
  const staff = await prisma.staffUser.findMany({
    where: { active: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true },
  });

  return staff.map((person) => ({
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
  }));
});

/**
 * The relations every rendering of a follow-up needs, named once.
 *
 * The board, the bell and the detail screen all have to say whose crown a line
 * is about and whose job it is, and all three would otherwise spell out the
 * same four joins slightly differently.
 */
const FOLLOW_UP_LINKS = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  work: { select: { number: true, patientName: true } },
  stockItem: { select: { name: true } },
  assignedTo: { select: { firstName: true, lastName: true } },
} as const;

/** How the board is narrowed. Every value comes straight off the query string. */
export type FollowUpFilters = {
  /** `open` (the default), `done`, or `all`. */
  status?: string;
  /** A staff id, or `none` for the lines nobody has been given. */
  assignee?: string;
  /** Matched against the title and the note. */
  q?: string;
};

/**
 * The board, in full — including what has been ticked off.
 *
 * `getOpenFollowUps` above answers the bell's question ("what is still to do?")
 * and is cached for it. This one answers the *page's*, which is a different
 * question: a board somebody works down has to be able to show what was closed
 * last week, or a line ticked by mistake is gone for good. The two are kept
 * apart rather than parameterised into one, because the bell's version is read
 * on every single page in the app and must stay the narrow, cacheable query.
 */
export async function getFollowUpBoard(filters: FollowUpFilters = {}) {
  const status = filters.status === 'done' || filters.status === 'all' ? filters.status : 'open';
  const term = filters.q?.trim();

  return prisma.followUp.findMany({
    where: {
      ...(status === 'open' ? { doneAt: null } : {}),
      ...(status === 'done' ? { doneAt: { not: null } } : {}),
      // Same rule as the bell: a line about somebody who has been filed away is
      // not work any more, and most lines are about nobody in particular.
      OR: [{ patientId: null }, { patient: ACTIVE_PATIENTS }],
      ...(filters.assignee === 'none'
        ? { assignedToId: null }
        : filters.assignee
          ? { assignedToId: filters.assignee }
          : {}),
      ...(term
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: term, mode: 'insensitive' as const } },
                  { notes: { contains: term, mode: 'insensitive' as const } },
                ],
              },
            ],
          }
        : {}),
    },
    // A closed board reads newest-first — "what did we do?" — while an open one
    // reads by date. `sortFollowUps` puts the open buckets in reading order
    // afterwards; this only has to get the closed case right, which it cannot,
    // because "done" has no bucket to sort into.
    orderBy: status === 'done' ? [{ doneAt: 'desc' }] : [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      ...FOLLOW_UP_LINKS,
      doneBy: { select: { firstName: true, lastName: true } },
      // The count alone: the board shows a paperclip and a number, and reading
      // every filename for every row to print one digit is a query per line.
      _count: { select: { attachments: true } },
    },
  });
}

export type BoardFollowUp = Awaited<ReturnType<typeof getFollowUpBoard>>[number];

/** One line, with everything its own screen shows. */
export async function getFollowUp(id: string) {
  return prisma.followUp.findUnique({
    where: { id },
    include: {
      ...FOLLOW_UP_LINKS,
      createdBy: { select: { firstName: true, lastName: true } },
      doneBy: { select: { firstName: true, lastName: true } },
      attachments: {
        orderBy: { createdAt: 'asc' },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}

export type FollowUpDetail = NonNullable<Awaited<ReturnType<typeof getFollowUp>>>;
