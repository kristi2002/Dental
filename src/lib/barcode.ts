/**
 * Reading what is actually printed on the box.
 *
 * A dental supplier's carton does not carry "a QR code" in the sense a poster
 * does. It carries a GS1 symbol — a DataMatrix, a QR, or a linear GS1-128 —
 * whose payload is a run of *element strings*: an application identifier saying
 * what comes next, then the value. `01` is the product, `10` is the lot, `17` is
 * the expiry. In the EU every medical device carries one by law, as its UDI.
 *
 * Which is the whole reason scanning is worth building here: the schema already
 * has `StockBatch.lotNumber` and `StockBatch.expiryDate`, and today somebody
 * squints at a box and types them. The symbol on that box already holds both,
 * exactly, and a scanner reads it in a quarter of a second.
 *
 * Three encodings reach us and all three mean the same thing:
 *
 *   `]d201095060001343521017261231`   element string, FNC1-separated
 *   `https://ex.com/01/09506000134352/10/ABC?17=261231`   GS1 Digital Link
 *   `5901234123457`                    a bare EAN-13 off an older box
 *
 * Pure and dependency-free, so the cases that actually bite — a lot number
 * containing digits that look like the next AI, `DD=00` meaning end-of-month, a
 * two-digit year either side of the century — are testable without a camera or a
 * database. `parseScan` is the only entry point; everything else is its parts.
 */

/** How the symbol encoded what it was carrying. */
export type ScanFormat = 'gs1-element' | 'gs1-digital-link' | 'plain';

export type ParsedScan = {
  /** Exactly what the scanner handed us, kept for the unknown-code queue. */
  raw: string;
  format: ScanFormat;
  /**
   * What `ProductBarcode.code` is matched on.
   *
   * A GTIN-14 whenever one could be read, so the same carton resolves to one
   * material whether it was scanned off its EAN-13 or off its DataMatrix.
   * Otherwise the raw text, which is what a code the practice printed itself
   * will be.
   */
  key: string;
  gtin: string | null;
  lotNumber: string | null;
  serial: string | null;
  expiryDate: Date | null;
  manufacturedAt: Date | null;
  /** AI 30, on the rare symbol that states its own count. */
  countedQuantity: number | null;
};

/** FNC1 as scanners emit it: ASCII group separator. */
const GS = '';

/**
 * Symbology identifiers a scanner prefixes when configured to transmit them —
 * `]d2` DataMatrix, `]C1` GS1-128, `]Q3` QR, `]e0` GS1 DataBar. They say which
 * symbol was read, not what it said, and a scanner that sends them is a scanner
 * whose codes would otherwise never match one that does not.
 */
const SYMBOLOGY = /^\](?:d2|C1|Q3|e0|E0|d1|Q1)/;

/**
 * Application identifiers whose value length is fixed by the specification, and
 * which therefore need no separator after them.
 *
 * This table is why the parser is not a regex. After a fixed-length AI the next
 * AI starts immediately; after a variable-length one it does not start until a
 * separator or the end of the payload. Guess wrong on a lot number like
 * `17ABC` and you have silently read an expiry date out of the middle of it.
 */
const FIXED_LENGTH: Record<string, number> = {
  '00': 18,
  '01': 14,
  '02': 14,
  '03': 14,
  '04': 16,
  '11': 6,
  '12': 6,
  '13': 6,
  '14': 6,
  '15': 6,
  '16': 6,
  '17': 6,
  '18': 6,
  '19': 6,
  '20': 2,
  '31': 6,
  '32': 6,
  '33': 6,
  '34': 6,
  '35': 6,
  '36': 6,
  '41': 13,
};

/** How long an AI's own code is, keyed by its first two digits. */
function aiLength(payload: string, at: number): number {
  const two = payload.slice(at, at + 2);
  // 31nn–36nn are four-digit AIs (a measure plus its decimal place); the rest of
  // the ones we care about are two, with 8-prefixed and 24x/39x running to
  // three or four. Anything unrecognised is read as two and then skipped by the
  // separator, which is the safe failure: an unknown AI must not eat the lot.
  if (/^3[1-6]$/.test(two)) return 4;
  if (/^(24|25|39|40|41|42|43|70|71|72|80|81|82|90|91|92|93|94|95|96|97|98|99)$/.test(two)) {
    return two === '41' ? 2 : 3;
  }
  return 2;
}

/** GS1 short names for the AIs a Digital Link may carry in its path. */
const SHORT_NAMES: Record<string, string> = {
  gtin: '01',
  itip: '8006',
  cpid: '8010',
  lot: '10',
  ser: '21',
  cpv: '22',
};

/**
 * `YYMMDD` as the UTC midnight the rest of the app stores dates at.
 *
 * `DD` of `00` is the specification's way of writing "the end of that month",
 * and it is common on expiry dates — a box marked 2026-11 expires when November
 * does. Reading it as day zero would land the batch in October and expire the
 * stock a month early.
 */
export function parseGs1Date(value: string, now: Date = new Date()): Date | null {
  if (!/^\d{6}$/.test(value)) return null;

  const yy = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day > 31) return null;

  const year = gs1Century(yy, now.getUTCFullYear()) + yy;

  // Day 0 → the last day of the stated month, which `Date.UTC` gives by asking
  // for day 0 of the month after it.
  if (day === 0) return new Date(Date.UTC(year, month, 0));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Which century a two-digit year belongs to.
 *
 * The GS1 rule, and it is not "20xx": a date 51–99 years ahead of now is read as
 * the previous century. That is what keeps a 1998 manufacture date on an old
 * instrument from being read as 2098, without breaking a 2071 expiry.
 */
