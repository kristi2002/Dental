/**
 * The practice's own labels — what goes on the shelf, as opposed to what the
 * supplier printed on the carton.
 *
 * `ProductBarcode` solves the supplier's half: this GTIN is that box. It cannot
 * solve the other half, because most of what a storage room holds carries no
 * symbol worth scanning — a decanted container, a box whose DataMatrix is under
 * the tape, a material the practice made up a name for. Those are exactly the
 * rows somebody types a quantity into by hand today.
 *
 * So the app prints its own. A label is a URL on this app pointing at one
 * material, which makes it work from both ends without a second mechanism:
 *
 *   - the phone's ordinary camera opens it, because it is just a link, and
 *     lands on the screen that asks "how many boxes?"
 *   - the desk scanner and the in-app camera resolve it too, because
 *     `lookupScan` reads it here before it tries `parseScan`.
 *
 * The id is in the path rather than a short code of its own, so that nothing
 * has to be allocated, kept unique or backfilled — a material already has an
 * id. A uuid costs about fourteen characters of symbol density over a short
 * code, which is one QR version and no practical difference on a 30mm
 * sticker.
 */

/**
 * Whose label it is.
 *
 * A **product** label goes on the shelf edge and covers a whole family — eight
 * shades of one composite — and scanning it asks which variant before it asks
 * how many. An **item** label goes on the box itself and needs no such question.
 * A practice will print both, for the same reason `StockProduct` exists at all.
 */
export type StockLabelKind = 'item' | 'product';

/** One character in the URL, because it is repeated on every sticker. */
const SEGMENT: Record<StockLabelKind, string> = { item: 'i', product: 'p' };

const KIND_OF: Record<string, StockLabelKind> = { i: 'item', p: 'product' };

/**
 * The label route, matched loosely on purpose.
 *
 * Anchored at the end and indifferent to everything in front of it, so one
 * sticker keeps working when the practice reaches the app by a different name:
 * printed from `https://dent.example.com/sq/…` and scanned on the clinic LAN as
 * `http://192.168.1.14:3000/…`, it is the same material. Matching the host would
 * turn a router change into a reprint of every label in the storage room.
 */
const LABEL_PATH =
  /\/stock\/q\/([ip])\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/** The locale-less path, which is what `Link` and `redirect` want. */
export function stockLabelPath(kind: StockLabelKind, id: string): string {
  return `/stock/q/${SEGMENT[kind]}/${id}`;
}

/** The absolute URL that gets encoded into the symbol. */
export function stockLabelUrl(
  origin: string,
  locale: string,
  kind: StockLabelKind,
  id: string,
): string {
  return `${origin.replace(/\/$/, '')}/${locale}${stockLabelPath(kind, id)}`;
}

/**
 * What a scan of one of our own labels names, or null for anything else.
 *
 * Null is the ordinary answer, not a failure: every supplier symbol in the
 * storage room lands here first and falls through to `parseScan`. So this has to
 * be strict about what it claims — a GS1 Digital Link is a URL too, and reading
 * one as a shelf label would send a scanned carton to the wrong material.
 */
export function parseStockLabel(raw: string): { kind: StockLabelKind; id: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // The pathname where it parses as a URL, the whole string where it does not —
  // a query string on the end is somebody's link tracking, not part of the id.
  let subject = trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    subject = url.pathname;
  } catch {
    // Not a URL. A label typed into the manual box by hand is still a label.
  }

  const match = LABEL_PATH.exec(subject);
  if (!match) return null;

  return { kind: KIND_OF[match[1].toLowerCase()], id: match[2].toLowerCase() };
}
