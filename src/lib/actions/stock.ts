'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { MAX_FILE_BYTES } from '@/lib/file-constants';
import { deleteStoredFile, storeFile } from '@/lib/files';
import { suggestMaterials, type MaterialSuggestion } from '@/lib/material-history';
import { prisma } from '@/lib/prisma';
import { decrementShelf, recordConsumption, takeFromShelf } from '@/lib/stock-consumption';
import { isPhotoMimeType, isPhotoOwner } from '@/lib/stock-photos';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/** `YYYY-MM-DD` out of a date input, as the UTC midnight the rest of the app uses. */
function parseDay(raw: string | null): Date | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;
}

/**
 * What this practice usually spends on these treatments — see
 * `suggestMaterials`. An action because the visit form asks it while it is being
 * filled in, once the treatments are known and not before.
 */
export async function getMaterialSuggestions(
  serviceIds: string[],
): Promise<MaterialSuggestion[]> {
  const user = await authorize('stock.view');
  if (!user) return [];
  return suggestMaterials(serviceIds);
}

/**
 * Take an expired or ruined lot off the shelf, naming the lot.
 *
 * `adjustStock` could already remove the units, but only from the top of the
 * pile: it allocates oldest-expiry-first, which is a *guess* that happens to be
 * right for an expired box and wrong for the one that got dropped. The lot is
 * the whole point of writing off — a recall notice and an insurance claim both
 * ask which one — and `recordConsumption` has accepted a preferred lot since
 * scanning existed, with nothing in the storage room able to name one.
 *
 * The reason is its own word rather than "manual" so the usage figures stay
 * honest: stock thrown away is not stock used, and a burn rate that counts a
 * binned lot as consumption would reorder against waste.
 */
export async function writeOffBatch(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const batchId = requiredString(formData.get('batchId'));
  if (!batchId) return;

  const batch = await prisma.stockBatch.findUnique({
    where: { id: batchId },
    select: {
      itemId: true,
      lotNumber: true,
      quantity: true,
      usedQuantity: true,
      item: { select: { name: true } },
    },
  });
  if (!batch) return;

  // Whatever is left of the lot, unless a smaller number was stated. Nobody
  // writes off more than the lot holds, and the form offering "all of it" is
  // the common case — a box goes out of date whole.
  const remaining = Math.max(0, batch.quantity - batch.usedQuantity);
  const asked = toInt(formData.get('quantity'), remaining);
  const quantity = Math.min(remaining, Math.max(1, asked));
  if (quantity <= 0) return;

  // The same guarded take every other consumption goes through — the shelf count
  // is the authority, the floor at zero is enforced inside the write, and a
  // cupboard that had drifted short is written down as far as it actually goes
  // rather than refused. `preferBatchId` is what makes this a write-off *of this
  // lot* instead of off the top of the pile.
  const taken = await prisma.$transaction((tx) =>
    takeFromShelf(tx, {
      itemId: batch.itemId,
      quantity,
      reason: 'write-off',
      staffUserId: user.id,
      preferBatchId: batchId,
    }),
  );
  if (taken <= 0) return;

  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    entityId: batch.itemId,
    summary: `${batch.item.name} · write-off ${taken}${batch.lotNumber ? ` · lot ${batch.lotNumber}` : ''}`,
  });

  revalidateAll();
}

/**
 * Turn a typed product name into the row it names, making it if it is new.
 *
 * Grouping the eight shades of one composite has to cost nothing, or it will not
 * happen: a select would mean leaving the half-filled material form, naming a
 * product on a screen of its own, and coming back — which is three steps too
 * many for something the person is already typing the name of. So the field is a
 * text box with the existing names offered as autocomplete, exactly like the
 * shelf categories were before they became rows.
 *
 * Matched case-insensitively, because "Filtek Z250" and "filtek z250" are one
 * product to everybody except a database index — and there is no unique index
 * here to lean on anyway (see `StockProduct`).
 */
