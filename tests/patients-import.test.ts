import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CSV_BOM, toCsv } from '../src/lib/csv';
import { parseCsv } from '../src/lib/csv-parse';
import {
  isImportable,
  parseImportDate,
  readPatients,
  type ImportRow,
} from '../src/lib/patients-import';

const read = (text: string) => readPatients(parseCsv(text));
const byLine = (rows: ImportRow[], line: number) => rows.find((row) => row.line === line)!;

describe('parseImportDate — whatever the sending machine writes', () => {
  it('reads an ISO date as itself', () => {
    assert.equal(parseImportDate('1990-04-03'), '1990-04-03');
  });

  it('reads an ambiguous date day-first, because that is how it was written', () => {
    // The failure this prevents is silent: read the American way, 03/04/1990
    // becomes the 4th of March, which is a plausible date and a wrong birthday.
    assert.equal(parseImportDate('03/04/1990'), '1990-04-03');
    assert.equal(parseImportDate('03.04.1990'), '1990-04-03');
    assert.equal(parseImportDate('3-4-1990'), '1990-04-03');
  });

  it('reads an unambiguous day-first date the same way', () => {
    assert.equal(parseImportDate('25/12/1988'), '1988-12-25');
  });

  it('refuses a date that does not exist rather than rolling it forward', () => {
    // `new Date(Date.UTC(1990, 1, 31))` is the 3rd of March, which would be a
    // wrong birthday nobody would ever spot.
    assert.equal(parseImportDate('31/02/1990'), null);
    assert.equal(parseImportDate('32/01/1990'), null);
    assert.equal(parseImportDate('01/13/1990'), null);
  });

  it('refuses something that is plainly not a birthday', () => {
    assert.equal(parseImportDate('n/a'), null);
    assert.equal(parseImportDate('1802-01-01'), null);
    assert.equal(parseImportDate(`${new Date().getUTCFullYear() + 1}-01-01`), null);
  });

  it('reads nothing out of an empty cell without complaining', () => {
    assert.equal(parseImportDate(''), null);
    assert.equal(parseImportDate('   '), null);
  });
});

describe('readPatients — a list somebody else kept', () => {
  it('finds its columns in Albanian, Italian or English', () => {
    const albanian = read('Mbiemri;Emri;Telefoni\nKrasniqi;Arta;069 65 84 447\n');
    assert.deepEqual(albanian.missing, []);
    assert.deepEqual(albanian.rows[0].draft.lastName, 'Krasniqi');

    const italian = read('Cognome;Nome;Telefono\nBulaj;Ahmedin;068 615 5394\n');
    assert.equal(italian.rows[0].draft.firstName, 'Ahmedin');

    const english = read('Last name,First name,Phone\nShehu,Elton,069 111 2222\n');
    assert.equal(english.rows[0].draft.lastName, 'Shehu');
  });

  it('says which required column a file simply has not got', () => {
    const reading = read('Emri;Adresa\nArta;Rr. Myslym Shyri\n');
    assert.deepEqual(reading.missing, ['lastName', 'phone']);
  });

  it('imports a file this app exported, apostrophe guard and all', () => {
    // The end-to-end promise: a list out of one practice goes into another
    // without being touched. `csvCell` writes `'+355…` so Excel keeps the
    // number as text, and that apostrophe must not become part of the number.
    const written =
      CSV_BOM +
      toCsv([
        ['Mbiemri', 'Emri', 'Telefoni', 'Datëlindja', 'Adresa'],
        ['Krasniqi', 'Arta', '+355 69 65 84 447', '1991-01-15', 'Rr. Myslym Shyri; 12'],
      ]);

    const reading = read(written);
    assert.deepEqual(reading.missing, []);
    const [row] = reading.rows;
    assert.equal(row.draft.phone, '+355 69 65 84 447');
    assert.equal(row.draft.dateOfBirth, '1991-01-15');
    assert.equal(row.draft.address, 'Rr. Myslym Shyri; 12');
    assert.deepEqual(row.problems, []);
    assert.ok(isImportable(row));
  });

  it('numbers rows by their line in the file, counting the header', () => {
    const reading = read('Mbiemri;Telefoni\nA;069 1\nB;069 2\n');
    assert.deepEqual(
      reading.rows.map((row) => row.line),
      [2, 3],
    );
  });

  it('flags a row with no phone and one with no name, and keeps both visible', () => {
    const reading = read('Mbiemri;Emri;Telefoni\nKrasniqi;Arta;\n;;069 65 84 447\n');

    assert.deepEqual(byLine(reading.rows, 2).problems, ['noPhone']);
    assert.deepEqual(byLine(reading.rows, 3).problems, ['noName']);
    // Both are still in the list — the screen shows them so somebody can see
    // what will be left behind, rather than the file silently shrinking.
    assert.equal(reading.rows.length, 2);
    assert.ok(reading.rows.every((row) => !isImportable(row)));
  });

  it('keeps a row whose birthday could not be read, without the birthday', () => {
    // A patient with no date of birth is a far smaller loss than a patient who
    // was not imported at all.
    const reading = read('Mbiemri;Telefoni;Datëlindja\nKrasniqi;069 65 84 447;sometime in 91\n');
    const [row] = reading.rows;

    assert.deepEqual(row.problems, ['badDate']);
    assert.equal(row.draft.dateOfBirth, null);
    assert.ok(isImportable(row), 'a bad date must not cost the whole row');
  });

  it('catches the same number twice inside one file', () => {
    // Written three different ways, which is exactly how a nine-year list
    // records one person who was entered twice.
    const reading = read(
      'Mbiemri;Telefoni\nKrasniqi;069 65 84 447\nKrasniqi A.;+355 69 65 84 447\nBulaj;068 615 5394\n',
    );

    assert.deepEqual(byLine(reading.rows, 2).problems, []);
    assert.deepEqual(byLine(reading.rows, 3).problems, ['duplicateInFile']);
    assert.deepEqual(byLine(reading.rows, 4).problems, []);
  });

  it('files a single-cell name under the surname, where the app looks for it', () => {
    const reading = read('Emri;Telefoni\nFatmir Ariu;069 65 84 447\n');
    const [row] = reading.rows;

    // Not duplicated across both columns — the surname is what every list
    // sorts and searches by, so that is where one name goes.
    assert.equal(row.draft.lastName, 'Fatmir Ariu');
    assert.equal(row.draft.firstName, '');
    assert.deepEqual(row.problems, []);
  });

  it('turns an empty optional cell into null rather than an empty string', () => {
    const reading = read('Mbiemri;Telefoni;Email;Adresa\nKrasniqi;069 1;;   \n');
    assert.equal(reading.rows[0].draft.email, null);
    assert.equal(reading.rows[0].draft.address, null);
  });

  it('reads a file with no data rows as no rows rather than as a fault', () => {
    const reading = read('Mbiemri;Emri;Telefoni\n');
    assert.deepEqual(reading.missing, []);
    assert.deepEqual(reading.rows, []);
  });
});
