/**
 * One-off: load the practice's real storage room out of `dental_inventory_template_v5.xlsm`.
 *
 *     npx tsx --env-file=.env prisma/import-inventory.ts          # dry run
 *     npx tsx --env-file=.env prisma/import-inventory.ts --apply
 *     npx tsx --env-file=.env prisma/import-inventory.ts --undo --apply
 *
 * Point `DATABASE_URL` at whichever database should receive it. The runtime
 * image carries no `tsx`, so this cannot run inside the container — see
 * `docker/entrypoint.sh`; run it from a machine that can reach the database.
 *
 * Safe to run twice. A material whose article number is already on file is
 * skipped whole, so a second run never duplicates a row or overwrites a count
 * somebody has since corrected.
 *
 * `--undo` takes the load back out again, for the first run that lands wrong.
 * It removes only materials that still look exactly as they were imported: one
 * `opening balance` line and nothing else. The moment somebody has taken one off
 * the shelf, that material has a history worth more than this script's tidiness,
 * and it is left where it is.
 *
 * ## What the sheet said, and where it goes
 *
 * | Sheet column          | Here                                  |
 * | --------------------- | ------------------------------------- |
 * | Article Name          | `StockItem.name`, less the unit suffix |
 * | Product ID            | `StockItem.code`                      |
 * | Unit Purchase Price   | `StockItem.unitPrice` + the lot's      |
 * | Purchased Qty         | `StockBatch.quantity`                 |
 * | Used Stock            | `StockBatch.usedQuantity`             |
 * | Left Stock (=F−H)     | `StockItem.quantity`                  |
 * | Purchase Date         | `StockBatch.purchasedAt`              |
 * | Manufacture Date      | `StockBatch.manufacturedAt`           |
 * | Expiry Date           | `StockBatch.expiryDate`               |
 * | Thresholds!Min Stock  | `StockItem.minLimit`                  |
 *
 * The rows below are transcribed from the workbook rather than parsed from it:
 * the file is a one-time hand-over, and a table that can be read and corrected
 * in a diff is worth more here than a spreadsheet parser and its dependency.
 *
 * ## Three judgement calls, stated out loud
 *
 * **Used stock writes no consumption movements.** The sheet records *how many*
 * have gone and never *when*, so every one of them would have to be dated today.
 * `reorder.ts` reads the last 90 days of negative movements as the burn rate —
 * 22 Spident Flow "used" this morning would put the whole cupboard on an urgent
 * order list built from a day that never happened. The figure is kept where it
 * is true (`StockBatch.usedQuantity`, so the lot's remainder matches the shelf)
 * and the ledger gets one positive `opening balance` line per material instead.
 *
 * **A material with no threshold gets `minLimit` 0, not the app's default of 5.**
 * The sheet's own formula falls back to 999999 — "never warn me". Zero is the
 * closest this app has to that: it warns when the shelf is empty and not before.
 * Five would invent an alarm on thirteen materials the dentist never set one for,
 * and a low-stock list that is wrong on day one is one nobody reads afterwards.
 *
 * **Categories are inferred from the names.** The sheet has no category column,
 * and the stocktake screen groups by category so the room can be walked shelf by
 * shelf — 43 materials in one flat list is the thing that makes counting slow.
 * They are written into the table below rather than derived by a rule, so any
 * one of them is a one-line correction. Each distinct one becomes a
 * `StockCategory` the practice can then rename, and every material points at it.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');

/** The reason written on the one movement an imported material starts life with. */
const OPENING = 'opening balance';

type SheetRow = {
  /** Product ID, as written on the shelf label. */
  code: string;
  /** Article Name, verbatim — including the unit in brackets, which `splitUnit` takes off. */
  name: string;
  category: string;
  /** Purchase Date, `YYYY-MM-DD`. */
  bought?: string;
  /** Unit Purchase Price. */
  price?: number;
  /** Purchased Qty. Absent where the sheet never recorded a delivery. */
  qty?: number;
  /** Used Stock. */
  used: number;
  /** Manufacture Date. */
  made?: string;
  /** Expiry Date. */
  expires?: string;
  /** Thresholds!Min Stock. Absent where the sheet has no row for this id. */
  min?: number;
};