async function resolveProduct(name: string | null): Promise<string | null> {
  if (!name) return null;

  const existing = await prisma.stockProduct.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.stockProduct.create({ data: { name }, select: { id: true } });
  return created.id;
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

  // An article number is a label the practice reads off a shelf, so two rows
  // wearing the same one is a real mix-up. Checked here rather than by a unique
  // constraint — see the field's comment in `schema.prisma` for why the database
  // cannot be the one to say no.
  const code = optionalString(formData.get('code'));
  if (code !== null) {
    const clash = await prisma.stockItem.findFirst({
      where: { code, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (clash) return actionError(t('codeTaken'));
  }

  const data = {
    name,
    code,
    // Blank is "no shelf", which is a real answer — a material can sit
    // uncategorized, and the list has a heading for exactly that.
    categoryId: optionalString(formData.get('categoryId')),
    quantity,
    supplierId,
    minLimit: Math.max(0, toInt(formData.get('minLimit'), 5)),
    // No `unit` and no `packSize`: the shelf is counted in boxes and nothing
    // else, so neither is asked for any more. See their comments in
    // `schema.prisma` — the columns survive the deploy, the questions do not.
    productId: await resolveProduct(optionalString(formData.get('productName'))),
    variantName: optionalString(formData.get('variantName')),
    orderQty,
    // No price. Money is off every storage-room screen by the owner's decision,
    // so the form no longer asks — and `unitPrice` is deliberately left out of
    // this write rather than set to null, which would erase whatever the
    // practice recorded before the field went away.
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

  // Both ends of this are pages of their own now — recording a material and
  // correcting one — so neither has anywhere to stay once it is saved. The list
  // is what the person came from and where the row now is.
  //
  // Where back *is* comes from a hidden word, not a hidden path: an edit opened
  // off the catalogue returns to the catalogue, and everything else returns to
  // the storage room. A redirect target read straight out of a form is one a
  // crafted link gets to choose.
  const back = optionalString(formData.get('from')) === 'catalog' ? '/stock/catalog' : '/stock';
  redirect({ href: back, locale: await getLocale() });

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

  await applyStockChange(id, delta, user.id);
  revalidateAll();
}

/**
 * Take a stated number off the shelf in one go.
 *
 * The ±1 buttons are the whole of manual use, which means six of something is
 * six presses and a mistake in the middle is invisible. This is the same action
 * the dentist's spreadsheet already had — type how many were used, and the
 * count and the ledger both move once.
 *
 * Refuses to take more than is there rather than clamping: the shelf disagreeing
 * with the screen is worth a second look, and silently deducting 8 when 10 were
 * typed writes a number nobody chose.
 *
 * And it now *says* which of the two happened. It refused in silence before —
 * the return value was dropped on the floor — so typing 10 against a shelf of 8
 * cleared the field and looked exactly like success, leaving somebody believing
 * ten boxes had been booked out. A refusal nobody is told about is worse than a
 * clamp: at least a clamp moves the count.
 */
export async function takeStock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');
  const ts = await getTranslations('stock');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  const quantity = toInt(formData.get('quantity'), 0);
  if (!id || quantity <= 0) return actionError(t('fillRequired'));

  const item = await prisma.stockItem.findUnique({ where: { id }, select: { quantity: true } });
  if (!item) return actionError(t('notFound'));

  let applied: boolean;
  try {
    applied = await applyStockChange(id, -quantity, user.id);
  } catch {
    return actionError(t('generic'));
  }

  // The count quoted back is the one read a moment ago rather than the one
  // inside the transaction — it is a sentence for a person to check against a
  // shelf, not a decision, and the guard that actually refused the write was the
  // atomic one in `applyStockChange`. Same wording as the shelf-label screen,
  // which refuses the same move for the same reason.
  if (!applied) return actionError(ts('moveShort', { have: item.quantity }));

  revalidateAll();
  return actionOk();
}

/**
 * Move the counter and write the ledger entry that explains it.
 *
 * The read and the write are **the same statement**. Computing the next quantity
 * in JavaScript from a row read beforehand loses one of two simultaneous taps —
 * both read 8, both write 7 — while still writing *two* movement rows, so the
 * ledger and the counter stop agreeing and `reorder.ts` (which trusts the
 * ledger) diverges from the low-stock badge (which trusts the counter).
 *
 * Anything taken out goes through the same lot allocation a visit does, so a
 * material used by hand draws down its oldest lot rather than leaving every lot
 * looking untouched.
 *
 * Returns whether it actually moved, which is false in exactly one case: the
 * shelf did not hold enough. The ±1 buttons ignore that and the label screen
 * reports it, because one is a tap that can simply be repeated and the other is
 * somebody standing at a cupboard being told a number they can check.
 */
async function applyStockChange(
  id: string,
  delta: number,
  staffUserId: string,
  /** What the ledger should call it. The default is the wording the ±1 taps use. */
  reason = delta < 0 ? 'used' : 'restock',
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Postgres does the arithmetic. The `gte` guard is the floor at zero: when
    // it matches nothing the shelf did not hold enough, and nothing is written
    // at all — no half-applied decrement, no movement to explain it.
    const applied = await tx.stockItem.updateMany({
      where: delta < 0 ? { id, quantity: { gte: -delta } } : { id },
      data: { quantity: { increment: delta } },
    });
    if (applied.count === 0) return false;

    if (delta < 0) {
      await recordConsumption(tx, {
        itemId: id,
        quantity: -delta,
        reason,
        staffUserId,
      });
      return true;
    }

    await tx.stockMovement.create({
      data: { itemId: id, delta, reason, staffUserId },
    });
    return true;
  });
}

/**
 * The move a printed shelf label makes: this material, this many boxes, in or
 * out.
 *
 * Its own action rather than a second caller of `adjustStock`, for one reason —
 * it answers. The ±1 buttons sit next to the number they change, so a tap that
 * did nothing is self-evident; this is submitted by somebody holding a phone at
 * a cupboard, who needs to be told that the shelf only had two.
 *
 * The direction is not stored on the form. It arrives as the name of the button
 * that was pressed, so "add" and "take out" are two verbs rather than one verb
 * and a toggle that can be left the wrong way round — which is the mistake this
 * screen is most exposed to, and the one that silently corrupts a count.
 *
 * No lot is created or named. A label carries no lot number and no expiry —
 * that is what the supplier's own symbol is for (see `commitScan`, which writes
 * a `StockBatch` only when the symbol actually said something about one), and
 * inventing a lot here would fill the expiry screen with rows that can never go
 * off. Taking out still draws down the oldest lot, because `recordConsumption`
 * does that for every consumption in the app.
 */
export async function moveStock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');
  const ts = await getTranslations('stock');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  const out = requiredString(formData.get('direction')) === 'out';
  const quantity = toInt(formData.get('quantity'), 0);
  if (!id || quantity <= 0) return actionError(t('fillRequired'));

  const item = await prisma.stockItem.findUnique({
    where: { id },
    select: { name: true, quantity: true },
  });
  if (!item) return actionError(t('notFound'));

  let applied: boolean;
  try {
    applied = await applyStockChange(
      id,
      out ? -quantity : quantity,
      user.id,
      out ? 'scan out' : 'scan in',
    );
  } catch {
    return actionError(t('generic'));
  }

  // Only reachable on a take-out that would overdraw. The count quoted back is
  // the one read a moment ago rather than the one inside the transaction — it
  // is a sentence for a person to check against a shelf, not a decision, and
  // the guard that actually refused the write was the atomic one above.
  if (!applied) return actionError(ts('moveShort', { have: item.quantity }));

  revalidateAll();
  return actionOk();
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

/**
 * Name a shelf.
 *
 * The duplicate check is here rather than on a unique index because `db push`
 * will not add one without taking the deploy with it (see `StockCategory`), and
 * it is case-insensitive because "Higjienë" and "higjienë" are one shelf to
 * everybody except a database index.
 */
export async function saveStockCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  const clash = await prisma.stockCategory.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) return actionError(t('categoryTaken'));

  try {
    if (id) {
      // A rename reaches every material at once, which is the point of the row
      // existing: the old text box could only ever be corrected one item at a time.
      await prisma.stockCategory.update({ where: { id }, data: { name } });
    } else {
      await prisma.stockCategory.create({ data: { name } });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'stockCategory',
    entityId: id,
    summary: name,
  });

  revalidateAll();

  // Naming a shelf is done on a page of its own, so there is nowhere for the
  // form to return to. Which page depends on which button was pressed: the
  // shelves are named in a batch, and "save and add another" comes straight back
  // here. A rename is submitted from a dialog on the list itself, so it stays
  // put.
  if (!id) {
    const again = requiredString(formData.get('again')) === '1';
    redirect({
      href: again ? '/stock/categories/new' : '/stock/categories',
      locale: await getLocale(),
    });
  }

  return actionOk();
}

