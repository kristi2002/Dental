import { AppointmentStatus } from '@/generated/prisma/enums';
import type { DaySchedule } from '@/lib/clinic-hours';
import { addDays, clinicMinutesNow, minutesToTime, timeToMinutes, toDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getDaySchedule } from '@/lib/queries';

/** Slots are offered on the half hour — a clinic diary, not a calendar app. */
export const SLOT_STEP_MINUTES = 15;

export type Conflict = {
  id: string;
  startTime: string;
  durationMin: number;
  staffName: string;
  operatoryName: string;
  patient: { firstName: string; lastName: string };
};

/** The two things an appointment occupies. Either may be unknown. */
export type Resources = {
  staffUserId?: string | null;
  operatoryId?: string | null;
};

/**
 * Whether two overlapping bookings actually collide.
 *
 * A practice with one dentist and one chair records neither, and everything
 * collides with everything — which is the behaviour it had before any of this
 * existed, and the right answer for that practice. As soon as a resource *is*
 * recorded on both sides, it can settle the question:
 *
 * - the same dentist, or the same chair, is always a collision. One person
 *   cannot be in two rooms, and one room cannot hold two treatments.
 * - different dentists, or different chairs, is not — that is exactly the
 *   parallel work the practice-wide check used to forbid.
 * - anything still unknown collides, because a warning that can be overridden
 *   in one tap is cheaper than a double-booking nobody saw.
 */
export function collides(a: Resources, b: Resources): boolean {
  const sameStaff = Boolean(a.staffUserId && b.staffUserId && a.staffUserId === b.staffUserId);
  const sameChair = Boolean(a.operatoryId && b.operatoryId && a.operatoryId === b.operatoryId);
  if (sameStaff || sameChair) return true;

  const otherStaff = Boolean(a.staffUserId && b.staffUserId && a.staffUserId !== b.staffUserId);
  const otherChair = Boolean(a.operatoryId && b.operatoryId && a.operatoryId !== b.operatoryId);
  return !(otherStaff || otherChair);
}

/**
 * Appointments on the same day whose time range overlaps the proposed one *and*
 * whose resources collide with it.
 *
 * Cancelled and no-show slots do not block anything — the chair is free, which
 * is exactly the case where someone else should be offered the time.
 */
export async function findConflicts({
  date,
  startTime,
  durationMin,
  staffUserId,
  operatoryId,
  excludeId,
}: {
  date: Date;
  startTime: string;
  durationMin: number;
  /** The appointment being edited, which must not conflict with itself. */
  excludeId?: string | null;
} & Resources): Promise<Conflict[]> {
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
      staffUserId: true,
      operatoryId: true,
      staffUser: { select: { firstName: true, lastName: true } },
      operatory: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  return sameDay
    .filter((appointment) => {
      const otherStart = timeToMinutes(appointment.startTime);
      const overlaps = otherStart < end && otherStart + appointment.durationMin > start;
      return overlaps && collides({ staffUserId, operatoryId }, appointment);
    })
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    .map((appointment) => ({
      id: appointment.id,
      startTime: appointment.startTime,
      durationMin: appointment.durationMin,
      staffName: appointment.staffUser
        ? `${appointment.staffUser.firstName} ${appointment.staffUser.lastName}`
        : '',
      operatoryName: appointment.operatory?.name ?? '',
      patient: appointment.patient,
    }));
}

/**
 * Now, rounded up to the next slot boundary — the earliest time still worth
 * offering. Passed as `after` so today's free time means the time still ahead:
 * a gap at nine is not a booking opportunity at half past eleven.
 */
