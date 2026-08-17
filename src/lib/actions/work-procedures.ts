'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The catalogue of work the practice sends to a laboratory.
 *
 * Its own module rather than more of `works.ts`: that file writes the register —
 * the cases, which are records of what happened — and this writes the short list
 * the register's forms are filled in *from*. Two different lifetimes and two
 * different permissions' worth of reasoning, even though both happen to need
 * `work.edit`.
 */

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Name a kind of work, or correct a name.
 *
 * A rename reaches the catalogue only. The cases already written keep the words
 * they were written with — see the note on `WorkLine.procedure` — because the
 * register is a copy of dockets that have already gone out, and correcting
 * today's spelling must not rewrite March.
 */
export async function saveWorkProcedure(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('work.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  // The whole point of the list is that one kind of work is one entry, so the
  // clash is checked case-insensitively: "Zirkon" beside "zirkon" is the state
  // this replaced.
  const clash = await prisma.workProcedure.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) return actionError(t('categoryTaken'));

  try {
    if (id) await prisma.workProcedure.update({ where: { id }, data: { name } });
    else await prisma.workProcedure.create({ data: { name } });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'workProcedure',
    entityId: id,
    summary: name,
  });

  revalidateAll();

  // Naming happens on a page of its own, so there is nowhere for the form to
  // return to. The list is named in one sitting — a practice sends out six or
  // eight kinds of work — so "save and add another" comes straight back here.
  // A rename is submitted from a dialog on the list and stays put.
  if (!id) {
    const again = requiredString(formData.get('again')) === '1';
    redirect({
      href: again ? '/works/procedures/new' : '/works/procedures',
      locale: await getLocale(),
    });
  }

  return actionOk();
}

/**
 * Drop an entry. Every case that named it keeps saying so — the name is the
 * line's own copy, not a link — so this removes an option from a form and
 * nothing else. That is what makes it safe to delete a typo.
 */
export async function deleteWorkProcedure(formData: FormData): Promise<void> {
  const user = await authorize('work.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const procedure = await prisma.workProcedure.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!procedure) return;

  await prisma.workProcedure.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'workProcedure',
    entityId: id,
    summary: procedure.name,
  });
  revalidateAll();
}

/**
 * Take one of the names the register is already using into the catalogue.
 *
 * The other half of `getProcedureSuggestions`: the page lists what the old text
 * box left behind and this is the button beside each one. A create by another
 * name, deliberately separate so the trail says which of the two happened —
 * "somebody named a new kind of work" and "somebody adopted what was already
 * being written" are different events.
 */
export async function adoptWorkProcedure(formData: FormData): Promise<void> {
  const user = await authorize('work.edit');
  if (!user) return;

  const name = requiredString(formData.get('name'));
  if (!name) return;

  const clash = await prisma.workProcedure.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (clash) return;

  const created = await prisma.workProcedure.create({ data: { name }, select: { id: true } });
  await recordAudit(user, {
    action: 'create',
    entity: 'workProcedure',
    entityId: created.id,
    summary: name,
  });
  revalidateAll();
}
