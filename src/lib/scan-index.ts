import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK } from '@/lib/queries';

/**
 * Every symbol the practice has taught the app, handed to the browser at once.
 *
 * Scanning went to the server once per beep. On a wired desk that is invisible;
 * in a storage room on the far side of a clinic it is the difference between a
 * delivery that flows and one that stutters, and when the wifi drops it is the
 * difference between a delivery and nothing at all. The gesture this is built
 * around — pick up carton, beep, put down carton — has no pause in it for a
 * network round trip, and a person whose scanner has stopped answering does not
 * wait: they put the box on the shelf and carry on.
 *
 * So the index comes down with the page. `ProductBarcode` is one small row per
 * symbol the practice has ever linked — a few hundred at most for a clinic this
 * size — and it changes only when somebody teaches the scanner something new.
 *
 * **This is not the authority and must never be treated as one.** The commit is
 * still a server action inside a transaction, and it is what decides whether a
 * box moved: `decrementShelf` re-reads the shelf and clamps inside the write, so
 * a stale `quantity` here can make the screen optimistic and cannot make the
 * database wrong. What this buys is that the screen answers instantly and goes
 * on answering with the network down.
 */

/** What the shelf held when the page was served. Optimistic by construction. */
export type ScanIndexItem = {
  id: string;
  name: string;
  quantity: number;
  minLimit: number;
  code: string | null;
};

export type ScanIndex = {
  /** Normalised symbol → the material it names. The same `key` `parseScan` makes. */
  codes: Record<string, { itemId: string; packQty: number }>;
  /** Material id → its figures. Also serves our own printed shelf labels, which
   *  name a material outright and never pass through `codes`. */
  items: Record<string, ScanIndexItem>;
};

/**
 * The barcode table and the shelf, flattened for the client.
 *
 * Archived materials are left out, matching every other list in the app. A
 * retired material scanned at the console still resolves — `lookupScan` handles
 * that case deliberately, so the console can offer to restore it — and that path
 * stays a server round trip, which is correct: it is a rare event that needs a
 * decision, not a fast one that needs a count.
 */
export async function getScanIndex(): Promise<ScanIndex> {
  const [items, barcodes] = await Promise.all([
    prisma.stockItem.findMany({
      where: ACTIVE_STOCK,
      select: { id: true, name: true, variantName: true, quantity: true, minLimit: true, code: true },
    }),
    prisma.productBarcode.findMany({
      where: { item: ACTIVE_STOCK },
      select: { code: true, packQty: true, itemId: true },
    }),
  ]);

  const index: ScanIndex = { codes: {}, items: {} };

  for (const item of items) {
    index.items[item.id] = {
      id: item.id,
      name: item.variantName ? `${item.name} · ${item.variantName}` : item.name,
      quantity: item.quantity,
      minLimit: item.minLimit,
      code: item.code,
    };
  }

  for (const barcode of barcodes) {
    // A link whose material fell out of the active set above is skipped rather
    // than pointing at nothing — the console would resolve it to a name it
    // cannot show and a count it does not have.
    if (!index.items[barcode.itemId]) continue;
    index.codes[barcode.code] = { itemId: barcode.itemId, packQty: barcode.packQty };
  }

  return index;
}
