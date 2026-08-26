'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The list of laboratories, kept the way the procedures catalogue is kept.
 *
 * Its own module rather than more of `works.ts`, for the reason
 * `work-procedures.ts` gives: that file writes the register — records of what
 * happened — and this writes the short list the register's forms are filled in
 * from. Two different lifetimes.
 */

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Name a laboratory, or correct one.
 *
 * A rename reaches this row only. Every case already written keeps the spelling
 * it was written with — `WorkLine.lab` is the docket's own copy — because the
 * register records slips that have already left the building. What a rename
 * *does* change is every future line and everything that counts by row, which
 * is the entire reason the column beside the text exists.
 */
export async function saveLab(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('work.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  // Case-insensitively, because the whole point of the list is that one
  // laboratory is one entry — "DentalTech" beside "dentaltech" is precisely the
  // state this table replaced, and letting it back in through the form would
  // undo the migration a fortnight later.
  const clash = await prisma.lab.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) return actionError(t('categoryTaken'));

  const data = {
    name,
    phone: optionalString(formData.get('phone')),
    email: optionalString(formData.get('email')),
    notes: optionalString(formData.get('notes')),
  };

  try {
    if (id) await prisma.lab.update({ where: { id }, data });
    else await prisma.lab.create({ data });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'lab',
    entityId: id,
    summary: name,
  });

  revalidateAll();

  // Naming happens on a page of its own, so there is nowhere for the form to
  // return to — the same arrangement the procedures catalogue uses, and for the
  // same reason: the list is written in one sitting.
  if (!id) {
    const again = requiredString(formData.get('again')) === '1';
    redirect({ href: again ? '/works/labs/new' : '/works/labs', locale: await getLocale() });
  }

  return actionOk();
}

/**
 * Retire a laboratory, or bring it back.
 *
 * Archived rather than deleted, and this is the one place in the works module
 * where that distinction has teeth: the lines pointing at this row *are* the
 * register's record of what was sent where. Deleting it would set every one of
 * them back to a name with no number — quietly undoing the migration for that
 * laboratory — and take "how much went to them last quarter" with it.
 *
 * A retired laboratory leaves every picker and stays on every case.
 */
export async function setLabActive(formData: FormData): Promise<void> {
  const user = await authorize('work.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const active = requiredString(formData.get('active')) === '1';

  const lab = await prisma.lab.update({
    where: { id },
    data: { archivedAt: active ? null : new Date() },
    select: { name: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'lab',
    entityId: id,
    summary: `${lab.name} → ${active ? 'active' : 'retired'}`,
  });
  revalidateAll();
}
