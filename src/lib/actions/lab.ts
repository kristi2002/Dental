'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { LabCaseStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

function toStatus(value: string): LabCaseStatus {
  return value in LabCaseStatus ? (value as LabCaseStatus) : LabCaseStatus.SENT;
}

/** `YYYY-MM-DD` → UTC midnight, matching every other calendar day in the app. */
function toDay(value: string | null): Date | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function saveLabCase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const patientId = requiredString(formData.get('patientId'));
  const labName = requiredString(formData.get('labName'));
  const kind = requiredString(formData.get('kind'));
  if (!patientId || !labName || !kind) return actionError(t('fillRequired'));

  const sentAt = toDay(optionalString(formData.get('sentAt')));
  const dueAt = toDay(optionalString(formData.get('dueAt')));
  if (sentAt && dueAt && dueAt < sentAt) return actionError(t('rangeBackwards'));

  const status = toStatus(requiredString(formData.get('status')));

  const data = {
    patientId,
    labName,
    kind,
    teeth: optionalString(formData.get('teeth')),
    notes: optionalString(formData.get('notes')),
    status,
    ...(sentAt ? { sentAt } : {}),
    dueAt,
    // "Received" without a date is the common case — the box is on the desk.
    // Stamping it here means the waiting-on list empties on the same click.
    receivedAt:
      status === LabCaseStatus.RECEIVED || status === LabCaseStatus.FITTED
        ? (toDay(optionalString(formData.get('receivedAt'))) ?? new Date())
        : null,
  };

  try {
    if (id) {
      await prisma.labCase.update({ where: { id }, data });
    } else {
      await prisma.labCase.create({ data: { ...data, createdById: user.id } });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'lab',
    entityId: id ?? patientId,
    summary: `${kind} · ${labName} → ${status}`,
  });

  revalidateAll();
  return actionOk();
}

/** One-tap "it came back", from the waiting-on list. */
export async function markLabCaseReceived(formData: FormData): Promise<void> {
  const user = await authorize('plan.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const labCase = await prisma.labCase.update({
    where: { id },
    data: { status: LabCaseStatus.RECEIVED, receivedAt: new Date() },
    select: { kind: true, labName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'lab',
    entityId: id,
    summary: `${labCase.kind} · ${labCase.labName} → RECEIVED`,
  });
  revalidateAll();
}

export async function deleteLabCase(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const labCase = await prisma.labCase.findUnique({
    where: { id },
    select: { kind: true, labName: true },
  });
  if (!labCase) return;

  await prisma.labCase.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'lab',
    entityId: id,
    summary: `${labCase.kind} · ${labCase.labName}`,
  });
  revalidateAll();
}
