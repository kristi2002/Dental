import {
  AppointmentStatus,
  TreatmentPlanStatus,
  TreatmentStepStatus,
} from '@/generated/prisma/enums';

/**
 * A plan is stalled once this long has passed with nothing done and nothing
 * booked. Two months is roughly the point at which a patient stops thinking of
 * themselves as mid-treatment.
 */
export const STALLED_DAYS = 60;

const MS_PER_DAY = 86_400_000;

/**
 * How far through a plan is.
 *
 * A skipped step is neither work done nor work outstanding, so it is out of the
 * denominator as well as the numerator: counted, a plan with nothing left to do
 * would read "4 of 5" for the rest of its life. A plan whose every step was
 * skipped has no work in it at all, which is 0% rather than a division by zero.
 */
export function planProgress(steps: readonly { status: TreatmentStepStatus }[]): {
  done: number;
  relevant: number;
  percent: number;
} {
  const done = steps.filter((step) => step.status === TreatmentStepStatus.DONE).length;
  const relevant = steps.filter((step) => step.status !== TreatmentStepStatus.SKIPPED).length;

  return { done, relevant, percent: relevant === 0 ? 0 : Math.round((done / relevant) * 100) };
}

/** A step as the stalled check needs to see it: its state and its slot. */
export type ScheduledStep = {
  status: TreatmentStepStatus;
  completedAt: Date | null;
  appointment: { date: Date; startTime: string; status: AppointmentStatus } | null;
};

/**
 * Whether a slot is still a promise: ahead of us, and not one the patient has
 * already cancelled or failed to turn up for.
 *
 * Named rather than inlined because two screens ask it of the same appointment —
 * the stalled check below, and the plan row deciding whether to print a date or
 * offer to book one — and a row that says "next Tuesday" about a plan the list
 * has already declared neglected is the disagreement nobody reports.
 */
export function isPromisedSlot(
  appointment: ScheduledStep['appointment'],
  now: Date,
): appointment is NonNullable<ScheduledStep['appointment']> {
  return (
    appointment !== null &&
    appointment.date >= now &&
    (appointment.status === AppointmentStatus.SCHEDULED ||
      appointment.status === AppointmentStatus.ARRIVED)
  );
}

/**
 * The soonest slot any outstanding step is booked into.
 *
 * A plan with one of these is not neglected however long it has been quiet — it
 * is waiting for a date that has not arrived. A cancelled or missed slot is no
 * such promise, which is why the appointment's own status is checked and not
 * just its date.
 */
export function nextBooking<T extends ScheduledStep>(steps: readonly T[], now: Date): T | null {
  return (
    steps
      .filter(
        (step) =>
          step.status === TreatmentStepStatus.PENDING && isPromisedSlot(step.appointment, now),
      )
      // Day first, then the clock — two steps booked into the same morning are
      // ordered by which one the patient sits down for first.
      .sort(
        (a, b) =>
          a.appointment!.date.getTime() - b.appointment!.date.getTime() ||
          a.appointment!.startTime.localeCompare(b.appointment!.startTime),
      )[0] ?? null
  );
}

/**
 * Everything the plan lists need to know about one plan, worked out once.
 *
 * This is the question the whole feature exists to answer — *what did we start
 * and never finish* — so it lives here rather than inside a page, where it could
 * not be tested and would drift from the copy of itself in the patient tab.
 */
export function summarisePlan<T extends ScheduledStep>(
  plan: {
    status: TreatmentPlanStatus;
    createdAt: Date;
    steps: readonly T[];
    /** The day somebody promised to ring back. See `chasePlan`. */
    followUpOn?: Date | null;
    lastContactedAt?: Date | null;
  },
  now: Date,
): {
  done: number;
  relevant: number;
  percent: number;
  next: T | null;
  quietDays: number;
  stalled: boolean;
  /** Parked until a promised day that has not arrived yet. */
  snoozed: boolean;
  followUpOn: Date | null;
  /** Days until the promised day; negative once it has gone by. */
  followUpDays: number | null;
} {
  const { done, relevant, percent } = planProgress(plan.steps);
  const next = nextBooking(plan.steps, now);

  // When something last actually happened. A plan created and never touched
  // counts from its own creation, so it cannot hide by having no history.
  const lastActivity = plan.steps.reduce<Date>(
    (latest, step) =>
      step.status === TreatmentStepStatus.DONE && step.completedAt && step.completedAt > latest
        ? step.completedAt
        : latest,
    plan.createdAt,
  );

  // Clamped at zero deliberately: `now` is the clinic's midnight while
  // `completedAt` and `createdAt` are real timestamps, so anything happening
  // today is in the future by up to a day — and "nothing done for -1 days" is
  // what a plan started this morning used to say.
  const quietDays = Math.max(
    0,
    Math.floor((now.getTime() - lastActivity.getTime()) / MS_PER_DAY),
  );

  // A promise to ring back on a given day, while that day is still ahead.
  //
  // This is the third state the list needed. Stalled asks "has anybody done
  // anything", and a phone call is not something anybody can do *to a plan* —
  // so a course of treatment chased this morning shouted exactly as loudly this
  // afternoon, and the only ways to quieten it were to tick off treatment
  // nobody gave or to cancel a plan the patient still means to finish. A parked
  // plan stays open, stays counted, and comes back by itself on the day it was
  // parked until.
  const followUpOn = plan.followUpOn ?? null;
  const followUpDays = followUpOn
    ? Math.round((followUpOn.getTime() - now.getTime()) / MS_PER_DAY)
    : null;
  const snoozed = followUpOn !== null && followUpOn > now;

  return {
    done,
    relevant,
    percent,
    next,
    quietDays,
    stalled:
      plan.status === TreatmentPlanStatus.ACTIVE &&
      !next &&
      !snoozed &&
      quietDays >= STALLED_DAYS,
    snoozed,
    followUpOn,
    followUpDays,
  };
}

/**
 * Worst first: stalled before merely open, then longest-quiet first. A list that
 * opens on the plan least likely to be chased is the point of having one.
 *
 * A plan parked until a day still ahead goes to the bottom whatever its quiet
 * count says — somebody has already dealt with it, and the promise they made is
 * the reason it is quiet. It sorts *below* an ordinary open plan rather than
 * merely below the stalled ones, because the one thing nobody needs to look at
 * today is the plan with a note saying "September".
 */
export function worstFirst(
  a: { stalled: boolean; quietDays: number; snoozed?: boolean },
  b: { stalled: boolean; quietDays: number; snoozed?: boolean },
): number {
  if (a.stalled !== b.stalled) return a.stalled ? -1 : 1;
  if (Boolean(a.snoozed) !== Boolean(b.snoozed)) return a.snoozed ? 1 : -1;
  return b.quietDays - a.quietDays;
}
