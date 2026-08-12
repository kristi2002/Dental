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
import { usableQuantity } from '@/lib/expiry';
import { prisma } from '@/lib/prisma';
import { addDays, toDateKey, timeToMinutes, today } from '@/lib/dates';

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
  async (): Promise<{ name: string; toothNumbering: ToothNumbering }> => {
    const profile = await prisma.clinicProfile.upsert({
      where: { id: 'clinic' },
      create: {},
      update: {},
      select: { name: true, toothNumbering: true },
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

/** The catalog in picker order: by department, then by name inside each one. */
export async function getServiceOptions(): Promise<ServiceOption[]> {
  const services = await prisma.service.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      category: true,
      durationMin: true,
      _count: { select: { materials: true } },
    },
  });

  return services.map(({ _count, category, ...service }) => ({
    ...service,
    category: category ?? '',
    materialCount: _count.materials,
  }));
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
 * How many appointments sit on each day of `[from, to]`, keyed by `YYYY-MM-DD`.
 *
 * The month calendar in the sidebar needs a whole month of days at once but
 * none of their detail, so it asks for counts rather than pulling six weeks of
 * appointments through `getAppointmentsBetween` to throw all but the length
 * away. Days with nothing booked are simply absent from the map.
 */
export async function getAppointmentCountsByDay(
  from: Date,
  to: Date,
  staffUserId?: string | null,
  statuses?: readonly AppointmentStatus[],
): Promise<Record<string, number>> {
  const rows = await prisma.appointment.groupBy({
    by: ['date'],
    where: {
      date: { gte: from, lte: to },
      ...(staffUserId ? { staffUserId } : {}),
      ...(statuses && statuses.length > 0 ? { status: { in: [...statuses] } } : {}),
    },
    _count: { _all: true },
  });

  return Object.fromEntries(rows.map((row) => [toDateKey(row.date), row._count._all]));
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
 * Matched on the patient having *any* visit recorded today rather than on a
 * link between the two rows, because no such link exists: a visit belongs to a
 * patient and a date, not to a slot.
 */
export async function getUnrecordedToday(): Promise<AppointmentView[]> {
  const day = today();

  const rows = await prisma.appointment.findMany({
    where: {
      date: day,
      status: AppointmentStatus.COMPLETED,
      patient: { visitRecords: { none: { visitDate: day } } },
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

export async function getLowStockItems() {
  const items = await prisma.stockItem.findMany({
    where: ACTIVE_STOCK,
    orderBy: { name: 'asc' },
    include: { batches: { select: { expiryDate: true, quantity: true } } },
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