/**
 * The Inventory sheet, rows 2–44.
 *
 * Note `2022` in the Thresholds sheet, which is a typo for `1022` (Freza FO-25 —
 * every other Freza is there and that one is not). It is left uncorrected here
 * because it makes no difference: the value is 0, and 0 is also what a material
 * with no threshold gets.
 */
const ROWS: SheetRow[] = [
  { code: '1001', name: 'Articaine INIBSA (kuti 50)', category: 'Farmaceutike', bought: '2025-02-20', price: 2214.28, qty: 28, used: 6, made: '2024-02-01', expires: '2026-02-01', min: 2 },
  { code: '1002', name: 'Lidocine me adrenaline (flakon)', category: 'Farmaceutike', price: 198, qty: 6, used: 2, expires: '2025-07-01', min: 2 },
  { code: '1003', name: 'Shiringa plastike 2cc 23G (kuti 100)', category: 'Instrumente', bought: '2025-04-14', price: 400, qty: 30, used: 2, made: '2023-11-01', expires: '2028-11-01', min: 3 },
  { code: '1004', name: 'Age C-K JECT 12mm 30g (kuti)', category: 'Instrumente', qty: 2, used: 0, made: '2022-12-01', expires: '2027-11-01', min: 1 },
  { code: '1005', name: 'Age C-K JECT 25mm 30g (kuti)', category: 'Instrumente', qty: 2, used: 0, made: '2022-12-01', expires: '2027-11-01', min: 1 },
  { code: '1006', name: 'Age', category: 'Instrumente', used: 0 },
  { code: '1007', name: 'Alginat LASCOD (cope)', category: 'Materiale', bought: '2025-03-15', price: 500, qty: 24, used: 0, expires: '2029-06-01', min: 3 },
  { code: '1008', name: 'Silikon Zeta Plus (kit)', category: 'Materiale', price: 3500, qty: 12, used: 10, expires: '2028-01-01', min: 2 },
  { code: '1009', name: 'Silikon Zeta Elite HD puty (cope)', category: 'Materiale', used: 0 },
  { code: '1010', name: 'Silikon Zeta Elite HD light (cope)', category: 'Materiale', used: 0 },
  { code: '1011', name: '3M Ketac (cope)', category: 'Materiale', bought: '2025-04-01', qty: 15, used: 1, made: '2024-07-22', expires: '2027-07-22', min: 1 },
  { code: '1012', name: 'FGM All Cem Core Rezine (cope)', category: 'Materiale', bought: '2025-04-24', price: 3200, qty: 15, used: 1, made: '2024-09-18', expires: '2026-09-18', min: 2 },
  { code: '1013', name: 'Spident Acid (cope)', category: 'Materiale', qty: 14, used: 0, made: '2022-12-01', expires: '2025-11-30' },
  { code: '1014', name: 'Spident Flow (cope)', category: 'Materiale', bought: '2025-02-15', price: 700, qty: 60, used: 22, made: '2024-10-18', expires: '2027-10-17', min: 4 },
  { code: '1015', name: 'Kompozit 3M Z250 (kit)', category: 'Materiale', bought: '2025-04-15', price: 25000, qty: 10, used: 1, expires: '2027-04-24', min: 2 },
  { code: '1016', name: 'Kompozit Dentex Estetic', category: 'Materiale', used: 0, min: 0 },
  { code: '1017', name: 'Kompozit Dentex Posterior', category: 'Materiale', used: 0, min: 0 },
  { code: '1018', name: 'Freza SI-48', category: 'Instrumente', qty: 2, used: 0, min: 0 },
  { code: '1019', name: 'Freza FO-30F', category: 'Instrumente', bought: '2025-05-30', price: 860, qty: 4, used: 0, min: 0 },
  { code: '1020', name: 'Freza FO-21', category: 'Instrumente', qty: 1, used: 0, min: 0 },
  { code: '1021', name: 'Freza FO-22F', category: 'Instrumente', qty: 1, used: 0, min: 0 },
  { code: '1022', name: 'Freza FO-25', category: 'Instrumente', qty: 1, used: 0 },
  { code: '1023', name: 'Freza FO-32', category: 'Instrumente', qty: 3, used: 0, min: 0 },
  { code: '1024', name: 'Freza TR-11', category: 'Instrumente', bought: '2025-05-30', price: 860, qty: 2, used: 0, min: 0 },
  { code: '1025', name: 'Freza TR-13C', category: 'Instrumente', bought: '2025-05-30', price: 860, qty: 4, used: 0, min: 0 },
  { code: '1026', name: 'Freza BR-40', category: 'Instrumente', qty: 2, used: 0, min: 0 },
  { code: '1027', name: 'Freza BR-46', category: 'Instrumente', qty: 1, used: 0, min: 0 },
  { code: '1028', name: 'Freza TC-11C', category: 'Instrumente', bought: '2025-05-30', price: 860, qty: 4, used: 0, min: 0 },
  { code: '1029', name: 'Freza TC-11EF', category: 'Instrumente', bought: '2025-05-30', price: 790, qty: 4, used: 0, min: 0 },
  { code: '1030', name: 'Freza TC-S21', category: 'Instrumente', qty: 2, used: 1, min: 0 },
  { code: '1031', name: 'Freza EX-11', category: 'Instrumente', qty: 1, used: 0, min: 0 },
  { code: '1032', name: 'Freza EX-12', category: 'Instrumente', bought: '2025-05-30', price: 790, qty: 4, used: 0, min: 0 },
  { code: '1033', name: 'Kanjula Euronda (pako)', category: 'Konsumueshme', bought: '2025-02-10', price: 250, qty: 50, used: 12, min: 5 },
  { code: '1034', name: 'Pambuk role (pako)', category: 'Konsumueshme', bought: '2025-02-10', price: 250, qty: 60, used: 6, min: 5 },
  { code: '1035', name: 'Mantelina (kuti)', category: 'Higjienë', bought: '2025-02-10', price: 900, qty: 10, used: 3, min: 2 },
  { code: '1036', name: 'Vaj anglash BMS (shishe)', category: 'Konsumueshme', bought: '2025-02-10', price: 1300, qty: 10, used: 3 },
  { code: '1037', name: 'Fiziologjik sol (flakon)', category: 'Farmaceutike', used: 0 },
  { code: '1038', name: 'Doreza Sentino Puder M (koli 10)', category: 'Higjienë', bought: '2025-04-24', used: 0 },
  { code: '1039', name: 'Doreza M (koli 10)', category: 'Higjienë', used: 0 },
  { code: '1040', name: 'Doreza S (koli 10)', category: 'Higjienë', bought: '2025-04-24', used: 0 },
  { code: '1041', name: 'Doreza S (koli 10)', category: 'Higjienë', used: 0 },
  { code: '1042', name: 'Maska SV MEGA (kuti 50)', category: 'Higjienë', bought: '2025-04-24', price: 120, qty: 98, used: 1 },
  { code: '1043', name: 'Maska Euronda Black (kuti 50)', category: 'Higjienë', qty: 4, used: 3 },
];

