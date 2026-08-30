import { ContactPurpose } from '@/generated/prisma/enums';
import { addMonths, today, toDateKey } from '@/lib/dates';
import { ACTIVE_PATIENTS } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import { OCCUPIES_A_SLOT } from '@/lib/scheduling';

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

/**
 * The purposes that count as "we have already chased this person".
 *
 * Both lists are worked from the same `RecallCard`, and every message it opens —
 * on either list — is logged as `RECALL`. `FOLLOW_UP` is included so that a card
 * given its own purpose later starts suppressing rather than silently not.
 *
 * `REMINDER` and `CONFIRMATION` are deliberately out. Those are about one booked
 * slot, not about coming back at all, and anybody who has one is already off the
 * recall list for having an appointment.
 */
const CHASE_PURPOSES = [ContactPurpose.RECALL, ContactPurpose.FOLLOW_UP] as const;

/** A follow-up is worth making in this window after treatment, and not later. */
const FOLLOW_UP_FROM_DAYS = 2;
const FOLLOW_UP_TO_DAYS = 7;

export type RecallRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** The patient's own language, or null when nobody has asked. */
  locale: string | null;
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
  /** The patient's own language, or null when nobody has asked. */
  locale: string | null;
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
  /** The patient's own language, or null when nobody has asked. */
  locale: string | null;
  createdAt: Date;
  recallMonths: number;
  recallSnoozedUntil: Date | null;
  /** The manual tick — `markRecallContacted` and nothing else writes it. */
  lastRecallAt: Date | null;
  /**
   * The newest chase in the contact log, or an empty list. At most one row.
   *
   * The other half of the same memory. Opening a WhatsApp or an email from the
   * recall card writes a `Contact`; pressing **Contacted** stamps
   * `lastRecallAt`. Neither wrote the other, and the cooldown read only the
   * second — so messaging somebody from this list left them on it, and the list
   * asked the practice to ring them again tomorrow.
   */
  contacts: Array<{ createdAt: Date }>;
  contactConsent: boolean | null;
  visitRecords: Array<{ visitDate: Date; servicesText: string }>;
  appointments: Array<{ id: string }>;
};

/**
 * When this patient was last chased, by either route.
 *
 * Derived rather than reconciled: neither memory is made to write the other, so
 * neither can drift from it. `lastRecallAt` stays as the honest record of
 * somebody pressing the button, and the contact log stays as the honest record
 * of a message being put in front of the patient — the cooldown simply wants
 * whichever happened last.
 */
export function lastChasedAt(
  patient: Pick<PatientForRecall, 'lastRecallAt' | 'contacts'>,
): Date | null {
  const logged = patient.contacts[0]?.createdAt ?? null;
  if (!patient.lastRecallAt) return logged;
  if (!logged) return patient.lastRecallAt;
  return logged > patient.lastRecallAt ? logged : patient.lastRecallAt;
}

/**
 * Everything either list needs about one patient.
 *
 * A function of `now` rather than a constant, because one of the relations is
 * itself dated — and named once so the two queries below cannot come back with
 * differently shaped rows.
 */
function candidateSelect(now: Date) {
  return {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    // Which language they read in — and, through `diallingCodeFor`, which
    // country their number is assumed to be in when they wrote it without a
    // code. See `lib/reminders.ts`.
    locale: true,
    createdAt: true,
    recallMonths: true,
    recallSnoozedUntil: true,
    lastRecallAt: true,
    contactConsent: true,
    visitRecords: {
      orderBy: { visitDate: 'desc' as const },
      take: 1,
      // The sentence, not the rows: the follow-up message quotes it back to the
      // patient in their own words — "how is the upper left filling?"
      select: { visitDate: true, servicesText: true },
    },
    // The other memory of "we already rang them" — see `lastChasedAt`.
    contacts: {
      where: { purpose: { in: [...CHASE_PURPOSES] } },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: { createdAt: true },
    },
    // Anyone already booked is not overdue, whatever the calendar says.
    //
    // `OCCUPIES_A_SLOT` rather than a bare `SCHEDULED`, which is what this read
    // used to spell by hand — and it was the fourth such array, after the three
    // `scheduling.ts` gathered into this constant. Omitting `ARRIVED` meant a
    // patient stopped counting as booked at the exact moment the front desk
    // confirmed they were in the building, so an overdue patient could surface
    // on this list while sitting in the chair.
    appointments: {
      where: { date: { gte: now }, status: { in: [...OCCUPIES_A_SLOT] } },
      take: 1,
      select: { id: true },
    },
  };
}

/** Days to milliseconds, for the two windows below. */
const DAY_MS = 86_400_000;

