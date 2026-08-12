'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function saveWaitlistEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('waitlist.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  if (!patientId) return actionError(t('fillRequired'));

  const entry = await prisma.waitlistEntry.create({
    data: {
      patientId,
      // The id to match against the catalogue, the name to show on the row.
      serviceId: optionalString(formData.get('serviceId')),
      serviceName: optionalString(formData.get('serviceName')),
      durationMin: Math.max(5, toInt(formData.get('durationMin'), 30)),
      note: optionalString(formData.get('note')),
      urgent: requiredString(formData.get('urgent')) === '1',
    },
    select: { id: true, patient: { select: { firstName: true, lastName: true } } },
  });

  await recordAudit(user, {
    action: 'create',
    entity: 'waitlist',
    entityId: entry.id,
    summary: `${entry.patient.firstName} ${entry.patient.lastName}`,
  });

  revalidateAll();
  return actionOk();
}

/** Booked, or no longer wanted — either way it leaves the list. */
export async function resolveWaitlistEntry(formData: FormData): Promise<void> {
  const user = await authorize('waitlist.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const entry = await prisma.waitlistEntry.update({
    where: { id },
    data: { resolvedAt: new Date() },
    select: { patient: { select: { firstName: true, lastName: true } } },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'waitlist',
    entityId: id,
    summary: `${entry.patient.firstName} ${entry.patient.lastName} · resolved`,
  });
  revalidateAll();
}
