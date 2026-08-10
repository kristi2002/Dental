'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function savePrescriptionTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('prescription.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  const body = requiredString(formData.get('body'));
  if (!name || !body) return actionError(t('fillRequired'));

  const data = { name, body, category: optionalString(formData.get('category')) };

  let savedId = id;
  try {
    if (id) {
      await prisma.prescriptionTemplate.update({ where: { id }, data });
    } else {
      savedId = (await prisma.prescriptionTemplate.create({ data, select: { id: true } })).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'prescription',
    entityId: savedId,
    summary: name,
  });

  revalidateAll();
  return actionOk();
}

export async function deletePrescriptionTemplate(formData: FormData): Promise<void> {
  const user = await authorize('prescription.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const template = await prisma.prescriptionTemplate.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!template) return;

  // Issued prescriptions keep their own copy of the text, so removing a template
  // cannot rewrite what a patient was actually given.
  await prisma.prescriptionTemplate.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'prescription',
    entityId: id,
    summary: template.name,
  });
  revalidateAll();
}

/**
 * Issue a prescription to a patient. The final wording is stored verbatim —
 * a template is a starting point, and what the patient received must stay
 * exactly what the patient received.
 */
export async function issuePrescription(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('prescription.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const body = requiredString(formData.get('body'));
  if (!patientId || !body) return actionError(t('fillRequired'));

  const templateId = optionalString(formData.get('templateId'));

  let issuedId: string;
  try {
    issuedId = (
      await prisma.prescription.create({
        data: { patientId, body, templateId, issuedById: user.id },
        select: { id: true },
      })
    ).id;
  } catch {
    return actionError(t('generic'));
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'create',
    entity: 'prescription',
    entityId: issuedId,
    summary: patient ? `${patient.firstName} ${patient.lastName}` : patientId,
  });

  revalidateAll();
  return actionOk();
}

export async function deletePrescription(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    select: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (!prescription) return;

  await prisma.prescription.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'prescription',
    entityId: id,
    summary: `${prescription.patient.firstName} ${prescription.patient.lastName}`,
  });
  revalidateAll();
}