/**
 * Who might be due for a check-up.
 *
 * This and the follow-up list used to be **one** query: every active patient,
 * with three relations each, filtered down in JavaScript afterwards. On the
 * dashboard — the screen everybody opens first every morning, which asks for it
 * in the same `Promise.all` as fifteen other things. The patients list was paged
 * in the Phase 11 work and this was missed; it was the last unbounded read on
 * that page.
 *
 * Splitting it also removes a hazard the shared query's own comment warned
 * about. `recallMonths: 0` could not be pushed down while one query fed both
 * lists, because opting out of "your six months are up" is not opting out of the
 * clinical courtesy call two days after an extraction — filtering it in the
 * shared query had silently applied one answer to both questions once already.
 * With two queries, each gate goes where it belongs.
 *
 * Every clause here is **exact**: it excludes only rows `selectRecalls` would
 * have excluded anyway, so the two cannot disagree. What stays in JavaScript is
 * the one thing SQL cannot express per row — the due date, which is
 * `recallMonths` months after a reference that is itself either the newest visit
 * or the day the patient was entered.
 */
async function loadRecallCandidates(now: Date): Promise<PatientForRecall[]> {
  const cooldownFrom = new Date(now.getTime() - CONTACT_COOLDOWN_DAYS * DAY_MS);

  return prisma.patient.findMany({
    where: {
      // Archiving is the one exclusion both lists share: chasing somebody who
      // has been filed away is exactly the call that makes either list stop
      // being trusted.
      ...ACTIVE_PATIENTS,
      // Their own answer to "do you want reminding at all".
      recallMonths: { gt: 0 },
      // Anyone already booked is not overdue, whatever the calendar says.
      appointments: {
        none: { date: { gte: now }, status: { in: [...OCCUPIES_A_SLOT] } },
      },
      AND: [
        // A snooze that has not run out. Written as an `OR` rather than
        // `{ lte: now }`, because SQL cannot say a null is less than anything —
        // the same null trap `NOT_CLINIC_CANCELLED` exists for, and here it
        // would have dropped every patient nobody has ever snoozed, which in a
        // real practice is very nearly all of them.
        { OR: [{ recallSnoozedUntil: null }, { recallSnoozedUntil: { lte: now } }] },
        // Both halves of `lastChasedAt`, pushed down: a patient survives only if
        // *neither* memory is recent. Same null branch, same reason.
        { OR: [{ lastRecallAt: null }, { lastRecallAt: { lt: cooldownFrom } }] },
        {
          contacts: {
            none: {
              purpose: { in: [...CHASE_PURPOSES] },
              createdAt: { gte: cooldownFrom },
            },
          },
        },
      ],
    },
    select: candidateSelect(now),
  });
}

/**
 * Who was treated in the last few days.
 *
 * The half that gains most from the split. The window is two to seven days, so
 * this is a handful of rows in any practice and used to be the whole table.
 *
 * The bounds are derived from the same two constants `selectFollowUps` reads,
 * because the query must never be *narrower* than the rule: a patient this drops
 * is a patient the practice never rings, and nothing downstream could notice.
 * That is the invariant `workScope` states for the register, and it holds here
 * for the same reason.
 */
async function loadFollowUpCandidates(now: Date): Promise<PatientForRecall[]> {
  return prisma.patient.findMany({
    where: {
      ...ACTIVE_PATIENTS,
      visitRecords: {
        some: {
          visitDate: {
            gte: new Date(now.getTime() - FOLLOW_UP_TO_DAYS * DAY_MS),
            lte: new Date(now.getTime() - FOLLOW_UP_FROM_DAYS * DAY_MS),
          },
        },
      },
    },
    select: candidateSelect(now),
  });
}

export async function getRecalls(): Promise<RecallRow[]> {
  const now = today();
  return selectRecalls(await loadRecallCandidates(now), now);
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

    const chased = lastChasedAt(patient);
    if (chased && daysBetween(chased, now) < CONTACT_COOLDOWN_DAYS) continue;

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
      locale: patient.locale,
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
  const now = today();
  return selectFollowUps(await loadFollowUpCandidates(now), now);
}

/** The follow-up decision, likewise without the database. See `selectRecalls`. */
export function selectFollowUps(patients: PatientForRecall[], now: Date): FollowUpRow[] {
  const rows: FollowUpRow[] = [];
  for (const patient of patients) {
    const visit = patient.visitRecords[0];
    if (!visit) continue;

    const daysSince = daysBetween(visit.visitDate, now);
    if (daysSince < FOLLOW_UP_FROM_DAYS || daysSince > FOLLOW_UP_TO_DAYS) continue;

    const chased = lastChasedAt(patient);
    if (chased && daysBetween(chased, now) < FOLLOW_UP_FROM_DAYS) continue;

    rows.push({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      locale: patient.locale,
      email: patient.email ?? '',
      lastVisit: toDateKey(visit.visitDate),
      daysSince,
      services: visit.servicesText,
      contactConsent: patient.contactConsent,
    });
  }

  return rows.sort((a, b) => a.daysSince - b.daysSince);
}
