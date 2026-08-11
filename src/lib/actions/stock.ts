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

export async function saveStockItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  const quantity = Math.max(0, toInt(formData.get('quantity'), 0));
  const supplierId = optionalString(formData.get('supplierId'));
  const data = {
    name,
    category: optionalString(formData.get('category')),
    quantity,
    supplierId,
    minLimit: Math.max(0, toInt(formData.get('minLimit'), 5)),
    unit: requiredString(formData.get('unit')) || 'pcs',
  };

  let savedId = id;
  try {
    if (id) {
      const existing = await prisma.stockItem.findUnique({ where: { id } });
      if (!existing) return actionError(t('notFound'));

      await prisma.$transaction(async (tx) => {
        await tx.stockItem.update({ where: { id }, data });
        const delta = quantity - existing.quantity;
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: { itemId: id, delta, reason: 'manual', staffUserId: user.id },
          });
        }
      });
    } else {
      savedId = (await prisma.stockItem.create({ data, select: { id: true } })).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'stock',
    entityId: savedId,
    summary: name,
  });

  revalidateAll();
  return actionOk();
}

/**
 * The one-tap +1 / −1 buttons on the stock page. Quantity never goes below zero,
 * and the movement is logged so the statistics page can show real consumption.
 *
 * No audit entry: the StockMovement row already records who and when, and one
 * audit line per tap would bury everything else in the activity feed.
 */
export async function adjustStock(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

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
      data: {
        itemId: id,
        delta: appliedDelta,
        reason: appliedDelta < 0 ? 'used' : 'restock',
        staffUserId: user.id,
      },
    }),
  ]);

  revalidateAll();
}

export async function deleteStockItem(formData: FormData): Promise<void> {
  const user = await authorize('stock.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const item = await prisma.stockItem.findUnique({ where: { id }, select: { name: true } });
  if (!item) return;

  await prisma.stockItem.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'stock',
    entityId: id,
    summary: item.name,
  });
  revalidateAll();
}

export async function saveSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  const data = {
    name,
    phone: optionalString(formData.get('phone')),
    email: optionalString(formData.get('email')),
    notes: optionalString(formData.get('notes')),
  };

  try {
    if (id) {
      await prisma.supplier.update({ where: { id }, data });
    } else {
      await prisma.supplier.create({ data });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'supplier',
    entityId: id,
    summary: name,
  });

  revalidateAll();
  return actionOk();
}

export async function deleteSupplier(formData: FormData): Promise<void> {
  const user = await authorize('stock.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { name: true } });
  if (!supplier) return;

  // Items keep their history; the link just goes null (`onDelete: SetNull`).
  await prisma.supplier.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'supplier',
    entityId: id,
    summary: supplier.name,
  });
  revalidateAll();
}

/**
 * Record a delivery: the lot number, when it expires, and how many arrived.
 *
 * This *is* the restock path for anything that carries an expiry date — the
 * quantity goes up, the ledger gets its movement, and the order flag clears, so
 * a delivery is one action rather than three that can be done in the wrong
 * order or half-forgotten.
 */
export async function saveBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const itemId = requiredString(formData.get('itemId'));
  const quantity = Math.max(0, toInt(formData.get('quantity'), 0));
  if (!itemId || quantity <= 0) return actionError(t('fillRequired'));

  const rawExpiry = optionalString(formData.get('expiryDate'));
  const expiryDate =
    rawExpiry && /^\d{4}-\d{2}-\d{2}$/.test(rawExpiry)
      ? new Date(`${rawExpiry}T00:00:00.000Z`)
      : null;

  try {
    await prisma.$transaction([
      prisma.stockBatch.create({
        data: {
          itemId,
          lotNumber: optionalString(formData.get('lotNumber')),
          expiryDate,
          quantity,
          notes: optionalString(formData.get('notes')),
        },
      }),
      // Relative, so two people recording deliveries at once cannot lose one —
      // see IMPROVEMENTS §1.2 for what an absolute write costs here.
      prisma.stockItem.update({
        where: { id: itemId },
        data: { quantity: { increment: quantity }, orderedAt: null, expectedAt: null },
      }),
      prisma.stockMovement.create({
        data: { itemId, delta: quantity, reason: 'delivery', staffUserId: user.id },
      }),
    ]);
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'stock',
    entityId: itemId,
    summary: `Delivery +${quantity}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Remove a lot that was entered wrongly. The quantity comes back off, because
 * adding the lot is what put it on — otherwise the counter drifts from the
 * ledger, which is the disagreement the whole stock feature exists to avoid.
 */
export async function deleteBatch(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const batch = await prisma.stockBatch.findUnique({ where: { id } });
  if (!batch) return;

  await prisma.$transaction([
    prisma.stockBatch.delete({ where: { id } }),
    prisma.stockItem.update({
      where: { id: batch.itemId },
      data: { quantity: { decrement: batch.quantity } },
    }),
    prisma.stockMovement.create({
      data: {
        itemId: batch.itemId,
        delta: -batch.quantity,
        reason: 'delivery reversed',
        staffUserId: user.id,
      },
    }),
  ]);

  await recordAudit(user, {
    action: 'delete',
    entity: 'stock',
    entityId: batch.itemId,
    summary: `Lot ${batch.lotNumber ?? '—'} −${batch.quantity}`,
  });
  revalidateAll();
}

/**
 * "It has been ordered." Stops the reorder list asking for the same thing every
 * morning until the box physically arrives — which is what trains everyone to
 * stop reading the list.
 */
export async function markOrdered(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const raw = optionalString(formData.get('expectedAt'));
  const expectedAt = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;

  const item = await prisma.stockItem.update({
    where: { id },
    data: { orderedAt: new Date(), expectedAt },
    select: { name: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    entityId: id,
    summary: `${item.name} → ordered`,
  });
  revalidateAll();
}

/** Undo an "ordered" flag set by mistake. Delivery clears it on its own. */
export async function clearOrdered(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const item = await prisma.stockItem.update({
    where: { id },
    data: { orderedAt: null, expectedAt: null },
    select: { name: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    entityId: id,
    summary: `${item.name} → not ordered`,
  });
  revalidateAll();
}
