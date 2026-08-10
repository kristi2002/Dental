import { AppointmentStatus } from '@/generated/prisma/enums';
import { DAY_END_HOUR, DAY_START_HOUR, minutesToTime, timeToMinutes } from '@/lib/dates';
import { prisma } from '@/lib/prisma';

/** Slots are offered on the half hour — a clinic diary, not a calendar app. */
export const SLOT_STEP_MINUTES = 15;

export type Conflict = {
  id: string;
  startTime: string;
  durationMin: number;
  patient: { firstName: string; lastName: string };
};

/**
 * Appointments on the same day whose time range overlaps the proposed one.
 *
 * Cancelled and no-show slots do not block anything — the chair is free, which
 * is exactly the case where someone else should be offered the time.
 */
export async function findConflicts({
  date,
  startTime,
  durationMin,
  excludeId,
}: {
  date: Date;
  startTime: string;
  durationMin: number;
  /** The appointment being edited, which must not conflict with itself. */
  excludeId?: string | null;
}): Promise<Conflict[]> {
  const start = timeToMinutes(startTime);
  const end = start + durationMin;

  const sameDay = await prisma.appointment.findMany({
    where: {
      date,
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      startTime: true,
      durationMin: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  return sameDay
    .filter((appointment) => {
      const otherStart = timeToMinutes(appointment.startTime);
      return otherStart < end && otherStart + appointment.durationMin > start;
    })
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

export type FreeGap = { startTime: string; endTime: string; minutes: number };

/**
 * The day's genuinely empty stretches, merged.
 *
 * Whole gaps rather than fixed-size slots, because the question being asked is
 * "will this 45-minute treatment fit?" — and a run of four free quarter-hours
 * answers yes, while four separate quarter-hour slots would each answer no.
 */
export async function findFreeGaps({
  date,
  minMinutes = SLOT_STEP_MINUTES,
  after,
}: {
  date: Date;
  /** Ignore slivers shorter than this — nobody books a five-minute hole. */
  minMinutes?: number;
  /** `HH:MM` — ignore anything earlier, e.g. the rest of today. */
  after?: string;
}): Promise<FreeGap[]> {
  const booked = await prisma.appointment.findMany({
    where: {
      date,
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED] },
    },
    select: { startTime: true, durationMin: true },
  });

  const dayStart = Math.max(DAY_START_HOUR * 60, after ? timeToMinutes(after) : 0);
  const dayEnd = DAY_END_HOUR * 60;

  // Merge the bookings first: two back-to-back appointments must not leave a
  // phantom zero-length gap between them, and overlaps must count once.
  const taken = booked
    .map((a) => ({
      start: timeToMinutes(a.startTime),
      end: timeToMinutes(a.startTime) + a.durationMin,
    }))
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const slot of taken) {
    const last = merged.at(-1);
    if (last && slot.start <= last.end) {
      last.end = Math.max(last.end, slot.end);
    } else {
      merged.push({ ...slot });
    }
  }

  const gaps: FreeGap[] = [];
  let cursor = dayStart;
  for (const slot of [...merged, { start: dayEnd, end: dayEnd }]) {
    if (slot.start > cursor) {
      const start = cursor;
      const end = Math.min(slot.start, dayEnd);
      if (end - start >= minMinutes) {
        gaps.push({
          startTime: minutesToTime(start),
          endTime: minutesToTime(end),
          minutes: end - start,
        });
      }
    }
    cursor = Math.max(cursor, slot.end);
    if (cursor >= dayEnd) break;
  }

  return gaps;
}
