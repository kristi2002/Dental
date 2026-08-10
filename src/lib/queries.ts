import type { PatientOption, ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import type { AppointmentView } from '@/components/appointments/types';
import { prisma } from '@/lib/prisma';
import { toDateKey, timeToMinutes } from '@/lib/dates';

/** Patients in a `<select>`-ready shape, sorted the way a paper file drawer is. */
export async function getPatientOptions(): Promise<PatientOption[]> {
  const patients = await prisma.patient.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true },
  });

  return patients.map((p) => ({ id: p.id, name: `${p.lastName} ${p.firstName}` }));
}

export async function getServiceOptions(): Promise<ServiceOption[]> {
  return prisma.service.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, durationMin: true },
  });
}

type AppointmentWithPatient = {
  id: string;
  date: Date;
  startTime: string;
  durationMin: number;
  status: string;
  notes: string | null;
  serviceName: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
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
    patient: {
      id: appointment.patient.id,
      firstName: appointment.patient.firstName,
      lastName: appointment.patient.lastName,
      phone: appointment.patient.phone,
      email: appointment.patient.email ?? '',
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
  patient: {
    select: { id: true, firstName: true, lastName: true, phone: true, email: true },
  },
} as const;

/** Appointments in `[from, to]` (both UTC midnights, inclusive), ordered by day then clock time. */
export async function getAppointmentsBetween(from: Date, to: Date): Promise<AppointmentView[]> {
  const rows = await prisma.appointment.findMany({
    where: { date: { gte: from, lte: to } },
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
