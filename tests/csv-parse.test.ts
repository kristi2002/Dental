import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CSV_BOM, toCsv } from '../src/lib/csv';
import { matchColumns, normaliseHeader, parseCsv, sniffDelimiter } from '../src/lib/csv-parse';

describe('sniffDelimiter — what the sending machine happened to save', () => {
  it('takes the sep= hint over anything it could count', () => {
    // Our own export writes this line, so a file that made a round trip through
    // the app must come back in whatever the counting would have said.
    assert.equal(sniffDelimiter('sep=;\na;b;c\n'), ';');
    assert.equal(sniffDelimiter('sep=,\na,b,c\n'), ',');
  });

  it('picks the semicolon an Albanian or Italian Excel writes', () => {
    assert.equal(sniffDelimiter('Emri;Mbiemri;Telefoni\nArta;Krasniqi;069\n'), ';');
  });

  it('picks the comma an English Excel writes', () => {
    assert.equal(sniffDelimiter('First,Last,Phone\nArta,Krasniqi,069\n'), ',');
  });

  it('picks the tab from a paste out of a spreadsheet', () => {
    assert.equal(sniffDelimiter('First\tLast\tPhone\nArta\tKrasniqi\t069\n'), '\t');
  });

  it('ignores commas that live inside quoted names', () => {
    // The failure this exists to prevent: a semicolon file full of "Surname,
    // Forename" cells would otherwise be read as a comma file and split every
    // row in the wrong place.
    const text = 'Emri;Adresa\n"Krasniqi, Arta";"Rr. Myslym Shyri, 12"\n';
    assert.equal(sniffDelimiter(text), ';');
  });
});

describe('parseCsv — the grammar', () => {
  it('reads a plain file into rows and columns', () => {
    assert.deepEqual(parseCsv('a;b\n1;2\n'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips the BOM so the first column title still matches', () => {
    // Our export writes one so Excel reads UTF-8. Left in place it becomes part
    // of the first header and nothing matches it.
    const rows = parseCsv(`${CSV_BOM}Emri;Mbiemri\nArta;Krasniqi\n`);
    assert.deepEqual(rows[0], ['Emri', 'Mbiemri']);
  });

  it('swallows the sep= line rather than treating it as data', () => {
    const rows = parseCsv('sep=;\nEmri;Mbiemri\nArta;Krasniqi\n');
    assert.deepEqual(rows, [
      ['Emri', 'Mbiemri'],
      ['Arta', 'Krasniqi'],
    ]);
  });

  it('keeps a delimiter that is inside quotes', () => {
    assert.deepEqual(parseCsv('a;b\n"one;two";three\n')[1], ['one;two', 'three']);
  });

  it('reads a doubled quote as one literal quote', () => {
    assert.deepEqual(parseCsv('a\n"she said ""no"""\n')[1], ['she said "no"']);
  });

  it('keeps a newline that is inside quotes on the same row', () => {
    // The notes column of anything this app exports contains these.
    const rows = parseCsv('a;b\n"line one\nline two";x\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[1][0], 'line one\nline two');
  });

  it('handles CRLF, which is what Excel actually writes', () => {
    assert.deepEqual(parseCsv('a;b\r\n1;2\r\n'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('trims an unquoted cell but leaves a quoted one exactly as written', () => {
    const rows = parseCsv('a;b\n  spaced  ;"  kept  "\n');
    assert.deepEqual(rows[1], ['spaced', '  kept  ']);
  });

  it('drops the trailing blank line every text file ends with', () => {
    assert.equal(parseCsv('a;b\n1;2\n').length, 2);
    assert.equal(parseCsv('a;b\n1;2').length, 2);
    assert.equal(parseCsv('a;b\n1;2\n\n\n').length, 2);
  });

  it('keeps a row of empty cells, which is somebody leaving a gap in their list', () => {
    // Dropped, the import screen could not point at the row and say what is
    // wrong with it.
    const rows = parseCsv('a;b\n1;2\n;\n3;4\n');
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[2], ['', '']);
  });

  it('round-trips a file this app wrote', () => {
    const written = CSV_BOM + toCsv([
      ['Mbiemri', 'Emri', 'Telefoni', 'Shënime'],
      ['Krasniqi', 'Arta', '+355 69 65 84 447', 'first line\nsecond line'],
      ['Bulaj', 'Ahmedin', '+355 68 615 5394', 'says "maybe"'],
    ]);

    const rows = parseCsv(written);
    assert.deepEqual(rows[0], ['Mbiemri', 'Emri', 'Telefoni', 'Shënime']);
    assert.equal(rows[1][3], 'first line\nsecond line');
    assert.equal(rows[2][3], 'says "maybe"');
    // `csvCell` guards a leading `+` with an apostrophe so Excel keeps it as
    // text; that apostrophe is part of the file and comes back with it.
    assert.equal(rows[1][2], "'+355 69 65 84 447");
  });
});

describe('normaliseHeader — the same column under nine years of typing', () => {
  it('folds case, accents, spaces and punctuation together', () => {
    const same = ['Datëlindja', 'datelindja', 'DATE LINDJA ', 'Date-Lindja'];
    for (const written of same) {
      assert.equal(normaliseHeader(written), 'datelindja', written);
    }
  });
});

describe('matchColumns — finding the columns we want', () => {
  const ALIASES = {
    firstName: ['Emri', 'First name', 'Nome'],
    lastName: ['Mbiemri', 'Last name', 'Cognome'],
    phone: ['Telefoni', 'Phone', 'Telefono'],
  } as const;

  it('finds a column whatever language it was written in', () => {
    assert.deepEqual(matchColumns(['Cognome', 'Nome', 'Telefono'], ALIASES), {
      firstName: 1,
      lastName: 0,
      phone: 2,
    });
  });

  it('reports -1 for a column the file simply does not have', () => {
    const found = matchColumns(['Emri', 'Mbiemri'], ALIASES);
    assert.equal(found.phone, -1);
  });

  it('takes the leftmost when a file has two plausible columns for one field', () => {
    // Which is what a person reading the file would also assume.
    assert.equal(matchColumns(['Phone', 'Telefoni'], ALIASES).phone, 0);
  });
});
