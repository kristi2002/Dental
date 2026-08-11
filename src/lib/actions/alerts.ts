'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { AlertSeverity, MedicalAlertKind } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

function toKind(value: string): MedicalAlertKind {
  return value in MedicalAlertKind
    ? (value as MedicalAlertKind)
    : MedicalAlertKind.OTHER;
}

function toSeverity(value: string): AlertSeverity {
  return value in AlertSeverity ? (value as AlertSeverity) : AlertSeverity.IMPORTANT;
}

export async function saveAlert(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('patient.medical.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const patientId = requiredString(formData.get('patientId'));
  const kind = toKind(requiredString(formData.get('kind')));
  if (!patientId) return actionError(t('fillRequired'));

  const substance = optionalString(formData.get('substance'));
  // Naming the substance is the whole point of an allergy row — without it the
  // prescription check has nothing to match against.
  if (kind === MedicalAlertKind.ALLERGY && !substance) {
    return actionError(t('substanceRequired'));
  }

  const data = {
    patientId,
    kind,
    substance,
    severity: toSeverity(requiredString(formData.get('severity'))),
    notes: optionalString(formData.get('notes')),
  };

  try {
    if (id) {
      await prisma.patientAlert.update({ where: { id }, data });
    } else {
      await prisma.patientAlert.create({ data: { ...data, createdById: user.id } });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'alert',
    entityId: id ?? patientId,
    summary: `${kind}${substance ? ` · ${substance}` : ''}`,
  });

  revalidateAll();
  return actionOk();
}

export async function deleteAlert(formData: FormData): Promise<void> {
  const user = await authorize('patient.medical.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const alert = await prisma.patientAlert.findUnique({ where: { id } });
  if (!alert) return;

  await prisma.patientAlert.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'alert',
    entityId: id,
    summary: `${alert.kind}${alert.substance ? ` · ${alert.substance}` : ''}`,
  });
  revalidateAll();
}
