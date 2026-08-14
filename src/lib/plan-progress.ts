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
 * The soonest slot any outstanding step is booked into.
 *
 * A plan with one of these is not neglected however long it has been quiet — it
 * is waiting for a date that has not arrived. A cancelled or missed slot is no
 * such promise, which is why the appointment's own status is checked here and
 * not just its date.
 */
export function nextBooking<T extends ScheduledStep>(steps: readonly T[], now: Date): T | null {
  return (
    steps
      .filter(
        (step) =>
          step.status === TreatmentStepStatus.PENDING &&
          step.appointment !== null &&
          step.appointment.date >= now &&
          (step.appointment.status === AppointmentStatus.SCHEDULED ||
            step.appointment.status === AppointmentStatus.ARRIVED),
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
  plan: { status: TreatmentPlanStatus; createdAt: Date; steps: readonly T[] },
  now: Date,
): {
  done: number;
  relevant: number;
  percent: number;
  next: T | null;
  quietDays: number;
  stalled: boolean;
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

  return {
    done,
    relevant,
    percent,
    next,
    quietDays,
    stalled: plan.status === TreatmentPlanStatus.ACTIVE && !next && quietDays >= STALLED_DAYS,
  };
}

/**
 * Worst first: stalled before merely open, then longest-quiet first. A list that
 * opens on the plan least likely to be chased is the point of having one.
 */
export function worstFirst(
  a: { stalled: boolean; quietDays: number },
  b: { stalled: boolean; quietDays: number },
): number {
  if (a.stalled !== b.stalled) return a.stalled ? -1 : 1;
  return b.quietDays - a.quietDays;
}
