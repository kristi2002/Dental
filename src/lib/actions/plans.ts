'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { syncPlanStatus } from '@/lib/plan-progress';
import { prisma } from '@/lib/prisma';
import { isValidTooth } from '@/lib/teeth';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

function toPlanStatus(value: string): TreatmentPlanStatus {
  return value in TreatmentPlanStatus
    ? (value as TreatmentPlanStatus)
    : TreatmentPlanStatus.ACTIVE;
}

function toStepStatus(value: string): TreatmentStepStatus {
  return value in TreatmentStepStatus
    ? (value as TreatmentStepStatus)
    : TreatmentStepStatus.PENDING;
}

/**
 * An FDI tooth, or null for work that is not about one specific tooth.
 *
 * Set membership, not a range: FDI is not contiguous — 19 and 29 are not teeth,
 * and 33–48 sit above the old Universal ceiling of 32. Validating `1..32` here
 * silently dropped every step written for a lower-left or lower-right tooth,
 * and accepted numbers that mean a different tooth to the chart than to whoever
 * typed them.
 */
function toToothNum(value: FormDataEntryValue | null): number | null {
  const parsed = toInt(value, 0);
  return isValidTooth(parsed) ? parsed : null;
}

/**
 * The opening steps a new plan is created with, as posted by the builder.
 *
 * Anything malformed is dropped rather than guessed at, and the list is capped:
 * a plan is a course of treatment, not an import format, and thirty steps is
 * already more than any real one has.
 */
function parseDraftSteps(raw: string): Array<{ title: string; toothNum: number | null }> {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const steps: Array<{ title: string; toothNum: number | null }> = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { title, toothNum } = entry as { title?: unknown; toothNum?: unknown };
    if (typeof title !== 'string') continue;

    const clean = title.trim().slice(0, 180);
    if (!clean) continue;

    steps.push({
      title: clean,
      toothNum: typeof toothNum === 'number' && isValidTooth(toothNum) ? toothNum : null,
    });
    if (steps.length === 30) break;
  }
  return steps;
}

export async function savePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const patientId = requiredString(formData.get('patientId'));
  const title = requiredString(formData.get('title'));
  if (!patientId || !title) return actionError(t('fillRequired'));

  const data = {
    title,
    notes: optionalString(formData.get('notes')),
    status: toPlanStatus(requiredString(formData.get('status'))),
  };

  // A brand-new plan is built in one go, so the dialog posts its whole opening
  // sequence rather than making the dentist save and then add steps one dialog
  // at a time. Each carries its tooth, which is the half the old
  // newline-separated list could not express at all.
  const initialSteps = parseDraftSteps(requiredString(formData.get('steps')));

  let savedId = id;
  try {
    if (id) {
      await prisma.treatmentPlan.update({ where: { id }, data });
    } else {
      savedId = (
        await prisma.treatmentPlan.create({
          data: {
            ...data,
            patientId,
            steps: {
              create: initialSteps.map((step, index) => ({
                position: index + 1,
                title: step.title,
                toothNum: step.toothNum,
              })),
            },
          },
          select: { id: true },
        })
      ).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'plan',
    entityId: savedId,
    summary: title,
  });

  revalidateAll();
  return actionOk();
}

export async function deletePlan(formData: FormData): Promise<void> {
  // Deleting a course of treatment is a records decision, not a scheduling one.
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!plan) return;

  await prisma.treatmentPlan.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'plan',
    entityId: id,
    summary: plan.title,
  });
  revalidateAll();
}

export async function saveStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const planId = requiredString(formData.get('planId'));
  const title = requiredString(formData.get('title'));
  if (!planId || !title) return actionError(t('fillRequired'));

  const data = {
    title,
    toothNum: toToothNum(formData.get('toothNum')),
    notes: optionalString(formData.get('notes')),
  };

  try {
    if (id) {
      await prisma.treatmentStep.update({ where: { id }, data });
    } else {
      const last = await prisma.treatmentStep.findFirst({
        where: { planId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      await prisma.treatmentStep.create({
        data: { ...data, planId, position: (last?.position ?? 0) + 1 },
      });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'plan',
    entityId: planId,
    summary: title,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Tick a step off, or put it back. Completing the last outstanding step closes
 * the plan, because a plan whose steps are all done is a finished plan and
 * nobody should have to say so twice.
 */
export async function setStepStatus(formData: FormData): Promise<void> {
  const user = await authorize('plan.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const status = toStepStatus(requiredString(formData.get('status')));
  if (!id) return;

  const step = await prisma.treatmentStep.update({
    where: { id },
    data: {
      status,
      completedAt: status === TreatmentStepStatus.DONE ? new Date() : null,
    },
    select: { title: true, planId: true },
  });

  await syncPlanStatus(step.planId);

  await recordAudit(user, {
    action: 'update',
    entity: 'plan',
    entityId: step.planId,
    summary: `${step.title} → ${status}`,
  });
  revalidateAll();
}

export async function deleteStep(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  if (!id) return;

  const step = await prisma.treatmentStep.findUnique({
    where: { id },
    select: { title: true, planId: true, status: true },
  });
  if (!step) return;

  // A pending step is a plan; a completed one is a record of care. Removing the
  // second needs the same authority as deleting any other record.
  const permission =
    step.status === TreatmentStepStatus.DONE ? 'patient.delete' : 'plan.edit';
  const user = await authorize(permission);
  if (!user) return;

  await prisma.treatmentStep.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'plan',
    entityId: step.planId,
    summary: step.title,
  });
  revalidateAll();
}

/** Swap a step with its neighbour, so the sequence can be corrected in place. */
export async function moveStep(formData: FormData): Promise<void> {
  const user = await authorize('plan.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const direction = requiredString(formData.get('direction')) === 'up' ? 'up' : 'down';
  if (!id) return;

  const step = await prisma.treatmentStep.findUnique({
    where: { id },
    select: { id: true, planId: true, position: true },
  });
  if (!step) return;

  const neighbour = await prisma.treatmentStep.findFirst({
    where: {
      planId: step.planId,
      position: direction === 'up' ? { lt: step.position } : { gt: step.position },
    },
    orderBy: { position: direction === 'up' ? 'desc' : 'asc' },
    select: { id: true, position: true },
  });
  if (!neighbour) return;

  await prisma.$transaction([
    prisma.treatmentStep.update({ where: { id: step.id }, data: { position: neighbour.position } }),
    prisma.treatmentStep.update({ where: { id: neighbour.id }, data: { position: step.position } }),
  ]);

  revalidateAll();
}
