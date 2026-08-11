import { cache } from 'react';
import type {
  OperatoryOption,
  PatientOption,
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

/** Patients in a `<select>`-ready shape, sorted the way a paper file drawer is. */
export async function getPatientOptions(): Promise<PatientOption[]> {
  const patients = await prisma.patient.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true },
  });

  return patients.map((p) => ({ id: p.id, name: `${p.lastName} ${p.firstName}` }));
}

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
 */
export async function getLowStockItems() {
  const items = await prisma.stockItem.findMany({ orderBy: { name: 'asc' } });
  return items.filter((item) => item.quantity <= item.minLimit);
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
