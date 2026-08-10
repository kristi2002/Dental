'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function saveStockItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  const quantity = Math.max(0, toInt(formData.get('quantity'), 0));
  const data = {
    name,
    category: optionalString(formData.get('category')),
    quantity,
    minLimit: Math.max(0, toInt(formData.get('minLimit'), 5)),
    unit: requiredString(formData.get('unit')) || 'pcs',
  };

  try {
    if (id) {
      const existing = await prisma.stockItem.findUnique({ where: { id } });
      if (!existing) return actionError(t('notFound'));

      await prisma.$transaction(async (tx) => {
        await tx.stockItem.update({ where: { id }, data });
        const delta = quantity - existing.quantity;
        if (delta !== 0) {
          await tx.stockMovement.create({ data: { itemId: id, delta, reason: 'manual' } });
        }
      });
    } else {
      await prisma.stockItem.create({ data });
    }
  } catch {
    return actionError(t('generic'));
  }

  revalidateAll();
  return actionOk();
}

/**
 * The one-tap +1 / −1 buttons on the stock page. Quantity never goes below zero,
 * and the movement is logged so the statistics page can show real consumption.
 */
export async function adjustStock(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  const delta = toInt(formData.get('delta'), 0);
  if (!id || delta === 0) return;

  const item = await prisma.stockItem.findUnique({ where: { id } });
  if (!item) return;

  const nextQuantity = Math.max(0, item.quantity + delta);
  const appliedDelta = nextQuantity - item.quantity;
  if (appliedDelta === 0) return;

  await prisma.$transaction([
    prisma.stockItem.update({ where: { id }, data: { quantity: nextQuantity } }),
    prisma.stockMovement.create({
      data: { itemId: id, delta: appliedDelta, reason: appliedDelta < 0 ? 'used' : 'restock' },
    }),
  ]);

  revalidateAll();
}

export async function deleteStockItem(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  if (!id) return;

  await prisma.stockItem.delete({ where: { id } });
  revalidateAll();
}