/** The sheet writes `cope`; the rest of the app writes `copë`. One unit, one spelling. */
const UNIT_SPELLING: Record<string, string> = { cope: 'copë' };

/**
 * Take the unit out of the name: `"Articaine INIBSA (kuti 50)"` is one material
 * counted in boxes of fifty, written that way only because the sheet had nowhere
 * else to put it. This app has `unit` and `packSize`, and the order form reads
 * them — leaving it in the name would keep the information decorative.
 *
 * Anything without a bracketed unit is counted in pieces, which is what the
 * whole Freza block is.
 */
function splitUnit(sheetName: string): { name: string; unit: string; packSize: number } {
  const match = sheetName.match(/^(.*?)\s*\(([\p{L}]+)(?:\s+(\d+))?\)\s*$/u);
  if (!match) return { name: sheetName.trim(), unit: 'copë', packSize: 1 };

  const [, name, rawUnit, pack] = match;
  const unit = rawUnit.toLowerCase();
  return {
    name: name.trim(),
    unit: UNIT_SPELLING[unit] ?? unit,
    packSize: pack ? Number.parseInt(pack, 10) : 1,
  };
}

/** UTC midnight, the same day boundary every other date in this app is stored on. */
function day(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/**
 * Take the load back out.
 *
 * Only where nothing has happened since: one `opening balance` movement and no
 * other. A material somebody has already used has a ledger, and a ledger is the
 * thing this whole feature exists to protect — it stays, and is named in the
 * output so the decision is visible rather than silent.
 *
 * The categories stay too. They are a list the practice can rename and file
 * anything under, not a by-product of this load, and removing five shelves to
 * undo forty-three materials would take the ones somebody added by hand with them.
 */
async function undo() {
  const codes = ROWS.map((row) => row.code);
  const items = await prisma.stockItem.findMany({
    where: { code: { in: codes } },
    select: {
      id: true,
      code: true,
      name: true,
      movements: { select: { id: true, reason: true } },
    },
  });

  let removed = 0;
  const kept: string[] = [];

  for (const item of items) {
    const touched = item.movements.filter((movement) => movement.reason !== OPENING);
    if (touched.length > 0) {
      kept.push(`#${item.code} ${item.name} — ${touched.length} movement(s) since the import`);
      continue;
    }

    removed += 1;
    if (!APPLY) continue;

    await prisma.$transaction([
      // `StockMovement` is `Restrict` on its item — the ledger has to go first,
      // and only ever this one line of it.
      prisma.stockMovement.deleteMany({ where: { itemId: item.id } }),
      prisma.stockBatch.deleteMany({ where: { itemId: item.id } }),
      prisma.stockItem.delete({ where: { id: item.id } }),
    ]);
  }

  console.log(`Imported materials on file: ${items.length}`);
  console.log(`  to remove:                ${removed}`);
  if (kept.length > 0) {
    console.log('\nLeft alone — used since the import:');
    for (const note of kept) console.log(`  · ${note}`);
  }
  console.log(APPLY ? '\nRemoved.' : '\nDry run — nothing written. Re-run with --apply.');
  await prisma.$disconnect();
}

/**
 * The shelves the sheet's materials go on.
 *
 * Matched case-insensitively against whatever the practice has already named, so
 * a second run — or a run against a database where somebody has since typed
 * "Instrumente" by hand — files everything on the one shelf rather than beside
 * it. A dry run creates nothing and therefore resolves nothing; the count it
 * prints is what an `--apply` would add.
 */
async function resolveCategories(names: string[]): Promise<{
  ids: Map<string, string>;
  created: number;
}> {
  const known = new Map(
    (await prisma.stockCategory.findMany({ select: { id: true, name: true } })).map((category) => [
      category.name.toLowerCase(),
      category.id,
    ]),
  );

  const ids = new Map<string, string>();
  let created = 0;

  for (const name of new Set(names)) {
    const existing = known.get(name.toLowerCase());
    if (existing) {
      ids.set(name, existing);
      continue;
    }

    created += 1;
    if (!APPLY) continue;

    const row = await prisma.stockCategory.create({ data: { name }, select: { id: true } });
    known.set(name.toLowerCase(), row.id);
    ids.set(name, row.id);
  }

  return { ids, created };
}

async function main() {
  if (UNDO) return undo();

  const existing = await prisma.stockItem.findMany({
    where: { OR: [{ code: { not: null } }, { archivedAt: null }] },
    select: { code: true, name: true },
  });
  const takenCodes = new Set(existing.map((item) => item.code).filter(Boolean));
  const takenNames = new Map(existing.map((item) => [item.name.toLowerCase(), item.name]));

  const categories = await resolveCategories(ROWS.map((row) => row.category));

  console.log(`Sheet: ${ROWS.length} materials. Already on file: ${takenCodes.size} numbered.\n`);

  let created = 0;
  let skipped = 0;
  let lots = 0;
  let onHand = 0;
  let value = new Prisma.Decimal(0);
  const notes: string[] = [];
  const seenNames = new Map<string, string>();

  for (const row of ROWS) {
    if (takenCodes.has(row.code)) {
      skipped += 1;
      notes.push(`#${row.code} ${row.name} — already on file, left alone`);
      continue;
    }

    const { name, unit, packSize } = splitUnit(row.name);
    const purchased = row.qty ?? 0;
    // The sheet's Left Stock column, recomputed rather than transcribed: it is a
    // formula, and deriving it here means a mistyped Used Stock cannot quietly
    // disagree with the count it is supposed to explain.
    const quantity = Math.max(0, purchased - row.used);
    const price = row.price === undefined ? null : new Prisma.Decimal(row.price.toFixed(2));

    // A material nobody set a threshold for is one nobody wants warnings about.
    const minLimit = row.min ?? 0;

    const duplicate = seenNames.get(name.toLowerCase());
    if (duplicate) notes.push(`#${row.code} ${name} — same name as #${duplicate}, both imported`);
    seenNames.set(name.toLowerCase(), row.code);

    const clash = takenNames.get(name.toLowerCase());
    if (clash) notes.push(`#${row.code} ${name} — a material of this name already exists, not merged`);

    if (name.length < 4) notes.push(`#${row.code} "${name}" — name looks unfinished in the sheet`);

    const expiry = day(row.expires);
    if (expiry && expiry.getTime() < Date.now()) {
      notes.push(`#${row.code} ${name} — its lot expired ${row.expires}, arrives flagged`);
    }

    created += 1;
    onHand += quantity;
    if (price) value = value.add(price.mul(quantity));
    if (purchased > 0) lots += 1;

    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.create({
        data: {
          name,
          code: row.code,
          categoryId: categories.ids.get(row.category),
          quantity,
          minLimit,
          unit,
          packSize,
          unitPrice: price,
        },
        select: { id: true },
      });

      // Only where the sheet actually recorded a delivery. A lot of zero says
      // nothing and would sit on the row as an empty chip forever.
      if (purchased > 0) {
        await tx.stockBatch.create({
          data: {
            itemId: item.id,
            quantity: purchased,
            // Where it went is unknown — only how much. The remainder still
            // matches the shelf, which is what the allocation reads.
            usedQuantity: row.used,
            purchasedAt: day(row.bought),
            manufacturedAt: day(row.made),
            expiryDate: expiry,
            unitPrice: price,
            notes: 'Imported from the inventory sheet',
          },
        });
      }

      // One line to explain where the counter came from. Positive, so the burn
      // rate in `reorder.ts` — which reads only what went *out* — ignores it.
      if (quantity > 0) {
        await tx.stockMovement.create({
          data: { itemId: item.id, delta: quantity, reason: OPENING },
        });
      }
    });
  }

  console.log(`Materials to create: ${created}${skipped ? `  (skipped ${skipped} already numbered)` : ''}`);
  console.log(`  categories added:  ${categories.created}`);
  console.log(`  lots recorded:     ${lots}`);
  console.log(`  units on hand:     ${onHand}`);
  console.log(`  priced at:         ${value.toFixed(2)}`);

  if (notes.length > 0) {
    console.log('\nWorth a look:');
    for (const note of notes) console.log(`  · ${note}`);
  }

  console.log(APPLY ? '\nApplied.' : '\nDry run — nothing written. Re-run with --apply.');
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
