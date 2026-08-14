'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { parseDraftLines } from '@/lib/works';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Write a row of the works register, with its lines.
 *
 * The lines are replaced wholesale on every save — the form always posts the
 * complete case, so a removed row has to disappear rather than linger.
 */
export async function saveWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('work.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const patientName = requiredString(formData.get('patientName'));
  const phone = requiredString(formData.get('phone'));
  if (!patientName || !phone) return actionError(t('fillRequired'));

  // The link is optional and is only ever a link: the name and the number are
  // taken from the form either way, so correcting a typo on this row does not
  // reach into the patient's record, and vice versa. See `Work.patientName`.
  const patientId = optionalString(formData.get('patientId'));
  const patient = patientId
    ? await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
    : null;

  const data = {
    labSerial: optionalString(formData.get('labSerial')),
    patientId: patient?.id ?? null,
    patientName,
    phone,
    diagnosis: optionalString(formData.get('diagnosis')),
    notes: optionalString(formData.get('notes')),
  };

  const lines = parseDraftLines(requiredString(formData.get('lines')));

  let savedId = id;
  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        await tx.work.update({ where: { id }, data });
      } else {
        // `number` is not set here on purpose — the column is a sequence, so two
        // people saving at once cannot be handed the same one. See `Work.number`.
        savedId = (await tx.work.create({ data, select: { id: true } })).id;
      }

      await tx.workLine.deleteMany({ where: { workId: savedId! } });
      if (lines.length > 0) {
        await tx.workLine.createMany({
          data: lines.map((line, index) => ({
            workId: savedId!,
            position: index + 1,
            elements: line.elements,
            procedure: line.procedure,
            lab: line.lab || null,
          })),
        });
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'work',
    entityId: savedId,
    summary: patientName,
  });

  revalidateAll();

  // A new case is written on a page of its own, and the register is both what
  // the person came here to add to and where the row now is. An edit is
  // submitted from a dialog on that register, so it stays put.
  if (!id) {
    redirect({ href: '/works', locale: await getLocale() });
  }

  return actionOk();
}

export async function deleteWork(formData: FormData): Promise<void> {
  const user = await authorize('work.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const work = await prisma.work.findUnique({
    where: { id },
    select: { number: true, patientName: true },
  });
  if (!work) return;

  await prisma.work.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'work',
    entityId: id,
    summary: `#${work.number} ${work.patientName}`,
  });
  revalidateAll();
}
