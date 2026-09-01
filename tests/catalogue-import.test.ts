import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isCatalogueImportable,
  parseNumber,
  readServices,
  readStockItems,
} from '../src/lib/catalogue-import';
import { parseCsv } from '../src/lib/csv-parse';

const services = (text: string) => readServices(parseCsv(text));
const stock = (text: string) => readStockItems(parseCsv(text));

describe('parseNumber — both decimal conventions', () => {
  it('reads a plain number', () => {
    assert.equal(parseNumber('30'), 30);
    assert.equal(parseNumber(' 30 '), 30);
  });

  it('reads a comma decimal, which is how it is written here', () => {
    assert.equal(parseNumber('12,50'), 12.5);
  });

  it('reads a dot decimal, which is how an English machine writes it', () => {
    assert.equal(parseNumber('12.50'), 12.5);
  });

  it('reads thousands separators of either kind', () => {
    // The failure this prevents: read naively, `1.234,56` becomes 1.234 and a
    // material is priced at one thousandth of what it cost.
    assert.equal(parseNumber('1.234,56'), 1234.56);
    assert.equal(parseNumber('1,234.56'), 1234.56);
  });

  it('tells "not given" apart from "given and unreadable"', () => {
    assert.equal(parseNumber(''), null);
    assert.equal(parseNumber('   '), null);
    assert.equal(parseNumber('about ten'), null);
  });

  it('strips the apostrophe a spreadsheet writes in front of text', () => {
    assert.equal(parseNumber("'42"), 42);
  });
});

describe('readServices — a price list', () => {
  it('finds its columns in any of the three languages', () => {
    assert.deepEqual(services('Emri;Kategoria;Kohëzgjatja\nMbushje;Terapi;45\n').missing, []);
    assert.deepEqual(services('Nome;Categoria;Durata\nOtturazione;Terapia;45\n').missing, []);
    assert.deepEqual(services('Name;Category;Duration\nFilling;Restorative;45\n').missing, []);
  });

  it('says so when the file has no name column at all', () => {
    assert.deepEqual(services('Kategoria;Kohëzgjatja\nTerapi;45\n').missing, ['name']);
  });

  it('reads a row into a treatment', () => {
    const [row] = services('Emri;Kategoria;Kohëzgjatja\nMbushje;Terapi;45\n').rows;
    assert.deepEqual(row.draft, { name: 'Mbushje', category: 'Terapi', durationMin: 45 });
    assert.deepEqual(row.problems, []);
  });

  it('falls back to the catalogue default when no duration is given', () => {
    const [row] = services('Emri\nMbushje\n').rows;
    assert.equal(row.draft.durationMin, 30);
    // A blank column is an ordinary gap, not a fault worth flagging.
    assert.deepEqual(row.problems, []);
  });

  it('flags a duration that was written and could not be read, and still imports', () => {
    const [row] = services('Emri;Kohëzgjatja\nMbushje;half an hour\n').rows;
    assert.deepEqual(row.problems, ['badNumber']);
    assert.equal(row.draft.durationMin, 30);
    assert.ok(isCatalogueImportable(row), 'a bad number must not cost the whole row');
  });

  it('clamps a duration below the shortest slot the app allows', () => {
    assert.equal(services('Emri;Min\nKontroll;2\n').rows[0].draft.durationMin, 5);
  });

  it('catches the same treatment named twice in one file, ignoring case', () => {
    const reading = services('Emri\nMbushje\nMBUSHJE\nHeqje\n');
    assert.deepEqual(reading.rows[0].problems, []);
    assert.deepEqual(reading.rows[1].problems, ['duplicateInFile']);
    assert.deepEqual(reading.rows[2].problems, []);
  });

  it('refuses a row with no name but keeps it visible', () => {
    const [row] = services('Emri;Kategoria\n;Terapi\n').rows;
    assert.deepEqual(row.problems, ['noName']);
    assert.ok(!isCatalogueImportable(row));
  });
});

