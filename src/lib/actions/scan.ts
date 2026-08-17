'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { parseScan, type ScanFormat } from '@/lib/barcode';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { parseMoney } from '@/lib/money';
import { prisma } from '@/lib/prisma';
import { parseStockLabel, stockLabelPath } from '@/lib/stock-labels';
import { takeFromShelf } from '@/lib/stock-consumption';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/** `YYYY-MM-DD` out of a date input, as the UTC midnight the rest of the app uses. */
function parseDay(raw: string | null): Date | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;
}

const isoDay = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? null;

/** Which way the scan moves the shelf. */
export type ScanDirection = 'in' | 'out';

/** Everything the screen needs to draw one scanned box, resolved or not. */
export type ScanResolution = {
  raw: string;
  format: ScanFormat;
  /** The normalised key — what a link is stored under, and what dedupes a basket. */
  key: string;
  lotNumber: string | null;
  serial: string | null;
  expiryDate: string | null;
  manufacturedAt: string | null;
  /** How many boxes one scan of this symbol is worth. 1 until a link says otherwise. */
  packQty: number;
  item: {
    id: string;
    name: string;
    /** What the shelf says right now, in boxes — so taking out can refuse to overdraw. */
    quantity: number;
    minLimit: number;
    code: string | null;
  } | null;
  /** The lot already on record that this scan names, when there is one. */
  batch: { id: string; lotNumber: string | null; expiryDate: string | null; remaining: number } | null;
  /** The scanned lot is past its date. A fact to show, not a reason to refuse. */
  expired: boolean;
};

/**
 * A label this practice printed itself, as a resolved scan — or null for
 * anything that is not one.
 *
 * Null is the ordinary answer here: every supplier carton in the storage room
 * passes through this first and falls straight out of it.
 *
 * A **product** label names a family rather than a box, and this console has
 * nowhere to ask which shade was meant — a basket line has to be one material.
 * So it resolves only when the product turns out to have a single variant, which
 * is most of them, and otherwise returns null: a refusing beep and nothing
 * added, rather than a guess at which of eight shades is in somebody's hand. The
 * screen the label actually opens on a phone (`/stock/q/p/…`) asks properly.
 *
 * Returning null rather than an unresolved scan matters: an unresolved one goes
 * to the "unknown code" queue, which offers to link it to a material forever,
 * and our own label URL is the last thing that should become a `ProductBarcode`.
 */
async function resolveOwnLabel(raw: string): Promise<ScanResolution | null> {
  const label = parseStockLabel(raw);
  if (!label) return null;

  const item =
    label.kind === 'item'
      ? await prisma.stockItem.findUnique({
          where: { id: label.id },
          select: { id: true, name: true, quantity: true, minLimit: true, code: true },
        })
      : await singleVariantOf(label.id);
  if (!item) return null;

  return {
    raw: raw.trim(),
    // Not a GS1 symbol and not pretending to be one. The console only shows the
    // format on codes that need a decision, and this one never does.
    format: 'plain',
    // The path rather than the whole URL, so the same sticker read on the clinic
    // LAN and through the practice's domain name is one basket line.
    key: stockLabelPath(label.kind, label.id),
    // A label carries none of this. Everything a lot number would have told us
    // is on the supplier's own symbol, and inventing it here would put lots on
    // the expiry screen that no delivery note ever mentioned.
    lotNumber: null,
    serial: null,
    expiryDate: null,
    manufacturedAt: null,
    packQty: 1,
    item,
    batch: null,
    expired: false,
  };
}

/** A product's only variant, when it has exactly one. Null when the answer is ambiguous. */
async function singleVariantOf(productId: string) {
  const variants = await prisma.stockItem.findMany({
    where: { productId },
    select: { id: true, name: true, quantity: true, minLimit: true, code: true },
    take: 2,
  });
  return variants.length === 1 ? variants[0] : null;
}

/**
 * Turn whatever the scanner emitted into the material it names.
 *
 * A lookup, deliberately: nothing is written and nothing is decided here. The
 * console holds a basket of these and commits once, because a delivery is
 * fifteen boxes and writing a row per beep would make "undo the one I
 * double-scanned" impossible.
 *
 * An unknown code is a perfectly normal answer, not an error — it is the first
 * time the practice has scanned that product, and the screen's job is then to
 * offer to link it. Returning null for the item and everything the symbol *did*
 * say is what lets that offer be pre-filled.
 */
