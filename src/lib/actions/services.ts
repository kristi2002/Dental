'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
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

  // The form asks for a department and then, if that department has any, a
  // subcategory inside it — but a treatment is filed against one heading, and
  // it is the deeper of the two whenever both were answered.
  const categoryId =
    optionalString(formData.get('subcategoryId')) ?? optionalString(formData.get('categoryId'));

  // A heading that has since been deleted would fail the write with a foreign
  // key error and report "something went wrong"; unfiled is the truthful answer
  // and the one the practice can act on.
  const category = categoryId
    ? await prisma.serviceCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
    : null;

  const data = {
    name,
    categoryId: category?.id ?? null,
    durationMin: Math.max(5, toInt(formData.get('durationMin'), 30)),
    // `categoryId` is authoritative for this row from here on — see
    // `Service.legacyCategory`.
    legacyCategory: null,
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

  // Adding a treatment is done on a page of its own, so there is nowhere for the
  // form to return to — the catalogue is what the person came here to add to,
  // and it is where the new row now is. An edit is submitted from a dialog on
  // that list, so it stays put.
  if (!id) {
    redirect({ href: '/services', locale: await getLocale() });
  }

  return actionOk();
}

/**
 * Name a department, or a subcategory inside one.
 *
 * The duplicate check is here rather than on a unique index because the deploy
 * runs `prisma db push` without `--accept-data-loss` (see `docker/entrypoint.sh`)
 * and adding a unique index is exactly the change that stops it dead. It is
 * scoped to the parent: two departments cannot share a name, two
 * subcategories of one department cannot share a name, but "Zbardhim" under
 * Estetikë and "Zbardhim" under Protetikë are two different headings.
 */
export async function saveServiceCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('service.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  const parentId = optionalString(formData.get('parentId'));

  if (parentId) {
    // Two levels and no more. A parent that already has a parent would make a
    // third, and a category cannot be filed under itself.
    if (parentId === id) return actionError(t('categoryDepth'));

    const parent = await prisma.serviceCategory.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (!parent || parent.parentId) return actionError(t('categoryDepth'));

    // Moving a department that has subcategories under another department would
    // make a third level out of its children rather than out of itself.
    if (id) {
      const children = await prisma.serviceCategory.count({ where: { parentId: id } });
      if (children > 0) return actionError(t('categoryDepth'));
    }
  }

  const clash = await prisma.serviceCategory.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      parentId: parentId ?? null,
      ...(id ? { NOT: { id } } : {}),
    },
    select: { id: true },
  });
  if (clash) return actionError(t('categoryTaken'));

  try {
    if (id) {
      // A rename reaches every treatment at once, which is the point of the row
      // existing: the old text box could only ever be corrected one at a time.
      await prisma.serviceCategory.update({
        where: { id },
        data: { name, parentId: parentId ?? null },
      });
    } else {
      await prisma.serviceCategory.create({ data: { name, parentId: parentId ?? null } });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'serviceCategory',
    entityId: id,
    summary: name,
  });

  revalidateAll();

  // Naming a heading is done on a page of its own, so there is nowhere for the
  // form to return to. Which page depends on which button was pressed: the
  // departments are named in a batch, and "save and add another" comes straight
  // back here with the same parent still selected. An edit is submitted from a
  // dialog on the list itself, so it stays put.
  if (!id) {
    const again = requiredString(formData.get('again')) === '1';
    const next = again
      ? `/services/categories/new${parentId ? `?parent=${parentId}` : ''}`
      : '/services/categories';
    redirect({ href: next, locale: await getLocale() });
  }

  return actionOk();
}

/**
 * Drop a heading. The treatments under it stay in the catalogue and become
 * uncategorized (`onDelete: SetNull`) — a category is a label for the price
 * list, and deleting a label has never been a reason to stop offering the work.
 *
 * Dropping a department takes its subcategories with it (`onDelete: Cascade`),
 * so the treatments under those become uncategorized too rather than being
 * orphaned under a heading that no longer has a department to print.
 */
export async function deleteServiceCategory(formData: FormData): Promise<void> {
  const user = await authorize('service.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const category = await prisma.serviceCategory.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!category) return;

  await prisma.serviceCategory.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'serviceCategory',
    entityId: id,
    summary: category.name,
  });
  revalidateAll();
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
