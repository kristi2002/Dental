import type { Prisma } from '@/generated/prisma/client';
import { AppointmentStatus } from '@/generated/prisma/enums';
import type { DaySchedule } from '@/lib/clinic-hours';
import { addDays, clinicMinutesNow, minutesToTime, timeToMinutes, toDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getDaySchedule } from '@/lib/queries';

/** Slots are offered on the half hour — a clinic diary, not a calendar app. */
export const SLOT_STEP_MINUTES = 15;

/**
 * The statuses that mean a chair is spoken for.
 *
 * `ARRIVED` belongs here and was missing from all three queries below, which is
 * the worst possible one to leave out: it is set by the front desk at the exact
 * moment the patient is most certainly in the building. The slot stopped
 * blocking the second somebody pressed the button — its minutes merged back
 * into the day's free time and were then offered by the slot finder, handed out
 * by the waiting list, and booked over without a conflict warning, while the
 * patient sat in the chair.
 *
 * Cancelled and no-show stay out: the chair really is free, and that is exactly
 * the case where somebody else should be offered the time.
 *
 * A named constant rather than three inline arrays, because three inline arrays
 * is how one of them came to disagree with the other twelve occupancy checks in
 * the app — every one of which already counted `ARRIVED`.
 */
export const OCCUPIES_A_SLOT = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.COMPLETED,
] as const;

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
 * The advisory-lock namespace the diary books under.
 *
 * Any integer would do; it exists so that a lock taken here can never be
 * mistaken for one taken by something else in the same database. It is
 * currently the only advisory lock this application takes.
 */
const DIARY_LOCK = 4021;

/**
 * Hold the diary for these days until the surrounding transaction ends.
 *
 * **Why a re-check inside the transaction is not enough on its own.** Postgres
 * runs at `READ COMMITTED` by default, so two transactions that each re-query
 * for conflicts see the state before the other started, both find the slot
 * free, and both commit. Re-checking closes the gap between *reading* and
 * *writing* in one request; it does nothing about two requests overlapping.
 * Only something that makes them take turns does.
 *
 * A day is exactly the right granularity, and not a guess: `findConflicts`
 * filters on `date` before anything else, so two bookings that could possibly
 * collide are on the same day *by construction*. Locking the day therefore
 * serialises every pair that could conflict and no pair that could not — a
 * clinic's other twenty-nine days keep booking in parallel.
 *
 * Taken in sorted order because a series booking locks several days at once,
 * and two series overlapping in opposite directions is the textbook deadlock.
 * A fixed order makes that impossible.
 *
 * `pg_advisory_xact_lock` releases on commit *or* rollback, with no `finally`
 * to forget — which matters here, because the whole point is a path that
 * deliberately throws.
 */
export async function lockDiaryDays(
  tx: Prisma.TransactionClient,
  dates: readonly Date[],
): Promise<void> {
  // Appointment dates are stored at UTC midnight, so this division is exact.
  const days = [
    ...new Set(dates.map((date) => Math.floor(date.getTime() / 86_400_000))),
  ].toSorted((a, b) => a - b);

  for (const day of days) {
    // `$executeRaw`, not `$queryRaw`: the function returns `void`, and Prisma
    // cannot deserialize a void column — it fails with a message about
    // `Unsupported` schema types that has nothing to do with what went wrong.
    // Nothing here wants the result anyway; the lock is the whole return value.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DIARY_LOCK}::int, ${day}::int)`;
  }
}

/**
 * Appointments on the same day whose time range overlaps the proposed one *and*
 * whose resources collide with it.
 *
 * Cancelled and no-show slots do not block anything — the chair is free, which
 * is exactly the case where someone else should be offered the time.
 *
 * `client` is how the booking action asks this question *again* from inside its
 * own transaction, after `lockDiaryDays` has made the answer authoritative. The
 * default keeps every read-only caller — the dialog's live warning, the day
 * grid — exactly as it was.
 */
export async function findConflicts({
  date,
  startTime,
  durationMin,
  staffUserId,
  operatoryId,
  excludeId,
  client = prisma,
}: {
  date: Date;
  startTime: string;
  durationMin: number;
  /** The appointment being edited, which must not conflict with itself. */
  excludeId?: string | null;
  /** The transaction to ask inside, when the answer is about to be acted on. */
  client?: Prisma.TransactionClient | typeof prisma;
} & Resources): Promise<Conflict[]> {
  const start = timeToMinutes(startTime);
  const end = start + durationMin;

  const sameDay = await client.appointment.findMany({
    where: {
      date,
      status: { in: [...OCCUPIES_A_SLOT] },
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
        status: { in: [...OCCUPIES_A_SLOT] },
        ...(staffUserId ? { staffUserId } : {}),
      },
      select: { startTime: true, durationMin: true },
    }),
  ]);

  return gapsIn(schedule, booked, { minMinutes, after });
}

/**
 * Give each waiting person their own piece of the day's free time.
 *
 * Answering every request against the whole gap list independently is the
 * obvious implementation and the wrong one: one free hour then "fits" everybody
 * on the list, every row offers the same start time, and a front desk working
 * down those rows promises one slot to five people. Walking the list once and
 * taking the time as it is handed out keeps the offers distinct — and keeps the
 * count of who fits honest, which is what the dashboard states as a fact.
 *
 * Only the minutes actually used are taken, so a free hour holds two half-hour
 * treatments rather than being spent whole on the first. Requests are answered
 * in the order given, which is already the fair one: urgent first, then longest
 * waiting.
 *
 * The gap handed back is the slice assigned, not the stretch it came from — the
 * second person in a free hour is offered half past, not the hour.
 *
 * The pool is taken in the order given and may span days, so a fortnight of
 * `DatedGap`s answers "when can the practice take this person" rather than only
 * "does today hold them". Whatever else a gap carried — its day above all —
 * rides along on the slice.
 */
export function assignGaps<T extends { durationMin: number }, G extends FreeGap>(
  entries: T[],
  gaps: G[],
): Array<{ entry: T; gap: G | null }> {
  const pool = gaps.map((gap) => ({
    source: gap,
    start: timeToMinutes(gap.startTime),
    end: timeToMinutes(gap.endTime),
  }));

  return entries.map((entry) => {
    const slot = pool.find((candidate) => candidate.end - candidate.start >= entry.durationMin);
    if (!slot) return { entry, gap: null };

    const start = slot.start;
    slot.start += entry.durationMin;
    // What is left of a stretch nobody could book is not free time worth
    // offering to the next person down the list.
    if (slot.end - slot.start < SLOT_STEP_MINUTES) pool.splice(pool.indexOf(slot), 1);

    return {
      entry,
      gap: {
        ...slot.source,
        startTime: minutesToTime(start),
        endTime: minutesToTime(start + entry.durationMin),
        minutes: entry.durationMin,
      },
    };
  });
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
      status: { in: [...OCCUPIES_A_SLOT] },
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