export function nextSlotTime(now: Date = new Date()): string {
  const minutes = clinicMinutesNow(now);
  return minutesToTime(
    Math.min(24 * 60, Math.ceil(minutes / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES),
  );
}

export type FreeGap = { startTime: string; endTime: string; minutes: number };

/** A booked stretch, as the gap maths needs it and nothing more. */
type Booked = { startTime: string; durationMin: number };

/**
 * The free stretches left in one day's opening hours by one day's bookings.
 *
 * Pure, and separated from the query so the same arithmetic answers both "what
 * is free today" and "what is the next free hour this month" — the second walks
 * thirty days and must not run thirty days of queries to do it.
 */
export function gapsIn(
  schedule: DaySchedule,
  booked: Booked[],
  { minMinutes = SLOT_STEP_MINUTES, after }: { minMinutes?: number; after?: string } = {},
): FreeGap[] {
  if (schedule.closed) return [];

  const earliest = after ? timeToMinutes(after) : 0;

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

  // Each open stretch is walked separately, so the lunch break splits the day
  // into two runs of free time instead of one that spans it.
  const gaps: FreeGap[] = [];
  const push = (start: number, end: number) => {
    if (end - start >= minMinutes) {
      gaps.push({
        startTime: minutesToTime(start),
        endTime: minutesToTime(end),
        minutes: end - start,
      });
    }
  };

  for (const range of schedule.ranges) {
    let cursor = Math.max(range.start, earliest);
    if (cursor >= range.end) continue;

    for (const slot of merged) {
      if (slot.end <= cursor) continue; // already behind us
      if (slot.start >= range.end) break; // past this open stretch

      if (slot.start > cursor) push(cursor, Math.min(slot.start, range.end));
      cursor = Math.max(cursor, slot.end);
      if (cursor >= range.end) break;
    }

    // Whatever is left between the last booking and closing time.
    if (cursor < range.end) push(cursor, range.end);
  }

  return gaps;
}

/**
 * The day's genuinely empty stretches, merged.
 *
 * Whole gaps rather than fixed-size slots, because the question being asked is
 * "will this 45-minute treatment fit?" — and a run of four free quarter-hours
 * answers yes, while four separate quarter-hour slots would each answer no.
 *
 * Bounded by the day's actual opening hours, so a closed Sunday and the lunch
 * break yield nothing rather than yielding the whole day.
 */
export async function findFreeGaps({
  date,
  minMinutes = SLOT_STEP_MINUTES,
  after,
  staffUserId,
}: {
  date: Date;
  /** Ignore slivers shorter than this — nobody books a five-minute hole. */
  minMinutes?: number;
  /** `HH:MM` — ignore anything earlier, e.g. the rest of today. */
  after?: string;
  /**
   * Whose free time. Given, only that dentist's bookings block and their own
   * leave closes the day. Left out, the question is the practice-wide one it
   * has always been: time when *nobody* is busy.
   */
  staffUserId?: string | null;
}): Promise<FreeGap[]> {
  const [schedule, booked] = await Promise.all([
    getDaySchedule(date, staffUserId),
    prisma.appointment.findMany({
      where: {
        date,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED] },
        ...(staffUserId ? { staffUserId } : {}),
      },
      select: { startTime: true, durationMin: true },
    }),
  ]);

  return gapsIn(schedule, booked, { minMinutes, after });
}

/** A free stretch, and the day it is on. */
export type DatedGap = FreeGap & { date: string };

/**
 * The next free stretches that fit, looking forward across days.
 *
 * The question the front desk is actually asked — *"when is your first free
 * hour?"* — and the one the diary could not answer: `findFreeGaps` takes exactly
 * one date, so finding the next opening meant paging the calendar a day at a
 * time and reading each grid. For a practice booked three weeks out that is
 * twenty page loads to answer one question over the counter.
 *
 * Today is included and trimmed to the time still ahead, because "this
 * afternoon" is the best possible answer and the one a day-by-day search reaches
 * last. Closed days cost nothing — the week and the closures are request-cached,
 * and every booking in the window is read in a single query rather than one per
 * day.
 */
export async function findNextGaps({
  from,
  minutes,
  staffUserId,
  days = 30,
  limit = 6,
  after,
}: {
  /** First day to consider, inclusive. */
  from: Date;
  /** How long the treatment is. Nothing shorter than this is offered. */
  minutes: number;
  staffUserId?: string | null;
  /** How far ahead to look before giving up. */
  days?: number;
  /** How many stretches to return. */
  limit?: number;
  /** `HH:MM` — ignore anything earlier *on the first day*, e.g. the rest of today. */
  after?: string;
}): Promise<DatedGap[]> {
  const span = Math.max(1, days);
  const lastDay = addDays(from, span - 1);

  const booked = await prisma.appointment.findMany({
    where: {
      date: { gte: from, lte: lastDay },
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED] },
      ...(staffUserId ? { staffUserId } : {}),
    },
    select: { date: true, startTime: true, durationMin: true },
  });

  const byDay = new Map<string, Booked[]>();
  for (const appointment of booked) {
    const key = toDateKey(appointment.date);
    const list = byDay.get(key);
    if (list) list.push(appointment);
    else byDay.set(key, [appointment]);
  }

  const found: DatedGap[] = [];
  for (let offset = 0; offset < span && found.length < limit; offset += 1) {
    const day = addDays(from, offset);
    const key = toDateKey(day);
    const schedule = await getDaySchedule(day, staffUserId);

    const gaps = gapsIn(schedule, byDay.get(key) ?? [], {
      minMinutes: minutes,
      // Only the first day is bounded by the clock — "after 14:30" means the
      // rest of today, not half past two on every day of the month.
      after: offset === 0 ? after : undefined,
    });

    for (const gap of gaps) {
      if (found.length >= limit) break;
      found.push({ ...gap, date: key });
    }
  }

  return found;
}
