import { AppointmentStatus, CancelledBy } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { today } from '@/lib/dates';

/**
 * How reliably a patient turns up, worked out from appointments that have
 * already happened.
 *
 * This exists to prompt a confirmation call, not to judge anyone: one missed
 * appointment is life, four is a pattern the front desk should know about
 * before giving away a two-hour implant slot.
 */

/** Below this many past appointments there is no pattern, only noise. */
const MIN_HISTORY = 3;

/** Missing this share of appointments earns the stronger flag. */
const AT_RISK_RATE = 0.34;

export type ReliabilityLevel = 'unknown' | 'reliable' | 'watch' | 'at-risk';

export type Reliability = {
  past: number;
  noShows: number;
  cancellations: number;
  /** Share of past appointments missed outright, 0–1. */
  missRate: number;
  level: ReliabilityLevel;
};

type StatusCount = { status: string; _count: { _all: number } };

function classify(past: number, noShows: number): ReliabilityLevel {
  if (past < MIN_HISTORY) return 'unknown';
  if (noShows === 0) return 'reliable';
  return noShows / past >= AT_RISK_RATE ? 'at-risk' : 'watch';
}

function summarise(counts: StatusCount[]): Reliability {
  const of = (status: AppointmentStatus) =>
    counts.find((row) => row.status === status)?._count._all ?? 0;

  const completed = of(AppointmentStatus.COMPLETED);
  const noShows = of(AppointmentStatus.NO_SHOW);
  const cancellations = of(AppointmentStatus.CANCELLED);
  // Cancellations count towards history but not against the patient — calling
  // ahead is the behaviour we want, so penalising it would be backwards.
  const past = completed + noShows + cancellations;

  return {
    past,
    noShows,
    cancellations,
    missRate: past === 0 ? 0 : noShows / past,
    level: classify(past, noShows),
  };
}

export async function getReliability(patientId: string): Promise<Reliability> {
  const counts = await prisma.appointment.groupBy({
    by: ['status'],
    // A cancellation the practice made is not the patient's doing, and counting
    // it against them was quietly unfair — the score drives who gets chased.
    where: {
      patientId,
      date: { lt: today() },
      NOT: { cancelledBy: CancelledBy.CLINIC },
    },
    _count: { _all: true },
  });

  return summarise(counts);
}

/** The same figure for many patients at once, for list screens. */
export async function getReliabilityMap(
  patientIds: string[],
): Promise<Map<string, Reliability>> {
  if (patientIds.length === 0) return new Map();

  const rows = await prisma.appointment.groupBy({
    by: ['patientId', 'status'],
    // The same exclusion `getReliability` makes, and it was missing here: the
    // list badge and the badge on the patient's own screen are the same claim
    // about the same person, and a slot the *clinic* called off was counting
    // towards one of them and not the other.
    where: {
      patientId: { in: patientIds },
      date: { lt: today() },
      NOT: { cancelledBy: CancelledBy.CLINIC },
    },
    _count: { _all: true },
  });

  const byPatient = new Map<string, StatusCount[]>();
  for (const row of rows) {
    byPatient.set(row.patientId, [
      ...(byPatient.get(row.patientId) ?? []),
      { status: row.status, _count: row._count },
    ]);
  }

  return new Map(
    patientIds.map((id) => [id, summarise(byPatient.get(id) ?? [])]),
  );
}
