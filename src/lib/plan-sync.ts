import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

/**
 * The writes that keep a plan and its steps agreeing with each other.
 *
 * Split from `plan-progress.ts` because that module answers "how far along is
 * this" from data already loaded, and both the plan list in the browser and the
 * tests need those answers — neither should have to pull a database client in to
 * get them.
 */

/**
 * Keeping a plan's own status honest about its steps.
 *
 * A plan is not a thing anybody sets by hand — it is finished when there is
 * nothing left to do and open again the moment something is reopened. Every
 * caller that can add, remove or restate a step goes through here so the two can
 * never drift apart.
 *
 * Cancelled is the exception, and the only one: it is a judgement the steps
 * cannot make — the patient moved away, or had the work done elsewhere — so it
 * is the one status this function is not allowed to overwrite. Without that
 * guard, ticking off a step that was finished *before* the plan was abandoned
 * would quietly put it back on the practice's list of things to chase.
 */
export async function syncPlanStatus(planId: string): Promise<void> {
  const plan = await prisma.treatmentPlan.findUnique({
    where: { id: planId },
    select: { status: true, _count: { select: { steps: true } } },
  });
  if (!plan || plan.status === TreatmentPlanStatus.CANCELLED) return;

  // A plan with no steps at all is empty, not finished. "Nothing outstanding"
  // is true of both, and reading it as *done* files a course of treatment
  // somebody has only just started writing — or one whose steps were all
  // deleted to be rewritten — straight into the archive, where it is not
  // looked for. The steps decide the status; with no steps there is nothing
  // to decide it, so whatever it already says stands.
  if (plan._count.steps === 0) return;

  const outstanding = await prisma.treatmentStep.count({
    where: { planId, status: TreatmentStepStatus.PENDING },
  });
  const status =
    outstanding === 0 ? TreatmentPlanStatus.COMPLETED : TreatmentPlanStatus.ACTIVE;

  // Nothing to say, so nothing is written: the finished list is ordered by
  // `updatedAt`, and a no-op write would push a plan back to the top of it
  // every time anybody touched a step on it.
  if (status === plan.status) return;

  await prisma.treatmentPlan.update({ where: { id: planId }, data: { status } });
}

/**
 * Tick off whatever plan step this appointment was booked for.
 *
 * `TreatmentStep.appointmentId` is the link made at booking time, and it is the
 * whole reason the link exists: a step booked into the diary and then treated is
 * a step that happened, and asking somebody to say so a second time on another
 * screen is how "3 of 5 done" quietly stops being true.
 *
 * Deliberately silent when there is no link, and deliberately one-way — an
 * appointment moving back out of COMPLETED does not un-tick the step, because
 * the treatment was still given.
 *
 * Returns what was ticked, so the caller can write the audit line in its own
 * voice, or null when this appointment was not booked for a step.
 */
export async function completeStepForAppointment(
  appointmentId: string,
): Promise<{ title: string; planId: string } | null> {
  const step = await prisma.treatmentStep.findUnique({
    where: { appointmentId },
    select: { id: true, title: true, planId: true, status: true },
  });
  if (!step || step.status !== TreatmentStepStatus.PENDING) return null;

  await prisma.treatmentStep.update({
    where: { id: step.id },
    data: { status: TreatmentStepStatus.DONE, completedAt: new Date() },
  });
  await syncPlanStatus(step.planId);

  return { title: step.title, planId: step.planId };
}
