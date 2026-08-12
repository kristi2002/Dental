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

  // Blank means "no stated quantity", which is not the same as zero — the
  // reorder list falls back to projecting one. Zero would mean "order nothing".
  const rawOrderQty = optionalString(formData.get('orderQty'));
  const orderQty = rawOrderQty === null ? null : Math.max(1, toInt(rawOrderQty, 1));

  const data = {
    name,
    category: optionalString(formData.get('category')),
    quantity,
    supplierId,
    minLimit: Math.max(0, toInt(formData.get('minLimit'), 5)),
    unit: requiredString(formData.get('unit')) || 'pcs',
    // A pack of zero or half a glove is not a thing anyone can order.
    packSize: Math.max(1, toInt(formData.get('packSize'), 1)),
    orderQty,
  };

  let savedId = id;
  try {
    if (id) {
      const missing = await prisma.$transaction(async (tx) => {
        // Read inside the transaction, not before it. The form states an
        // absolute count, so the movement is the difference from whatever the
        // row *actually* holds at this moment — never from a figure the browser
        // was shown before a colleague changed it.
        const existing = await tx.stockItem.findUnique({
          where: { id },
          select: { quantity: true },
        });
        if (!existing) return true;

        await tx.stockItem.update({ where: { id }, data });

        const delta = quantity - existing.quantity;
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: { itemId: id, delta, reason: 'manual', staffUserId: user.id },
          });
        }
        return false;
      });
      if (missing) return actionError(t('notFound'));
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
 * The read and the write are **the same statement**. Computing the next quantity
 * in JavaScript from a row read beforehand loses one of two simultaneous taps —
 * both read 8, both write 7 — while still writing *two* movement rows, so the
 * ledger and the counter stop agreeing and `reorder.ts` (which trusts the
 * ledger) diverges from the low-stock badge (which trusts the counter).
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

  await prisma.$transaction(async (tx) => {
    // Postgres does the arithmetic. The `gte` guard is the floor at zero: when
    // it matches nothing the shelf did not hold enough, and nothing is written
    // at all — no half-applied decrement, no movement to explain it.
    const applied = await tx.stockItem.updateMany({
      where: delta < 0 ? { id, quantity: { gte: -delta } } : { id },
      data: { quantity: { increment: delta } },
    });
    if (applied.count === 0) return;

    await tx.stockMovement.create({
      data: {
        itemId: id,
        delta,
        reason: delta < 0 ? 'used' : 'restock',
        staffUserId: user.id,
      },
    });
  });

  revalidateAll();
}

/**
 * Record a shelf count.
 *
 * This is the interaction bulk stock actually gets: nobody taps −1 per glove,
 * they walk the storage room every few months and write down what is there. The
 * ledger gets the difference, so consumption stays measured even though nothing
 * was measured as it happened.
 *
 * Only the lines the person actually edited are submitted. A prefilled figure is
 * a convenience, not an assertion — otherwise a stocktake left open in a tab
 * would write its stale numbers back over whatever a colleague consumed
 * meanwhile, silently undoing real work.
 *
 * The delta is computed inside the transaction against what the row actually
 * holds rather than the figure the browser was shown, so the ledger always
 * agrees with the counter it is supposed to explain.
 */
export async function saveStocktake(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const counted = new Map<string, number>();
  for (const entry of formData.getAll('count')) {
    if (typeof entry !== 'string') continue;
    // Split on the last colon: a uuid never contains one, but this stays
    // correct if the key format ever gains a prefix.
    const separator = entry.lastIndexOf(':');
    if (separator <= 0) continue;

    const value = toInt(entry.slice(separator + 1), -1);
    if (value < 0) continue;
    counted.set(entry.slice(0, separator), value);
  }
  if (counted.size === 0) return actionOk();

  let changed = 0;
  try {
    changed = await prisma.$transaction(async (tx) => {
      const items = await tx.stockItem.findMany({
        where: { id: { in: [...counted.keys()] } },
        select: { id: true, quantity: true },
      });

      let applied = 0;
      for (const item of items) {
        const value = counted.get(item.id);
        if (value === undefined) continue;

        const delta = value - item.quantity;
        // A line counted and found correct is not news. Writing a zero-delta
        // movement for it would bury the ledger under confirmations.
        if (delta === 0) continue;

        await tx.stockItem.update({ where: { id: item.id }, data: { quantity: value } });
        await tx.stockMovement.create({
          data: { itemId: item.id, delta, reason: 'stocktake', staffUserId: user.id },
        });
        applied += 1;
      }
      return applied;
    });
  } catch {
    return actionError(t('generic'));
  }

  // Worth one audit line, unlike the ±1 taps: a stocktake is a deliberate,
  // occasional act that can move a lot of numbers at once.
  if (changed > 0) {
    await recordAudit(user, {
      action: 'update',
      entity: 'stock',
      summary: `Stocktake — ${changed} adjusted`,
    });
  }

  revalidateAll();
  return actionOk();
}

/**
 * Retire a material.
 *
 * Archives rather than deletes as soon as the item has any history, for the
 * reason staff are deactivated rather than removed: `StockMovement` is what the
 * usage chart and the 90-day burn rate read, so erasing a discontinued material
 * used to change *last quarter's figures* with nothing to show it had happened.
 *
 * A material that has never moved has no history to protect, so it is genuinely
 * deleted — otherwise a typo made on the new-item form would haunt the archive
 * forever.
 */
export async function deleteStockItem(formData: FormData): Promise<void> {
  const user = await authorize('stock.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const item = await prisma.stockItem.findUnique({
    where: { id },
    select: { name: true, _count: { select: { movements: true, batches: true } } },
  });
  if (!item) return;

  const hasHistory = item._count.movements > 0 || item._count.batches > 0;

  if (hasHistory) {
    await prisma.stockItem.update({
      where: { id },
      // Clearing the order flags too: an archived item is not on its way.
      data: { archivedAt: new Date(), orderedAt: null, expectedAt: null },
    });
  } else {
    await prisma.stockItem.delete({ where: { id } });
  }

  await recordAudit(user, {
    action: hasHistory ? 'update' : 'delete',
    entity: 'stock',
    entityId: id,
    summary: hasHistory ? `${item.name} → archived` : item.name,
  });
  revalidateAll();
}

/** Put an archived material back on the shelf. */
export async function restoreStockItem(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const item = await prisma.stockItem.update({
    where: { id },
    data: { archivedAt: null },
    select: { name: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    entityId: id,
    summary: `${item.name} → restored`,
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