export async function lookupScan(raw: string): Promise<ScanResolution | null> {
  const user = await authorize('stock.edit');
  if (!user) return null;

  // Our own shelf label, before anything tries to read it as a supplier's
  // symbol. It resolves without a `ProductBarcode` row because it already names
  // the material outright — that is the whole point of printing one.
  const label = await resolveOwnLabel(raw);
  if (label) return label;

  const scan = parseScan(raw);
  if (!scan.key) return null;

  const link = await prisma.productBarcode.findUnique({
    where: { code: scan.key },
    select: {
      packQty: true,
      item: {
        select: {
          id: true,
          name: true,
          quantity: true,
          minLimit: true,
          code: true,
          archivedAt: true,
        },
      },
    },
  });

  // A retired material that is still being scanned is a real event — a box of it
  // has turned up, or is being used out of a drawer nobody emptied. Treating it
  // as unknown would invite a duplicate row for something the practice already
  // has history for, so it resolves and the console offers to restore it.
  const item = link?.item ?? null;

  // The lot the symbol named, if it is already on record. Matched on the lot
  // number *and* the expiry, because two lots of one material are told apart by
  // exactly those two fields.
  const batch =
    item && scan.lotNumber
      ? await prisma.stockBatch.findFirst({
          where: {
            itemId: item.id,
            lotNumber: scan.lotNumber,
            ...(scan.expiryDate ? { expiryDate: scan.expiryDate } : {}),
          },
          select: { id: true, lotNumber: true, expiryDate: true, quantity: true, usedQuantity: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  return {
    raw: scan.raw,
    format: scan.format,
    key: scan.key,
    lotNumber: scan.lotNumber,
    serial: scan.serial,
    expiryDate: isoDay(scan.expiryDate),
    manufacturedAt: isoDay(scan.manufacturedAt),
    // A symbol that states its own count (AI 30) outranks the pack size on the
    // link: the carton says what is in *this* carton.
    packQty: scan.countedQuantity ?? link?.packQty ?? 1,
    item: item
      ? {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          minLimit: item.minLimit,
          code: item.code,
        }
      : null,
    batch: batch
      ? {
          id: batch.id,
          lotNumber: batch.lotNumber,
          expiryDate: isoDay(batch.expiryDate),
          remaining: batch.quantity - batch.usedQuantity,
        }
      : null,
    expired: scan.expiryDate ? scan.expiryDate < todayUtc : false,
  };
}

/**
 * One line of a committed basket.
 *
 * JSON rather than the `id:quantity` pairs the rest of the app posts, because a
 * lot number is free text and the first one containing a colon would silently
 * split into two fields.
 */
type CommitLine = {
  itemId: string;
  quantity: number;
  lotNumber?: string | null;
  expiryDate?: string | null;
  manufacturedAt?: string | null;
  unitPrice?: string | null;
  /** The lot on record this scan named, when it named one. */
  batchId?: string | null;
};

function parseLines(formData: FormData): CommitLine[] {
  const out: CommitLine[] = [];

  for (const entry of formData.getAll('line')) {
    if (typeof entry !== 'string') continue;
    try {
      const line = JSON.parse(entry) as CommitLine;
      const quantity = Math.floor(Number(line.itemId ? line.quantity : Number.NaN));
      if (!line.itemId || !Number.isFinite(quantity) || quantity <= 0) continue;
      out.push({ ...line, quantity: Math.min(100_000, quantity) });
    } catch {
      // A line that will not parse is one line lost, not a refused delivery.
      continue;
    }
  }

  return out;
}

/**
 * Commit a basket of scans — the whole point of the screen.
 *
 * Receiving and taking out are one action rather than two because they are one
 * gesture with a switch on it, and because the half of the work that is hard is
 * identical either way: resolve the symbol, find the lot, keep the counter and
 * the ledger in step inside one transaction.
 *
 * Receiving creates a lot rather than adding to one. `StockBatch.quantity` is
 * what a delivery note said and is documented never to change; the same lot
 * arriving twice is two deliveries, and recording it as one would lose the only
 * figure a supplier's invoice can be checked against.
 */
export async function commitScan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const direction: ScanDirection = requiredString(formData.get('direction')) === 'out' ? 'out' : 'in';
  const lines = parseLines(formData);
  if (lines.length === 0) return actionError(t('fillRequired'));

  // Only for taking out, and only when the console was opened from a patient:
  // it is what makes the ledger able to answer "which lot went into whom".
  const visitRecordId = direction === 'out' ? optionalString(formData.get('visitRecordId')) : null;

  const applied: Array<{ name: string; quantity: number }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      const items = await tx.stockItem.findMany({
        where: { id: { in: lines.map((line) => line.itemId) } },
        select: { id: true, name: true },
      });
      const nameOf = new Map(items.map((item) => [item.id, item.name]));

      for (const line of lines) {
        const name = nameOf.get(line.itemId);
        // A material deleted between the scan and the commit is skipped rather
        // than failing the whole delivery.
        if (!name) continue;

        if (direction === 'out') {
          const took = await takeFromShelf(tx, {
            itemId: line.itemId,
            quantity: line.quantity,
            reason: visitRecordId ? 'used in visit' : 'scan out',
            staffUserId: user.id,
            visitRecordId,
            preferBatchId: line.batchId ?? null,
          });
          if (took > 0) applied.push({ name, quantity: -took });
          continue;
        }

        const expiryDate = parseDay(line.expiryDate ?? null);
        const lotNumber = line.lotNumber?.trim() || null;
        const unitPrice = parseMoney(line.unitPrice ?? null);

        // A lot row only where the symbol actually said something about a lot.
        // Inventing one from a scan that carried neither a number nor a date
        // would fill the expiry screen with rows that can never go off.
        if (lotNumber || expiryDate) {
          await tx.stockBatch.create({
            data: {
              itemId: line.itemId,
              lotNumber,
              expiryDate,
              manufacturedAt: parseDay(line.manufacturedAt ?? null),
              purchasedAt: new Date(),
              unitPrice,
              quantity: line.quantity,
            },
          });
        }

        await tx.stockItem.update({
          where: { id: line.itemId },
          data: {
            // Relative, so two people receiving deliveries at once cannot lose
            // one — the same reason `saveBatch` increments rather than sets.
            quantity: { increment: line.quantity },
            // What arrived is no longer on its way.
            orderedAt: null,
            expectedAt: null,
            ...(unitPrice === null ? {} : { unitPrice }),
          },
        });

        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            delta: line.quantity,
            reason: 'scan in',
            staffUserId: user.id,
          },
        });

        applied.push({ name, quantity: line.quantity });
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  if (applied.length === 0) return actionError(t('generic'));

  // One audit line per basket, not per beep — the same rule the ±1 taps and the
  // stocktake already follow. A delivery is one deliberate act.
  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    summary: `${direction === 'in' ? 'Scanned in' : 'Scanned out'} — ${applied
      .map((line) => `${line.name} ${line.quantity > 0 ? '+' : '−'}${Math.abs(line.quantity)}`)
      .join(', ')}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Teach the app what a code is.
 *
 * The one fact no supplier can supply and every practice knows: this GTIN is
 * that box on that shelf. Scanning is worthless until it is recorded once, and
 * trivial forever afterwards — which is why linking is offered inline, from the
 * unknown scan itself, rather than filed away on a settings screen nobody would
 * visit holding a carton.
 *
 * A name instead of an id creates the material too. The first scan of a product
 * the practice has never stocked is the *common* case when this screen is new,
 * and sending someone to another form to type a name they are holding in their
 * hand is how a scanner ends up unused.
 */
export async function linkBarcode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const raw = requiredString(formData.get('raw'));
  if (!raw) return actionError(t('fillRequired'));

  // Normalised here rather than trusted from the browser: the key is what makes
  // one carton one row, and a client that skipped the normalisation would create
  // a second link for a product that already had one.
  const { key, raw: trimmed } = parseScan(raw);
  if (!key) return actionError(t('fillRequired'));

  const itemId = optionalString(formData.get('itemId'));
  const newName = optionalString(formData.get('newName'));
  if (!itemId && !newName) return actionError(t('fillRequired'));

  const existing = await prisma.productBarcode.findUnique({
    where: { code: key },
    select: { item: { select: { name: true } } },
  });
  if (existing) return actionError(t('barcodeTaken', { name: existing.item.name }));

  const packQty = Math.max(1, toInt(formData.get('packQty'), 1));
  const label = optionalString(formData.get('label'));

  let targetId = itemId;
  try {
    await prisma.$transaction(async (tx) => {
      if (!targetId) {
        const created = await tx.stockItem.create({
          data: {
            name: newName!,
            categoryId: optionalString(formData.get('categoryId')),
          },
          select: { id: true },
        });
        targetId = created.id;
      }

      await tx.productBarcode.create({
        data: { code: key, itemId: targetId!, packQty, label, rawSample: trimmed },
      });

      // Scanning something that was retired is the practice saying it is back.
      await tx.stockItem.updateMany({
        where: { id: targetId!, archivedAt: { not: null } },
        data: { archivedAt: null },
      });
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: newName && !itemId ? 'create' : 'update',
    entity: 'stock',
    entityId: targetId,
    summary: `${newName ?? ''}${newName ? ' — ' : ''}barcode ${key} linked`,
  });

  revalidateAll();
  return actionOk();
}

/** Undo a code linked to the wrong material. The material and its history stay. */
export async function unlinkBarcode(formData: FormData): Promise<void> {
  const user = await authorize('stock.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const link = await prisma.productBarcode.findUnique({
    where: { id },
    select: { code: true, itemId: true, item: { select: { name: true } } },
  });
  if (!link) return;

  await prisma.productBarcode.delete({ where: { id } });
  await recordAudit(user, {
    action: 'update',
    entity: 'stock',
    entityId: link.itemId,
    summary: `${link.item.name} — barcode ${link.code} unlinked`,
  });
  revalidateAll();
}
