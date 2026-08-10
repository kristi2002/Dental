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

/**
 * Materials arrive as repeated `material` fields shaped `itemId:quantity`, which
 * keeps the bill of materials inside the same plain form as the rest.
 */
function parseMaterials(formData: FormData): Array<{ itemId: string; quantity: number }> {
  const seen = new Map<string, number>();

  for (const raw of formData.getAll('material')) {
    if (typeof raw !== 'string') continue;
    const [itemId, rawQuantity] = raw.split(':');
    const quantity = Number.parseInt(rawQuantity ?? '', 10);
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) continue;
    seen.set(itemId, Math.min(999, quantity));
  }

  return [...seen].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export async function saveService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('service.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  const data = {
    name,
    category: optionalString(formData.get('category')),
    durationMin: Math.max(5, toInt(formData.get('durationMin'), 30)),
  };
  const materials = parseMaterials(formData);

  let savedId = id;
  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        await tx.service.update({ where: { id }, data });
      } else {
        savedId = (await tx.service.create({ data, select: { id: true } })).id;
      }

      // Replace wholesale — the form always submits the complete list.
      await tx.serviceMaterial.deleteMany({ where: { serviceId: savedId! } });
      if (materials.length > 0) {
        await tx.serviceMaterial.createMany({
          data: materials.map((material) => ({ ...material, serviceId: savedId! })),
        });
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'service',
    entityId: savedId,
    summary: name,
  });

  revalidateAll();
  return actionOk();
}

export async function deleteService(formData: FormData): Promise<void> {
  const user = await authorize('service.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const service = await prisma.service.findUnique({ where: { id }, select: { name: true } });
  if (!service) return;

  await prisma.service.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'service',
    entityId: id,
    summary: service.name,
  });
  revalidateAll();
}
