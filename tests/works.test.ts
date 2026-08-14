import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CSV_DELIMITER, csvCell, toCsv } from '../src/lib/csv';
import { MAX_WORK_LINES, parseDraftLines, worksToRows, type ExportableWork } from '../src/lib/works';

const HEADERS = {
  number: 'Nr',
  labSerial: 'Serial',
  patientName: 'Pacienti',
  phone: 'Telefoni',
  diagnosis: 'Diagnoza',
  elements: 'Elementet',
  procedure: 'Punimi',
  lab: 'Laboratori',
  notes: 'Shënime',
  createdAt: 'Data',
};

const DAY = new Date('2026-08-14T09:30:00.000Z');
const stamp = (date: Date) => date.toISOString().slice(0, 10);

function work(over: Partial<ExportableWork> = {}): ExportableWork {
  return {
    number: 1,
    labSerial: 'L-100',
    patientName: 'Arta Krasniqi',
    phone: '069 123 4567',
    diagnosis: null,
    notes: null,
    createdAt: DAY,
    lines: [],
    ...over,
  };
}

describe('parseDraftLines — the case as the builder posts it', () => {
  it('keeps the rows in the order they were written', () => {
    const raw = JSON.stringify([
      { elements: '14, 15, 16', procedure: 'Urë zirkoni', lab: 'Dental Art' },
      { elements: '24', procedure: 'Kurorë', lab: '' },
    ]);

    assert.deepEqual(parseDraftLines(raw), [
      { elements: '14, 15, 16', procedure: 'Urë zirkoni', lab: 'Dental Art' },
      { elements: '24', procedure: 'Kurorë', lab: '' },
    ]);
  });

  it('drops a row with no work on it — that is a blank, not a piece of work', () => {
    const raw = JSON.stringify([
      { elements: '14', procedure: '   ', lab: 'Dental Art' },
      { elements: '', procedure: 'Protezë', lab: '' },
    ]);

    assert.deepEqual(parseDraftLines(raw), [
      { elements: '', procedure: 'Protezë', lab: '' },
    ]);
  });

  it('keeps the elements even when nobody has named a lab yet', () => {
    const [line] = parseDraftLines(JSON.stringify([{ elements: '46, 47', procedure: 'Urë' }]));
    assert.equal(line.elements, '46, 47');
    assert.equal(line.lab, '');
  });

  it('caps the case rather than accepting an import', () => {
    const many = Array.from({ length: MAX_WORK_LINES + 10 }, (_, index) => ({
      elements: String(11 + index),
      procedure: 'Kurorë',
      lab: '',
    }));
    assert.equal(parseDraftLines(JSON.stringify(many)).length, MAX_WORK_LINES);
  });

  it('survives anything that is not a case', () => {
    assert.deepEqual(parseDraftLines(''), []);
    assert.deepEqual(parseDraftLines('not json'), []);
    assert.deepEqual(parseDraftLines('{"elements":"14"}'), [], 'an object is not a list');
    assert.deepEqual(parseDraftLines('[null, 7, "x"]'), []);
    assert.deepEqual(parseDraftLines(JSON.stringify([{ procedure: 42 }])), []);
  });
});

describe('worksToRows — the register flattened for a spreadsheet', () => {
  it('repeats the case down its own pieces of work', () => {
    const rows = worksToRows(
      [
        work({
          number: 7,
          diagnosis: 'Edentulizëm',
          lines: [
            { elements: '14, 15, 16', procedure: 'Urë zirkoni', lab: 'Dental Art' },
            { elements: '24', procedure: 'Kurorë', lab: null },
          ],
        }),
      ],
      HEADERS,
      stamp,
    );

    assert.equal(rows.length, 3, 'a heading and one row per piece of work');
    assert.deepEqual(rows[0], [
      'Nr',
      'Serial',
      'Pacienti',
      'Telefoni',
      'Diagnoza',
      'Elementet',
      'Punimi',
      'Laboratori',
      'Shënime',
      'Data',
    ]);
    assert.deepEqual(rows[1], [
      '7',
      'L-100',
      'Arta Krasniqi',
      '069 123 4567',
      'Edentulizëm',
      '14, 15, 16',
      'Urë zirkoni',
      'Dental Art',
      '',
      '2026-08-14',
    ]);
    assert.deepEqual(rows[2].slice(0, 5), rows[1].slice(0, 5), 'the case repeats');
    assert.deepEqual(rows[2].slice(5, 8), ['24', 'Kurorë', '']);
  });

  it('still exports a case that has no work on it yet', () => {
    const rows = worksToRows([work({ number: 3, labSerial: null })], HEADERS, stamp);
    assert.equal(rows.length, 2, 'the case must not vanish from the file');
    assert.deepEqual(rows[1].slice(5, 8), ['', '', '']);
    assert.equal(rows[1][1], '', 'a serial that has not arrived is blank, not "null"');
  });
});

describe('csvCell — what a spreadsheet will actually read back', () => {
  it('quotes a value that carries the separator', () => {
    assert.equal(csvCell(`Dental${CSV_DELIMITER}Art`), `"Dental${CSV_DELIMITER}Art"`);
  });

  it('doubles a quote inside a quoted value', () => {
    assert.equal(csvCell('shade "A2"'), '"shade ""A2"""');
  });

  it('quotes a value with a newline rather than losing the rest of the row', () => {
    assert.equal(csvCell('14, 15\n16'), '"14, 15\n16"');
  });

  it('marks a leading + as text, so Excel does not evaluate a phone number', () => {
    assert.equal(csvCell('+355 69 123 4567'), "'+355 69 123 4567");
    assert.equal(csvCell('=1+1'), "'=1+1");
  });

  it('leaves an ordinary value exactly as it is', () => {
    assert.equal(csvCell('Urë zirkoni'), 'Urë zirkoni');
    assert.equal(csvCell('069 123 4567'), '069 123 4567');
    assert.equal(csvCell(7), '7');
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
  });
});

describe('toCsv — the file itself', () => {
  it('opens with the separator hint and uses CRLF between rows', () => {
    const csv = toCsv([
      ['Nr', 'Pacienti'],
      ['1', 'Arta Krasniqi'],
    ]);

    assert.equal(
      csv,
      [`sep=${CSV_DELIMITER}`, `Nr${CSV_DELIMITER}Pacienti`, `1${CSV_DELIMITER}Arta Krasniqi`].join(
        '\r\n',
      ),
    );
  });

  it('round-trips a multi-line cell as one field', () => {
    const csv = toCsv([['14\n15']]);
    assert.ok(csv.endsWith('"14\n15"'), csv);
  });
});