function gs1Century(yy: number, nowYear: number): number {
  const base = Math.floor(nowYear / 100) * 100;
  const diff = yy - (nowYear % 100);
  if (diff >= 51) return base - 100;
  if (diff <= -50) return base + 100;
  return base;
}

/**
 * The check digit a GTIN must end in — modulo 10, weights alternating 3 and 1
 * from the right.
 *
 * Worth checking rather than trusting: a camera reading a curved foil pouch in
 * bad light is the exact situation this digit exists for, and a misread that
 * passes silently links a material to the wrong code forever.
 */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * A GTIN-8, -12, -13 or -14 as the GTIN-14 they are all the short form of.
 *
 * One material, one key. A box scanned off its EAN-13 and the same box scanned
 * off its DataMatrix have to reach the same row on the shelf, and they only do
 * if both are left-padded to fourteen before anything looks them up.
 *
 * Returns null when the check digit disagrees, which is a misread, not a code.
 */
export function normaliseGtin(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return null;

  const padded = digits.padStart(14, '0');
  if (gtinCheckDigit(padded.slice(0, 13)) !== Number(padded[13])) return null;
  return padded;
}

/**
 * Split a GS1 element string into its application identifiers.
 *
 * The separator is only *required* after a variable-length value, and plenty of
 * scanners drop it entirely when the value happens to be the last field. So a
 * variable value runs to the next separator or to the end — never to a guessed
 * length, which is how a lot number gets truncated at 20 characters that were
 * never there.
 */
export function parseElementString(payload: string): Map<string, string> {
  const out = new Map<string, string>();
  let at = 0;

  while (at < payload.length) {
    // A separator between fields, or a run of them.
    if (payload[at] === GS) {
      at += 1;
      continue;
    }

    const ai = payload.slice(at, at + aiLength(payload, at));
    if (!/^\d+$/.test(ai)) break;
    at += ai.length;

    const fixed = FIXED_LENGTH[ai] ?? (ai.length === 4 && /^3[1-6]/.test(ai) ? 6 : undefined);

    let value: string;
    if (fixed !== undefined) {
      value = payload.slice(at, at + fixed);
      at += fixed;
    } else {
      const end = payload.indexOf(GS, at);
      value = payload.slice(at, end === -1 ? undefined : end);
      at = end === -1 ? payload.length : end;
    }

    if (value.length > 0 && !out.has(ai)) out.set(ai, value);
  }

  return out;
}

/**
 * A GS1 Digital Link URI — the form modern packaging carries in a plain QR code,
 * so that a phone with no app on it still reaches the manufacturer's page.
 *
 * `https://host/01/09506000134352/10/ABC123?17=261231`
 *
 * The path holds the product and its qualifiers, in pairs; anything else rides
 * in the query string keyed by its AI. Both spellings of a key are accepted —
 * `01` and `gtin` are the same field, and packaging uses both.
 */
export function parseDigitalLink(uri: string): Map<string, string> | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const out = new Map<string, string>();

  // Pairs, read from the right: the identifier and its qualifiers are the tail
  // of the path, and everything before them is whatever the brand's own site
  // filed the product under.
  for (let i = 0; i + 1 < segments.length; i += 2) {
    const key = SHORT_NAMES[segments[i]] ?? segments[i];
    if (!/^\d{2,4}$/.test(key)) continue;
    out.set(key, decodeURIComponent(segments[i + 1]));
  }

  for (const [rawKey, value] of url.searchParams) {
    const key = SHORT_NAMES[rawKey] ?? rawKey;
    if (!/^\d{2,4}$/.test(key) || out.has(key)) continue;
    out.set(key, value);
  }

  return out.has('01') ? out : null;
}

/**
 * Everything above, behind one call: hand it whatever the scanner emitted and
 * get back what the box says.
 *
 * Never throws and never returns null — an unreadable symbol is still a scan,
 * and the screen has to be able to show it and offer to link it. A payload it
 * cannot make sense of comes back as `plain` with `key` set to the raw text,
 * which is exactly right for a label the practice printed itself.
 */
export function parseScan(input: string, now: Date = new Date()): ParsedScan {
  const raw = input.trim();
  const payload = raw.replace(SYMBOLOGY, '');

  // A bare numeric scan that carries a valid check digit is a GTIN off an older
  // box — no AIs, nothing to separate, and the same product as the DataMatrix
  // beside it. Tested *before* the element-string reader, because "5901234123457"
  // also parses as an application identifier 59 followed by a value, and reading
  // it that way turns an ordinary EAN-13 into an unrecognisable code.
  const bare = payload.includes(GS) ? null : normaliseGtin(payload);

  const fields =
    parseDigitalLink(payload) ??
    (bare || !/^\d{2}/.test(payload) || payload.length <= 4 ? null : parseElementString(payload));

  const format: ScanFormat = !fields
    ? 'plain'
    : payload.startsWith('http')
      ? 'gs1-digital-link'
      : 'gs1-element';

  const gtin = fields?.get('01') ? normaliseGtin(fields.get('01')!) : bare;

  const count = Number.parseInt(fields?.get('30') ?? '', 10);

  return {
    raw,
    format,
    key: gtin ?? payload,
    gtin,
    lotNumber: fields?.get('10') ?? null,
    serial: fields?.get('21') ?? null,
    // 17 is the expiry; 15 is "best before", which is what some consumables
    // carry instead and means the same thing to a cupboard.
    expiryDate: parseGs1Date(fields?.get('17') ?? fields?.get('15') ?? '', now),
    manufacturedAt: parseGs1Date(fields?.get('11') ?? '', now),
    countedQuantity: Number.isFinite(count) && count > 0 ? count : null,
  };
}
