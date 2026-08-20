import { cache } from 'react';
import { AppointmentStatus } from '@/generated/prisma/enums';
import { addMonths, today, toDateKey } from '@/lib/dates';
import { ACTIVE_PATIENTS } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';

/**
 * Who the clinic should be calling, worked out rather than remembered.
 *
 * Two questions, deliberately kept apart because they need different messages:
 *  - **Recall** — "your six months are up" for people with no next visit booked.
 *  - **Follow-up** — "how is the tooth today?" a couple of days after treatment.
 *
 * Nothing here sends anything. The list is a queue the clinic reviews, and each
 * row opens a pre-filled WhatsApp or email draft, same as the rest of the app.
 */

/** Once contacted, a patient drops off the list for this long regardless. */
const CONTACT_COOLDOWN_DAYS = 30;

/** A follow-up is worth making in this window after treatment, and not later. */
const FOLLOW_UP_FROM_DAYS = 2;
const FOLLOW_UP_TO_DAYS = 7;

export type RecallRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD`, or null when they have never been seen. */
  lastVisit: string | null;
  /** Whole months since the last visit — the number the message quotes. */
  monthsSince: number;
  /** How far past due, in days. Sorted on this, longest first. */
  overdueDays: number;
  recallMonths: number;
  /** Tri-state: `null` is "nobody asked", which is not a refusal. */
  contactConsent: boolean | null;
};

export type FollowUpRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  lastVisit: string;
  daysSince: number;
  services: string;
  contactConsent: boolean | null;
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, to.getUTCDate() < from.getUTCDate() ? months - 1 : months);
}

export type PatientForRecall = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  recallMonths: number;
  recallSnoozedUntil: Date | null;
  lastRecallAt: Date | null;
  contactConsent: boolean | null;
  visitRecords: Array<{ visitDate: Date; servicesText: string }>;
  appointments: Array<{ id: string }>;
};

/**
 * Cached per request: the recalls page asks for both lists in one `Promise.all`,
 * and this is the heaviest query either of them makes. Without `cache()` it runs
 * twice per render for exactly the same rows.
 */
const loadCandidates = cache(async (): Promise<PatientForRecall[]> => {
  const now = today();

  return prisma.patient.findMany({
    // Archiving is the one exclusion both lists share: chasing somebody who has
    // been filed away is exactly the call that makes either list stop being
    // trusted.
    //
    // `recallMonths: 0` deliberately is *not* here. It is the patient saying
    // they do not want reminding that their check-up is due, and filtering on it
    // in the shared query silently applied that answer to a question nobody
    // asked them — the two-day "how is the tooth" call after an extraction,
    // which is a clinical courtesy rather than a recall. `getRecalls` applies it
    // where it belongs, beside the other two recall-only gates.
    where: ACTIVE_PATIENTS,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      createdAt: true,
      recallMonths: true,
      recallSnoozedUntil: true,
      lastRecallAt: true,
      contactConsent: true,
      visitRecords: {
        orderBy: { visitDate: 'desc' },
        take: 1,
        // The sentence, not the rows: the follow-up message quotes it back to
        // the patient in their own words — "how is the upper left filling?"
        select: { visitDate: true, servicesText: true },
      },
      // Anyone already booked is not overdue, whatever the calendar says.
      appointments: {
        where: { date: { gte: now }, status: AppointmentStatus.SCHEDULED },
        take: 1,
        select: { id: true },
      },
    },
  });
});

export async function getRecalls(): Promise<RecallRow[]> {
  return selectRecalls(await loadCandidates(), today());
}

/**
 * Who is overdue, out of the people the query returned — the whole of the recall
 * decision, with the database left outside.
 *
 * Split from `getRecalls` so it can be tested. Everything that makes this list
 * wrong is a date comparison or an off-by-one at a boundary: the day a recall
 * falls due, the day a cooldown lapses, the patient with no visits at all. None
 * of that needs Postgres to be interesting, and none of it was covered while the
 * only way in was an async function that opened a connection.
 */
export function selectRecalls(patients: PatientForRecall[], now: Date): RecallRow[] {
  const rows: RecallRow[] = [];
  for (const patient of patients) {
    // Opted out of being reminded that a check-up is due. Only this list.
    if (patient.recallMonths <= 0) continue;
    if (patient.appointments.length > 0) continue;
    if (patient.recallSnoozedUntil && patient.recallSnoozedUntil > now) continue;
    if (
      patient.lastRecallAt &&
      daysBetween(patient.lastRecallAt, now) < CONTACT_COOLDOWN_DAYS
    ) {
      continue;
    }

    // Never seen? Count from when they were entered, so a patient added and
    // never booked still surfaces instead of sitting invisible forever.
    const lastVisit = patient.visitRecords[0]?.visitDate ?? null;
    const reference = lastVisit ?? patient.createdAt;
    const dueDate = addMonths(reference, patient.recallMonths);
    if (dueDate > now) continue;

    rows.push({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      email: patient.email ?? '',
      lastVisit: lastVisit ? toDateKey(lastVisit) : null,
      monthsSince: monthsBetween(reference, now),
      overdueDays: daysBetween(dueDate, now),
      recallMonths: patient.recallMonths,
      contactConsent: patient.contactConsent,
    });
  }

  return rows.sort((a, b) => b.overdueDays - a.overdueDays);
}

export async function getFollowUps(): Promise<FollowUpRow[]> {
  return selectFollowUps(await loadCandidates(), today());
}

/** The follow-up decision, likewise without the database. See `selectRecalls`. */
export function selectFollowUps(patients: PatientForRecall[], now: Date): FollowUpRow[] {
  const rows: FollowUpRow[] = [];
  for (const patient of patients) {
    const visit = patient.visitRecords[0];
    if (!visit) continue;

    const daysSince = daysBetween(visit.visitDate, now);
    if (daysSince < FOLLOW_UP_FROM_DAYS || daysSince > FOLLOW_UP_TO_DAYS) continue;
    if (
      patient.lastRecallAt &&
      daysBetween(patient.lastRecallAt, now) < FOLLOW_UP_FROM_DAYS
    ) {
      continue;
    }

    rows.push({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      email: patient.email ?? '',
      lastVisit: toDateKey(visit.visitDate),
      daysSince,
      services: visit.servicesText,
      contactConsent: patient.contactConsent,
    });
  }

  return rows.sort((a, b) => a.daysSince - b.daysSince);
}
