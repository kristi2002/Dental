'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function saveService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  const data = {
    name,
    category: optionalString(formData.get('category')),
    durationMin: Math.max(5, toInt(formData.get('durationMin'), 30)),
  };

  try {
    if (id) {
      await prisma.service.update({ where: { id }, data });
    } else {
      await prisma.service.create({ data });
    }
  } catch {
    return actionError(t('generic'));
  }

  revalidateAll();
  return actionOk();
}

export async function deleteService(formData: FormData): Promise<void> {
  const id = requiredString(formData.get('id'));
  if (!id) return;

  await prisma.service.delete({ where: { id } });
  revalidateAll();
}