/**
 * Drop a shelf. The materials on it stay exactly where they are and become
 * uncategorized (`onDelete: SetNull`) — a category is a label for the storage
 * room, and deleting a label has never been a reason to lose the boxes.
 */
export async function deleteStockCategory(formData: FormData): Promise<void> {
  const user = await authorize('stock.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const category = await prisma.stockCategory.findUnique({ where: { id }, select: { name: true } });
  if (!category) return;

  await prisma.stockCategory.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'stockCategory',
    entityId: id,
    summary: category.name,
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

  // Recording a supplier is done on a page of its own, so there is nowhere for
  // the form to return to — and "save and add another" comes straight back here,
  // because the list is entered in a batch. An edit is submitted from a dialog
  // on the list itself, so it stays put.
  if (!id) {
    const again = requiredString(formData.get('again')) === '1';
    redirect({
      href: again ? '/stock/suppliers/new' : '/stock/suppliers',
      locale: await getLocale(),
    });
  }

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

  const expiryDate = parseDay(optionalString(formData.get('expiryDate')));
  const manufacturedAt = parseDay(optionalString(formData.get('manufacturedAt')));
  // Blank means "arrived today" rather than "unknown": a delivery being recorded
  // is a delivery that happened, and the common case should not need a keystroke.
  const purchasedAt = parseDay(optionalString(formData.get('purchasedAt'))) ?? new Date();

  try {
    await prisma.$transaction([
      prisma.stockBatch.create({
        data: {
          itemId,
          lotNumber: optionalString(formData.get('lotNumber')),
          expiryDate,
          manufacturedAt,
          purchasedAt,
          quantity,
          notes: optionalString(formData.get('notes')),
        },
      }),
      // Relative, so two people recording deliveries at once cannot lose one —
      // see IMPROVEMENTS §1.2 for what an absolute write costs here.
      prisma.stockItem.update({
        where: { id: itemId },
        data: {
          quantity: { increment: quantity },
          orderedAt: null,
          expectedAt: null,
        },
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
 * Remove a lot that was entered wrongly. What is still *in* it comes back off
 * the shelf, because adding the lot is what put it there — otherwise the counter
 * drifts from the ledger, which is the disagreement the whole stock feature
 * exists to avoid.
 *
 * Only what remains, and that is the whole correction here. This used to reverse
 * `quantity` — what the delivery note said — on a lot that may since have been
 * half used: those units came off the shelf when they were used, and taking them
 * off a second time drove the count below what was physically there, with
 * nothing to say so. A lot of ten with six used is four boxes to give back.
 *
 * Guarded like every other take, so a lot whose shelf has already drifted short
 * cannot push the counter negative — this was the one write in this file
 * decrementing without a floor.
 */
export async function deleteBatch(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const removed = await prisma.$transaction(async (tx) => {
    // Read inside the transaction: a lot being consumed as it is deleted must
    // not leave a `usedQuantity` behind that was true a moment ago.
    const batch = await tx.stockBatch.findUnique({
      where: { id },
      select: { itemId: true, lotNumber: true, quantity: true, usedQuantity: true },
    });
    if (!batch) return null;

    const remaining = Math.max(0, batch.quantity - batch.usedQuantity);
    await tx.stockBatch.delete({ where: { id } });

    // `decrementShelf`, not `takeFromShelf`: the units are being un-delivered,
    // not used. Routing them through a consumption would allocate them against
    // *other* lots and feed a reversal into the 90-day burn rate as demand.
    const applied = await decrementShelf(tx, batch.itemId, remaining);

    // No movement for a lot that was already empty — there is nothing to
    // explain, and a zero-delta row would only bury the ledger.
    if (applied > 0) {
      await tx.stockMovement.create({
        data: {
          itemId: batch.itemId,
          delta: -applied,
          reason: 'delivery reversed',
          staffUserId: user.id,
        },
      });
    }

    return { itemId: batch.itemId, lotNumber: batch.lotNumber, applied };
  });
  if (!removed) return;

  await recordAudit(user, {
    action: 'delete',
    entity: 'stock',
    entityId: removed.itemId,
    summary: `Lot ${removed.lotNumber ?? '—'} −${removed.applied}`,
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

/**
 * Mark everything on one supplier's order as ordered, in one press.
 *
 * An order is placed per supplier and answered per supplier, and the flag was
 * only ever settable per material — so sending one message about eight items
 * meant pressing "ordered" eight times, and the realistic outcome is that
 * nobody presses it at all and the list nags every morning until the box turns
 * up. Same write as `markOrdered`, applied to the group that was actually sent.
 */
export async function markSupplierOrdered(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const ids = requiredString(formData.get('ids'))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length === 0) return;

  const raw = optionalString(formData.get('expectedAt'));
  const expectedAt = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;

  // Only the ones still waiting for a decision: re-stamping something already on
  // order would push its expected date forward for no reason.
  const marked = await prisma.stockItem.updateMany({
    where: { id: { in: ids }, orderedAt: null },
    data: { orderedAt: new Date(), expectedAt },
  });
  if (marked.count === 0) return;

  const supplierName = optionalString(formData.get('supplierName')) ?? '';
  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    summary: `${marked.count} ${supplierName ? `· ${supplierName} ` : ''}→ ordered`,
  });
  revalidateAll();
}

/**
 * Put a photograph on a material, or on the product all its variants share.
 *
 * The whole point of the catalogue: a storage room is recognised by sight, and a
 * list of names is a list somebody has to decode before they can act on it. One
 * picture per row turns "Kompozit Filtek Z250 A2" into the box they are already
 * holding.
 *
 * Replaces rather than appends — a material has one photograph, and
 * photographing the same box twice must leave one picture, not two. The old
 * bytes go only once the new ones are safely stored, for the reason
 * `saveIdDocument` does it in that order: a photo deleted before its successor
 * exists is a photo the practice no longer has.
 */
export async function saveStockPhoto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');
  const ts = await getTranslations('stock');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const kind = requiredString(formData.get('kind'));
  const id = requiredString(formData.get('id'));
  const file = formData.get('file');
  if (!isPhotoOwner(kind) || !id) return actionError(t('generic'));
  if (!(file instanceof File) || file.size === 0) return actionError(ts('photoNone'));

  if (file.size > MAX_FILE_BYTES) {
    return actionError(ts('photoTooLarge', { max: Math.floor(MAX_FILE_BYTES / (1024 * 1024)) }));
  }
  if (!isPhotoMimeType(file.type)) return actionError(ts('photoType'));

  const previous =
    kind === 'item'
      ? await prisma.stockItem.findUnique({ where: { id }, select: { photoKey: true, name: true } })
      : await prisma.stockProduct.findUnique({
          where: { id },
          select: { photoKey: true, name: true },
        });
  if (!previous) return actionError(t('notFound'));

  let storageKey: string;
  try {
    storageKey = await storeFile(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    console.error('[stock] could not store photo', error);
    return actionError(t('generic'));
  }

  try {
    const data = { photoKey: storageKey, photoMime: file.type };
    if (kind === 'item') {
      await prisma.stockItem.update({ where: { id }, data });
    } else {
      await prisma.stockProduct.update({ where: { id }, data });
    }
  } catch (error) {
    // Never leave bytes on disk that no row points at.
    await deleteStoredFile(storageKey);
    console.error('[stock] could not record photo', error);
    return actionError(t('generic'));
  }

  if (previous.photoKey) await deleteStoredFile(previous.photoKey);

  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    entityId: id,
    summary: `${previous.name} · photo`,
  });

  revalidateAll();
  return actionOk();
}

/** Take the photograph off again — a picture of the wrong box is worse than none. */
export async function removeStockPhoto(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const kind = requiredString(formData.get('kind'));
  const id = requiredString(formData.get('id'));
  if (!isPhotoOwner(kind) || !id) return;

  // Read the key first: an update returns the row as it now is, which is
  // precisely the row with the key erased. The bytes are unlinked after the
  // column is cleared, so a failure between the two leaves an unreferenced file
  // rather than a row pointing at nothing.
  const existing =
    kind === 'item'
      ? await prisma.stockItem.findUnique({ where: { id }, select: { photoKey: true } })
      : await prisma.stockProduct.findUnique({ where: { id }, select: { photoKey: true } });
  if (!existing?.photoKey) return;

  const data = { photoKey: null, photoMime: null };
  if (kind === 'item') {
    await prisma.stockItem.update({ where: { id }, data });
  } else {
    await prisma.stockProduct.update({ where: { id }, data });
  }

  await deleteStoredFile(existing.photoKey);

  revalidateAll();
}

/**
 * Rename a product, or say who makes it.
 *
 * The product row is created by typing its name on the material form, which
 * means a typo becomes a group of one that nothing else will ever join. This is
 * the correction, and it reaches every variant at once — the same reason a shelf
 * category is a row rather than a word repeated per material.
 */
export async function saveStockProduct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!id || !name) return actionError(t('fillRequired'));

  try {
    await prisma.stockProduct.update({
      where: { id },
      data: { name, brand: optionalString(formData.get('brand')) },
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, { action: 'update', entity: 'stock', entityId: id, summary: name });
  revalidateAll();
  return actionOk();
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
