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
import { labsOnCase } from '@/lib/labs';
import { usableQuantity } from '@/lib/expiry';
import {
  alertQuietened,
  alertVisible,
  orderLateBy,
  severityOf,
  sortStockAlerts,
  type StockAlert,
  type StockAlertBoard,
  type StockAlertLike,
} from '@/lib/stock-alerts';
import { ACTIVE_PATIENTS, phoneKey } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import { addDays, toDateKey, timeToMinutes, today } from '@/lib/dates';
import { DUE_SOON_DAYS } from '@/lib/works';

/**
 * The same "not retired" filter, for the three catalogues that gained one.
 *
 * A retired treatment, supplier or piece of standard wording leaves every
 * picker and stays on every record that names it — see `Service.archivedAt`,
 * which sets out why deleting them was destroying history. Management screens
 * deliberately read *without* these, because the one thing a retired row has to
 * be able to do is be restored.
 */
export const ACTIVE_SERVICES = { archivedAt: null } as const;
export const ACTIVE_SUPPLIERS = { archivedAt: null } as const;
export const ACTIVE_TEMPLATES = { archivedAt: null } as const;

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
export type ClinicProfile = {
  name: string;
  toothNumbering: ToothNumbering;
  currency: string;
  /** The letterhead — see the model. Null where nobody has filled it in. */
  phone: string | null;
  email: string | null;
  address: string | null;
};

export const getClinicProfile = cache(async (): Promise<ClinicProfile> => {
  const profile = await prisma.clinicProfile.upsert({
    where: { id: 'clinic' },
    create: {},
    update: {},
    select: {
      name: true,
      toothNumbering: true,
      currency: true,
      phone: true,
      email: true,
      address: true,
    },
  });
  return profile;
});

/**
 * What this practice is called, wherever the app has to write it down.
 *
 * Settings first, the deploy's own variable behind it. The two answers exist for
 * different moments and neither is right on its own: `NEXT_PUBLIC_CLINIC_NAME`
 * is what `docs/DEPLOYMENT` asks an installer to set before anybody has signed
 * in to fill a form, and Settings is where a practice changes its own name
 * afterwards without a redeploy. So the saved answer wins and the deploy's
 * answer is the floor.
 *
 * Empty when neither has been filled in, which is a real state on a fresh
 * install — the caller decides what to do about it, because the answers differ.
 * A letterhead prints no name at all rather than a placeholder; the navigation
 * rail cannot be blank, so it falls back to the product's own name.
 *
 * Resolved here rather than in `getClinicProfile`, which also backs the Settings
 * form: a fallback there would show the deploy's name sitting in the edit box as
 * though somebody had typed it.
 */
export function clinicDisplayName(profile: Pick<ClinicProfile, 'name'>): string {
  return profile.name.trim() || process.env.NEXT_PUBLIC_CLINIC_NAME?.trim() || '';
}

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
 * The catalogue's headings, flat and in name order.
 *
 * Flat rather than nested because every caller wants a different shape of tree,
 * and one level of `parentId` is cheaper to re-nest than to un-nest.
 *
 * Used to also be where the practice's old free-text categories were adopted
 * into real rows on first read — `getStockCategories` still does that for
 * `StockItem`. The service side of it was folded into a migration instead
 * (`20260901180000_retire_legacy_service_fields`), once the deploy could run
 * reviewed SQL rather than only `db push`.
 */
export async function getServiceCategories(): Promise<ServiceCategoryOption[]> {
  return prisma.serviceCategory.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, parentId: true },
  });
}

/**
 * The catalog in picker order: by department, then by name inside each one.
 *
 * `category` is the *department* even for a treatment filed under a
 * subcategory — every picker in the app groups by this string and prints it as
 * a heading, and "Kirurgji" is the heading whether the treatment sits directly
 * under it or under "Implantologji" inside it.
 */
