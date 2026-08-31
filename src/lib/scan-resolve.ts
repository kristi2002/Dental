import type { ScanResolution } from '@/lib/actions/scan';
import { parseScan } from '@/lib/barcode';
import type { ScanIndex } from '@/lib/scan-index';
import { parseStockLabel } from '@/lib/stock-labels';

/**
 * Resolve a scan in the browser, from the index that came down with the page.
 *
 * The same three steps `lookupScan` takes on the server, minus the one that
 * needs the database: our own shelf label first, then the symbol's normalised
 * key against the linked codes. Everything it uses — `parseStockLabel`,
 * `parseScan`, and a plain object — is already pure and already client-safe;
 * they were written that way and nothing had asked them to prove it.
 *
 * **What it deliberately cannot answer.** Whether the scanned lot is already on
 * record, and therefore `batch` and `expired`. That needs a query, so it stays
 * null here and the server fills it in a moment later. A basket line with no lot
 * attached still commits correctly: `recordConsumption` falls back to
 * oldest-first, which is what it does for every material that is not lot-tracked
 * anyway.
 *
 * The point is not to replace the server call. It is that the beep, the sound,
 * and the line appearing no longer wait for one — and still happen when there is
 * no network to wait for.
 */
export function resolveLocally(raw: string, index: ScanIndex): ScanResolution | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const label = parseStockLabel(trimmed);
  // A product label names a family rather than a box and this console has
  // nowhere to ask which variant was meant, so it is left to the server, which
  // resolves it only when the product has a single variant. Same rule, one
  // place — see `resolveOwnLabel`.
  if (label?.kind === 'item') {
    const item = index.items[label.id];
    if (item) return fromItem(trimmed, 'plain', trimmed, item, 1);
    return null;
  }
  if (label) return null;

  const scan = parseScan(trimmed);
  if (!scan.key) return null;

  const link = index.codes[scan.key];
  if (!link) return null;

  const item = index.items[link.itemId];
  if (!item) return null;

  return {
    raw: scan.raw,
    format: scan.format,
    key: scan.key,
    lotNumber: scan.lotNumber,
    serial: scan.serial,
    expiryDate: isoDay(scan.expiryDate),
    manufacturedAt: isoDay(scan.manufacturedAt),
    // A symbol stating its own count (AI 30) outranks the pack size on the
    // link: the carton says what is in *this* carton. Same precedence as the
    // server's, and it has to be — the two answers land in the same basket.
    packQty: scan.countedQuantity ?? link.packQty ?? 1,
    item: {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      minLimit: item.minLimit,
      code: item.code,
    },
    batch: null,
    expired: false,
  };
}

function fromItem(
  raw: string,
  format: ScanResolution['format'],
  key: string,
  item: ScanIndex['items'][string],
  packQty: number,
): ScanResolution {
  return {
    raw,
    format,
    key,
    lotNumber: null,
    serial: null,
    expiryDate: null,
    manufacturedAt: null,
    packQty,
    item: {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      minLimit: item.minLimit,
      code: item.code,
    },
    batch: null,
    expired: false,
  };
}

/** `Date` → `YYYY-MM-DD`, matching what the server puts on the wire. */
function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}
