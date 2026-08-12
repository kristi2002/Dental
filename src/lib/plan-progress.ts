import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

/**
 * Keeping a plan's own status honest about its steps.
 *
 * A plan is not a thing anybody sets by hand — it is finished when there is
 * nothing left to do and open again the moment something is reopened. Both
 * callers that can change a step's status go through here so the two can never
 * drift apart.
 */
export async function syncPlanStatus(planId: string): Promise<void> {
  const outstanding = await prisma.treatmentStep.count({
    where: { planId, status: TreatmentStepStatus.PENDING },
  });

  await prisma.treatmentPlan.update({
    where: { id: planId },
    data: {
      status: outstanding === 0 ? TreatmentPlanStatus.COMPLETED : TreatmentPlanStatus.ACTIVE,
    },
  });
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
