import { AppointmentStatus } from '@/generated/prisma/enums';
import { scheduleFor, type ClosureRange, type DayHours } from '@/lib/clinic-hours';
import { addDays, toMonthKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getClinicWeek, getClosures } from '@/lib/queries';

/**
 * How much of the chair time the practice opened for was actually sold.
 *
 * The statistics page counted appointments, which answers "were we busy" only if
 * every appointment is the same length — and they are not: a day of eight
 * check-ups and a day of three implants are the same number and nothing like the
 * same day. Utilisation is the number an owner is actually asking for when they
 * ask how the practice is doing, and it is the one figure this app already had
 * every input for and never computed: opening hours in `ClinicHours`, exceptions
 * in `Closure`, and a duration on every booking.
 *
 * Deliberately *booked* minutes rather than treated ones. A slot that was
 * scheduled and then missed still cost the practice the hour it was held for;
 * measuring only completed work would quietly reward a diary full of no-shows
 * with a lower denominator.
 */

export type UtilisationPoint = {
  /** `YYYY-MM` */
  month: string;
  bookedMinutes: number;
  openMinutes: number;
  /** 0–100, rounded. Zero open minutes reads as 0 rather than as a division. */
  percent: number;
};

/** Minutes the practice is open on one day, after closures. */
function openMinutesOn(
  day: Date,
  week: DayHours[],
  closures: ClosureRange[],
  staffUserId?: string | null,
): number {
  const schedule = scheduleFor(day, week, closures, staffUserId);
  if (schedule.closed) return 0;
  return schedule.ranges.reduce((total, range) => total + (range.end - range.start), 0);
}

/**
 * Utilisation per month across `[from, to)`.
 *
 * One query for the bookings and none at all for the hours — the week and the
 * closures are request-cached, so walking a hundred and eighty days costs two
 * reads however many months are asked for.
 */
export async function getUtilisation({
  from,
  to,
  staffUserId,
}: {
  /** First day, inclusive, at UTC midnight. */
  from: Date;
  /** First day *after* the window — the same exclusive bound the page uses. */
  to: Date;
  /**
   * One dentist's utilisation. Their own leave closes their days, and only their
   * bookings count. Left out, it is the practice-wide question: all chair time
   * against all opening hours.
   */
  staffUserId?: string | null;
}): Promise<UtilisationPoint[]> {
  const [week, closures, booked] = await Promise.all([
    getClinicWeek(),
    getClosures(),
    prisma.appointment.findMany({
      where: {
        date: { gte: from, lt: to },
        // Cancelled slots freed the chair; missed ones did not.
        status: {
          in: [
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.ARRIVED,
            AppointmentStatus.COMPLETED,
            AppointmentStatus.NO_SHOW,
          ],
        },
        ...(staffUserId ? { staffUserId } : {}),
      },
      select: { date: true, durationMin: true },
    }),
  ]);

  const bookedByMonth = new Map<string, number>();
  for (const appointment of booked) {
    const key = toMonthKey(appointment.date);
    bookedByMonth.set(key, (bookedByMonth.get(key) ?? 0) + appointment.durationMin);
  }

  const openByMonth = new Map<string, number>();
  for (let day = from; day < to; day = addDays(day, 1)) {
    const key = toMonthKey(day);
    openByMonth.set(key, (openByMonth.get(key) ?? 0) + openMinutesOn(day, week, closures, staffUserId));
  }

  return [...openByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, openMinutes]) => {
      const bookedMinutes = bookedByMonth.get(month) ?? 0;
      return {
        month,
        bookedMinutes,
        openMinutes,
        percent: openMinutes === 0 ? 0 : Math.round((bookedMinutes / openMinutes) * 100),
      };
    });
}

export type ProviderReliability = {
  staffUserId: string;
  name: string;
  /** Slots that have already happened one way or the other. */
  past: number;
  noShows: number;
  /** 0–100, rounded. */
  noShowRate: number;
};

/**
 * How often each dentist's patients fail to turn up.
 *
 * Not a judgement of the dentist — it is a diary signal. One provider's list
 * missing three times as often as another's is usually a difference in what they
 * treat, when they are booked, or whether their patients get reminded, and every
 * one of those is actionable. The per-patient score in `reliability.ts` answers
 * the same question from the other end and cannot see this pattern at all.
 *
 * Clinic cancellations are excluded for the reason they are excluded there: a
 * slot the practice called off is not somebody failing to arrive.
 */
export async function getProviderNoShows({
  from,
  to,
  names,
}: {
  from: Date;
  to: Date;
  /** Dentist id → display name, so a deactivated account still reads as a person. */
  names: Map<string, string>;
}): Promise<ProviderReliability[]> {
  const rows = await prisma.appointment.groupBy({
    by: ['staffUserId', 'status'],
    where: {
      date: { gte: from, lt: to },
      staffUserId: { not: null },
      status: {
        in: [
          AppointmentStatus.COMPLETED,
          AppointmentStatus.NO_SHOW,
          AppointmentStatus.CANCELLED,
        ],
      },
      NOT: { cancelledBy: 'CLINIC' },
    },
    _count: { _all: true },
  });

  const tally = new Map<string, { past: number; noShows: number }>();
  for (const row of rows) {
    const id = row.staffUserId!;
    const entry = tally.get(id) ?? { past: 0, noShows: 0 };
    entry.past += row._count._all;
    if (row.status === AppointmentStatus.NO_SHOW) entry.noShows += row._count._all;
    tally.set(id, entry);
  }

  return [...tally.entries()]
    .map(([staffUserId, entry]) => ({
      staffUserId,
      name: names.get(staffUserId) ?? staffUserId,
      past: entry.past,
      noShows: entry.noShows,
      noShowRate: entry.past === 0 ? 0 : Math.round((entry.noShows / entry.past) * 100),
    }))
    .sort((a, b) => b.noShowRate - a.noShowRate || b.past - a.past);
}

/** Minutes as "6h 30m" — hours are the unit a day of chair time is discussed in. */
export function asHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Utilisation across the whole window, which is not the mean of the months. */
export function overallUtilisation(points: readonly UtilisationPoint[]): number {
  const booked = points.reduce((sum, point) => sum + point.bookedMinutes, 0);
  const open = points.reduce((sum, point) => sum + point.openMinutes, 0);
  return open === 0 ? 0 : Math.round((booked / open) * 100);
}