export async function getServiceOptions(): Promise<ServiceOption[]> {
  const services = await prisma.service.findMany({
    where: ACTIVE_SERVICES,
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
  serviceId: string | null;
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

function toAppointmentView(appointment: AppointmentWithPatient): AppointmentView {
  return {
    id: appointment.id,
    date: toDateKey(appointment.date),
    startTime: appointment.startTime,
    durationMin: appointment.durationMin,
    status: appointment.status,
    serviceName: appointment.serviceName ?? '',
    serviceId: appointment.serviceId ?? '',
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
  serviceId: true,
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
  /**
   * Narrow to one chair. The other half of the same question, and the half the
   * calendar could not ask: a two-chair practice deciding whether it can take a
   * walk-in wants to know what chair 2 is doing, not what Dr B is doing.
   */
  operatoryId?: string | null,
): Promise<AppointmentView[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(staffUserId ? { staffUserId } : {}),
      ...(operatoryId ? { operatoryId } : {}),
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
 * The shelves, in picker order.
 *
 * This used to carry the old free-text categories over on first read — each
 * distinct spelling became a `StockCategory`, the materials wearing it were
 * pointed at the row, and `legacyCategory` was cleared, all under an advisory
 * lock because two requests could arrive together. It ran once per practice and
 * then cost an empty query on every load for ever.
 *
 * `20260901220000_the_links_the_entity_map_was_missing` does that pass in SQL
 * and drops the column, the way the identical adoption on `Service` was closed
 * out one migration earlier. What is left is the question the function was
 * always about.
 */
export async function getStockCategories(): Promise<StockCategoryOption[]> {
  return prisma.stockCategory.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
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
 * The storage room's own alarms, as rows for the reminder board.
 *
 * The same materials `getLowStockItems` returns — this is not a second opinion
 * about what "low" means, and must never become one. What it adds is the part
 * that makes a fact into a reminder: whether somebody has already dealt with it
 * (an order has gone out) or already waved it away (a dismissal that still
 * stands), and the supplier and order quantity the row needs to offer the verb.
 *
 * The one write on this read path is a cleanup, and it fires only when there is
 * something to clean: a material that has climbed back above its minimum has a
 * dismissal that answers a question nobody is asking any more, and leaving it
 * would silence the *next* time it runs low. Restocking is the honest way out of
 * a dismissal, so restocking is what clears it. Same lazy-adoption shape as
 * `getStockCategories` above, and the same reason — it costs one empty query
 * once the room is in a steady state.
 */
/**
 * The shelf as both alert predicates read it.
 *
 * One function rather than two object literals, so `alertVisible` and
 * `alertQuietened` cannot be handed subtly different facts about one material —
 * which is the whole basis of them partitioning the low shelves between them.
 */
function alertShape(row: {
  usable: number;
  item: { minLimit: number; orderedAt: Date | null; expectedAt: Date | null };
}): StockAlertLike {
  return {
    usable: row.usable,
    minLimit: row.item.minLimit,
    orderedAt: row.item.orderedAt,
    expectedAt: row.item.expectedAt,
  };
}

export const getStockAlerts = cache(async (): Promise<StockAlertBoard> => {
  const items = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      variantName: true,
      quantity: true,
      minLimit: true,
      orderQty: true,
      orderedAt: true,
      // The promised delivery date. Collected and displayed since orders
      // existed, and compared to a date by nothing — so an order that never
      // arrived silenced its material permanently. See `orderOverdue`.
      expectedAt: true,
      supplier: { select: { name: true } },
      batches: { select: { expiryDate: true, quantity: true, usedQuantity: true } },
      // `dismissedAt` and who, as well as the count it was waved away at: the
      // board can now undo a dismissal, and "not now, Blerina, Tuesday" is what
      // makes somebody confident it is theirs to undo.
      alertDismissal: {
        select: {
          atQuantity: true,
          dismissedAt: true,
          dismissedBy: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  const scored = items.map((item) => ({
    item,
    usable: usableQuantity(item.quantity, item.batches),
  }));

  // Dismissals belonging to materials that are no longer low. Collected first
  // and deleted in one statement, so the common case — nothing to forget — does
  // not touch the database at all.
  const stale = scored
    .filter(({ item, usable }) => item.alertDismissal && usable > item.minLimit)
    .map(({ item }) => item.id);

  if (stale.length > 0) {
    await prisma.stockAlertDismissal.deleteMany({ where: { stockItemId: { in: stale } } });
  }

  const now = today();

  /** The row as the board reads it, whichever half it lands in. */
  const toAlert = ({ item, usable }: (typeof scored)[number]): StockAlert => ({
    id: item.id,
    name: item.name,
    variantName: item.variantName ?? '',
    usable,
    quantity: item.quantity,
    minLimit: item.minLimit,
    severity: severityOf({ usable, minLimit: item.minLimit }),
    supplierName: item.supplier?.name ?? '',
    orderQty: item.orderQty,
    orderLateDays: orderLateBy({ orderedAt: item.orderedAt, expectedAt: item.expectedAt }, now),
    expectedAt: item.expectedAt,
    dismissedAt: item.alertDismissal?.dismissedAt ?? null,
    dismissedByName: item.alertDismissal?.dismissedBy
      ? `${item.alertDismissal.dismissedBy.firstName} ${item.alertDismissal.dismissedBy.lastName}`
      : '',
  });

  const active = scored
    .filter((row) => alertVisible(alertShape(row), row.item.alertDismissal, now))
    .map(toAlert);

  // The undo list. Same shelf, same arithmetic, opposite answer — so a material
  // is in exactly one of the two and neither can be reached by accident.
  const quietened = scored
    .filter((row) => alertQuietened(alertShape(row), row.item.alertDismissal, now))
    .map(toAlert);

  return { active: sortStockAlerts(active), quietened: sortStockAlerts(quietened) };
});

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
      //
      // Only an explicit `false` closes it. `contactConsent` is tri-state and
      // null is "nobody has asked them yet", which is the state every imported
      // patient starts in and the majority state in any real practice — those
      // people still need reminding. Written as an `OR` because the shorter
      // `{ not: false }` compiles to `contactConsent <> false`, and SQL cannot
      // say that of a null: it matched only the patients somebody had
      // explicitly ticked, so a practice that had never used the consent field
      // saw this panel sit empty for ever and read it as "everyone has been
      // told". Same null trap as `NOT_CLINIC_CANCELLED` in `reliability.ts`.
      patient: { OR: [{ contactConsent: null }, { contactConsent: true }] },
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
  const works = await prisma.work.findMany({
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
      // Who to actually ring.
      //
      // This panel is headed "waiting on the laboratory" and the only telephone
      // number it could offer was `Work.phone`, which the schema documents as
      // the *patient's* number snapshotted off the docket. So the one row in the
      // app whose entire purpose is to start a call to a laboratory handed you
      // the one person who cannot help — for as long as the panel has existed,
      // because until `Lab` there was nowhere for the right number to live.
      lines: {
        select: {
          lab: true,
          labRef: { select: { id: true, name: true, phone: true, email: true } },
        },
      },
    },
  });

  // `Object.assign` rather than a spread: this runs over every case the practice
  // is waiting on, on every dashboard load, and the rows are ours to mutate —
  // they came out of the query a line above and nothing else has seen them.
  return works.map((work) => Object.assign(work, { labs: labsOnCase(work.lines) }));
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
