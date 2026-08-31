/**
 * Reading a price list or a storage-room list somebody else kept.
 *
 * The same errand as `patients-import.ts` and the same judgement behind it — the
 * file will not be clean, and refusing it is not an answer — applied to the two
 * lists a practice arrives holding besides its patients: the treatments it
 * offers, and the materials on its shelves.
 *
 * ## What a catalogue import does and does not do
 *
 * It writes **what a thing is**, never how much of it there is. A material comes
 * in with its name, its code, its supplier and its reorder level; its *quantity*
 * does not, and that is deliberate. A count in the app is not a number in a
 * column — it is a `StockBatch` with a purchase date and a price, which is what
 * makes expiry, valuation and "what did we pay last time" work at all. Inventing
 * batches out of a spreadsheet cell would produce a stock page that adds up and
 * a stock *history* that is fiction.
 *
 * So the boundary is: import the catalogue here, then count it with the
 * stocktake screen, which exists for exactly that and records the count as the
 * movement it really is. `prisma/import-inventory.ts` remains the way to load a
 * real inventory with its lots and prices intact.
 *
 * Categories and suppliers arrive as *names* and are matched to the headings the
 * practice already has. A name that matches nothing is created, because the
 * alternative is refusing a whole file over a heading somebody has not typed
 * yet — see `resolveByName` in the action.
 */

import { matchColumns } from './csv-parse';
import { normaliseGtin } from '@/lib/barcode';

/** What can be wrong with a row. Shown against the row on the screen. */
export type CatalogueProblem =
  /** No name. A catalogue row without one is not a thing. */
  | 'noName'
  /** A number column that did not hold a number; the default is used instead. */
  | 'badNumber'
  /** An earlier row of this same file already used the name. */
  | 'duplicateInFile'
  /** The practice already has one under this name. */
  | 'alreadyHere'
  /**
   * A barcode column that did not hold a real GTIN.
   *
   * Not fatal — the material still imports, it just does not become scannable.
   * Refused rather than stored, because `normaliseGtin` checks the check digit
   * and a symbol that fails it is a misread or a typo: linking it would teach
   * the scanner a code no carton in the world carries, and the practice would
   * discover that one beep at a time.
   */
  | 'badBarcode';

const FATAL: ReadonlySet<CatalogueProblem> = new Set<CatalogueProblem>([
  'noName',
  'duplicateInFile',
  'alreadyHere',
]);

export type CatalogueRow<Draft> = {
  /** Which line of the file this was, counting the header as line 1. */
  line: number;
  draft: Draft;
  problems: CatalogueProblem[];
};

export function isCatalogueImportable(row: CatalogueRow<unknown>): boolean {
  return !row.problems.some((problem) => FATAL.has(problem));
}