describe('readStockItems — a storage-room list', () => {
  it('reads a row into a material', () => {
    // The unit and pack-size columns are still in the file, because a supplier's
    // price list has them — and are no longer read into anything, because the
    // shelf is counted in boxes and the two columns they fed have been dropped.
    const [row] = stock(
      'Emri;Kodi;Kategoria;Furnitori;Njësia;Minimumi;Në paketë;Çmimi\n' +
        'Dorashka;GL-100;Higjienë;Dentalux;box;3;100;1.250,00\n',
    ).rows;

    assert.deepEqual(row.draft, {
      name: 'Dorashka',
      code: 'GL-100',
      gtin: null,
      category: 'Higjienë',
      supplier: 'Dentalux',
      minLimit: 3,
      unitPrice: 1250,
    });
    assert.deepEqual(row.problems, []);
  });

  /**
   * The column that decides whether the scanner is ever used.
   *
   * `Barcode` used to be an alias of `code` — the practice's own article number,
   * which nothing scans — so a supplier's price list full of real EANs imported
   * into a storeroom that stayed completely unscannable. Every product then had
   * to be taught to the app one carton at a time, from a failed scan, which is
   * the adoption cliff in front of every scanning feature in the app.
   */
  it('reads a real barcode into the field the scanner looks in', () => {
    const [row] = stock('Emri;Barkodi\nDorashka;5901234123457\n').rows;
    // Padded to fourteen, which is the one key a scan is looked up under.
    assert.equal(row.draft.gtin, '05901234123457');
    assert.equal(row.draft.code, null, 'a barcode is not the practice’s article number');
    assert.deepEqual(row.problems, []);
  });

  it('keeps the article number and the barcode apart when a file has both', () => {
    const [row] = stock('Emri;Kodi;EAN\nDorashka;GL-100;5901234123457\n').rows;
    assert.equal(row.draft.code, 'GL-100');
    assert.equal(row.draft.gtin, '05901234123457');
  });

  it('refuses a barcode that fails its check digit, and still imports the material', () => {
    // A wrong check digit is a misread or a typo. Linking it would teach the
    // scanner a code no carton carries, discovered one failed beep at a time.
    const [row] = stock('Emri;Barkodi\nDorashka;5901234123450\n').rows;
    assert.equal(row.draft.gtin, null);
    assert.deepEqual(row.problems, ['badBarcode']);
    assert.ok(isCatalogueImportable(row), 'the material still imports — it just will not scan');
  });

  it('says nothing about a barcode column left empty', () => {
    const [row] = stock('Emri;Barkodi\nDorashka;\n').rows;
    assert.equal(row.draft.gtin, null);
    assert.deepEqual(row.problems, []);
  });

  it('uses the column defaults the table declares when a file is sparse', () => {
    const [row] = stock('Emri\nDorashka\n').rows;
    assert.equal(row.draft.minLimit, 5);
    assert.equal(row.draft.unitPrice, null);
  });

  it('rounds a count to whole things but leaves a price fractional', () => {
    // A reorder level is a count of boxes on a shelf; a price is money.
    const [row] = stock('Emri;Minimumi;Çmimi\nDorashka;2,6;12,50\n').rows;
    assert.equal(row.draft.minLimit, 3);
    assert.equal(row.draft.unitPrice, 12.5);
  });

  it('walks past the unit and pack-size columns a price list still carries', () => {
    // Both were read into columns nothing on any screen ever displayed, which is
    // how two dead columns went on being filled — see the note on
    // `STOCK_ALIASES`. A supplier's file still has them, so the reader has to
    // ignore them rather than choke on them.
    const [row] = stock('Emri;Njësia;Në paketë;Minimumi\nDorashka;copë;100;3\n').rows;
    assert.deepEqual(row.problems, []);
    assert.equal(row.draft.name, 'Dorashka');
    assert.equal(row.draft.minLimit, 3);
    assert.ok(!('unit' in row.draft));
    assert.ok(!('packSize' in row.draft));
  });

  it('claims a material by its code when it has one', () => {
    // `StockItem.code` is unique and is what a scanner reads, so two rows under
    // one code are the same material however differently they are named.
    const reading = stock('Emri;Kodi\nDorashka M;GL-100\nDorashka mesatare;GL-100\n');
    assert.deepEqual(reading.rows[0].problems, []);
    assert.deepEqual(reading.rows[1].problems, ['duplicateInFile']);
  });

  it('falls back to the name for a material with no code', () => {
    const reading = stock('Emri\nDorashka\nDorashka\n');
    assert.deepEqual(reading.rows[1].problems, ['duplicateInFile']);
  });

  it('carries no quantity column, because a count is a batch and not a cell', () => {
    // Stated as a test because it is the boundary the module is built around:
    // quantities come from the stocktake screen, which records them as the
    // movements they really are.
    const [row] = stock('Emri;Sasia\nDorashka;40\n').rows;
    assert.ok(!('quantity' in row.draft));
  });
});