/** Excel's "this is text" apostrophe, and the spaces around everything. */
function cell(value: string | undefined): string {
  return (value ?? '').replace(/^'/, '').trim();
}

function optional(value: string | undefined): string | null {
  return cell(value) || null;
}

/**
 * A number out of a spreadsheet cell.
 *
 * Both decimal conventions are accepted. `1.234,56` is how this part of the
 * world writes what an English machine writes `1,234.56`, and a price list from
 * a local supplier is full of the first — read naively, `1.234,56` becomes
 * either `1.234` or nothing, and a material is priced at one thousandth of what
 * it cost. Which separator is which is decided by whichever comes *last*, since
 * that is always the decimal one.
 *
 * Returns `null` rather than a default so the caller can tell "not given" from
 * "given and unreadable" — only the second is worth flagging on the screen.
 */
export function parseNumber(value: string | undefined): number | null {
  const text = cell(value).replace(/\s/g, '');
  if (!text) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  let normalised: string;
  if (lastComma === -1 && lastDot === -1) normalised = text;
  else if (lastComma > lastDot) {
    // Comma is the decimal point; dots are thousands separators.
    normalised = text.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = text.replace(/,/g, '');
  }

  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Matched through `normaliseHeader`, so only the words need listing. */
const SERVICE_ALIASES = {
  name: ['Emri', 'Nome', 'Name', 'Trajtimi', 'Treatment', 'Service', 'Prestazione'],
  category: ['Kategoria', 'Categoria', 'Category', 'Department', 'Reparti'],
  durationMin: ['Kohëzgjatja', 'Durata', 'Duration', 'Minutes', 'Minuta', 'Min'],
} as const;

export type ServiceDraft = {
  name: string;
  category: string | null;
  durationMin: number;
};

/** The catalogue's own default, matching what the treatment form offers. */
const DEFAULT_DURATION = 30;

/** Below this a slot is not a slot; `saveService` clamps the same way. */
const MIN_DURATION = 5;

export type CatalogueReading<Draft> = {
  columns: Record<string, number>;
  /** Required fields the file has no column for at all. */
  missing: string[];
  rows: CatalogueRow<Draft>[];
};

export function readServices(grid: readonly string[][]): CatalogueReading<ServiceDraft> {
  const [header, ...body] = grid;
  const columns = matchColumns(header ?? [], SERVICE_ALIASES);
  const missing = columns.name === -1 ? ['name'] : [];

  const at = (row: readonly string[], field: keyof typeof SERVICE_ALIASES) =>
    columns[field] === -1 ? undefined : row[columns[field]];

  const claimed = new Set<string>();
  const rows: CatalogueRow<ServiceDraft>[] = [];

  for (const [index, raw] of body.entries()) {
    const problems: CatalogueProblem[] = [];
    const name = cell(at(raw, 'name'));
    if (!name) problems.push('noName');

    const key = name.toLocaleLowerCase();
    if (name && claimed.has(key)) problems.push('duplicateInFile');
    else if (name) claimed.add(key);

    const rawDuration = cell(at(raw, 'durationMin'));
    const parsed = parseNumber(rawDuration);
    // Only a fault if something was written and could not be read. A blank
    // duration column is an ordinary gap that the default answers.
    if (rawDuration && parsed === null) problems.push('badNumber');

    rows.push({
      line: index + 2,
      draft: {
        name,
        category: optional(at(raw, 'category')),
        durationMin: Math.max(MIN_DURATION, Math.round(parsed ?? DEFAULT_DURATION)),
      },
      problems,
    });
  }

  return { columns, missing, rows };
}

const STOCK_ALIASES = {
  name: ['Emri', 'Nome', 'Name', 'Materiali', 'Material', 'Article', 'Article name', 'Produkti'],
  code: ['Kodi', 'Codice', 'Code', 'Article number', 'Product ID', 'SKU'],
  /**
   * The symbol actually printed on the carton, as distinct from the practice's
   * own article number beside it.
   *
   * `Barcode` and `Barkodi` used to be aliases of `code`, which quietly wasted
   * the one column that could bootstrap the scanner: a spreadsheet headed
   * "Barcode" full of real EANs landed in `StockItem.code` — a free-text article
   * number nothing scans — and the storage room stayed unscannable until
   * somebody linked all seventy products one carton at a time.
   *
   * That is the whole adoption cliff in front of every scanning feature in this
   * app, and a supplier's own price list already has this column.
   */
  gtin: ['Barcode', 'Barkodi', 'GTIN', 'EAN', 'EAN13', 'UPC', 'Kodi i barit'],
  category: ['Kategoria', 'Categoria', 'Category', 'Rafti', 'Shelf'],
  supplier: ['Furnitori', 'Fornitore', 'Supplier', 'Vendor'],
  unit: ['Njësia', 'Unità', 'Unit', 'Njesia'],
  minLimit: ['Minimumi', 'Minimo', 'Minimum', 'Reorder level', 'Min'],
  packSize: ['Në paketë', 'Confezione', 'Pack size', 'Pack'],
  unitPrice: ['Çmimi', 'Prezzo', 'Price', 'Unit price', 'Cmimi'],
} as const;

export type StockDraft = {
  name: string;
  code: string | null;
  /** A validated, 14-digit GTIN to teach the scanner, or null. */
  gtin: string | null;
  category: string | null;
  supplier: string | null;
  unit: string;
  minLimit: number;
  packSize: number;
  unitPrice: number | null;
};

/** The column defaults, matching what `StockItem` declares. */
const DEFAULT_UNIT = 'box';
const DEFAULT_MIN_LIMIT = 5;
const DEFAULT_PACK_SIZE = 1;

export function readStockItems(grid: readonly string[][]): CatalogueReading<StockDraft> {
  const [header, ...body] = grid;
  const columns = matchColumns(header ?? [], STOCK_ALIASES);
  const missing = columns.name === -1 ? ['name'] : [];

  const at = (row: readonly string[], field: keyof typeof STOCK_ALIASES) =>
    columns[field] === -1 ? undefined : row[columns[field]];

  const claimed = new Set<string>();
  const rows: CatalogueRow<StockDraft>[] = [];

  for (const [index, raw] of body.entries()) {
    const problems: CatalogueProblem[] = [];
    const name = cell(at(raw, 'name'));
    const code = optional(at(raw, 'code'));
    if (!name) problems.push('noName');

    // A material is claimed by its code when it has one — `StockItem.code` is
    // unique and is what a scanner reads — and by its name when it does not.
    const key = (code ?? name).toLocaleLowerCase();
    if ((code || name) && claimed.has(key)) problems.push('duplicateInFile');
    else if (code || name) claimed.add(key);

    let badNumber = false;
    const number = (field: 'minLimit' | 'packSize' | 'unitPrice', fallback: number | null) => {
      const written = cell(at(raw, field));
      const parsed = parseNumber(written);
      if (written && parsed === null) badNumber = true;
      return parsed ?? fallback;
    };

    // Validated here rather than trusted. `normaliseGtin` pads every short form
    // up to fourteen and refuses a wrong check digit, so what reaches the
    // database is the one key a scan can be looked up under.
    const writtenGtin = cell(at(raw, 'gtin'));
    const gtin = writtenGtin ? normaliseGtin(writtenGtin) : null;
    if (writtenGtin && gtin === null) problems.push('badBarcode');

    const minLimit = number('minLimit', DEFAULT_MIN_LIMIT)!;
    const packSize = number('packSize', DEFAULT_PACK_SIZE)!;
    const unitPrice = number('unitPrice', null);
    if (badNumber) problems.push('badNumber');

    rows.push({
      line: index + 2,
      draft: {
        name,
        code,
        gtin,
        category: optional(at(raw, 'category')),
        supplier: optional(at(raw, 'supplier')),
        unit: optional(at(raw, 'unit')) ?? DEFAULT_UNIT,
        // Whole units, never negative: a reorder level is a count of things on
        // a shelf, and a spreadsheet full of `2,5` should not produce one.
        minLimit: Math.max(0, Math.round(minLimit)),
        packSize: Math.max(1, Math.round(packSize)),
        // A price may be fractional; it is money.
        unitPrice: unitPrice === null ? null : Math.max(0, unitPrice),
      },
      problems,
    });
  }

  return { columns, missing, rows };
}
