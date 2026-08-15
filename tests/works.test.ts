import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CSV_DELIMITER, csvCell, toCsv } from '../src/lib/csv';
import {
  MAX_ELEMENTS,
  MAX_WORK_LINES,
  elementsOf,
  fromMonthKey,
  inMonth,
  monthsPresent,
  parseDraftLines,
  toElementCount,
  totalElements,
  worksToRows,
  type ExportableWork,
} from '../src/lib/works';

const HEADERS = {
  number: 'Nr',
  labSerial: 'Serial',
  patientName: 'Pacienti',
  phone: 'Telefoni',
  diagnosis: 'Ura',
  elements: 'Elementet',
  procedure: 'Punimi',
  lab: 'Laboratori',
  notes: 'Shënime',
  sentAt: 'Dërguar',
  total: 'Totali',
};

const stamp = (date: Date) => date.toISOString().slice(0, 10);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function work(over: Partial<ExportableWork> = {}): ExportableWork {
  return {
    number: 1,
    labSerial: 'L-100',
    patientName: 'Arta Krasniqi',
    phone: '069 123 4567',
    diagnosis: null,
    notes: null,
    sentAt: day('2026-08-14'),
    lines: [],
    ...over,
  };
}

const line = (elements: number, procedure = 'Kurorë', lab: string | null = null) => ({
  elements,
  procedure,
  lab,
});

describe('toElementCount — the number the laboratory bills on', () => {
  it('takes a plain count, however it was typed', () => {
    assert.equal(toElementCount(3), 3);
    assert.equal(toElementCount('3'), 3);
    assert.equal(toElementCount(' 12 '), 12);
  });

  it('falls back rather than storing a nonsense count', () => {
    assert.equal(toElementCount(''), 1);
    assert.equal(toElementCount('abc'), 1);
    assert.equal(toElementCount(null), 1);
    assert.equal(toElementCount(undefined, 0), 0);
  });

  it('clamps, so a slipped keystroke cannot invent a thousand elements', () => {
    assert.equal(toElementCount(5000), MAX_ELEMENTS);
    assert.equal(toElementCount(-4), 0, 'a negative element is not a discount');
    assert.equal(toElementCount(3.7), 3, 'half an element is not a thing');
  });
});

describe('parseDraftLines — the case as the builder posts it', () => {
  it('keeps the rows, and their counts, in the order they were written', () => {
    const raw = JSON.stringify([
      { elements: 3, procedure: 'Urë zirkoni', lab: 'Dental Art' },
      { elements: 1, procedure: 'Kurorë', lab: '' },
    ]);

    assert.deepEqual(parseDraftLines(raw), [
      { elements: 3, procedure: 'Urë zirkoni', lab: 'Dental Art' },
      { elements: 1, procedure: 'Kurorë', lab: '' },
    ]);
  });

  it('drops a row with no work on it — that is a blank, not a piece of work', () => {
    const raw = JSON.stringify([
      { elements: 4, procedure: '   ', lab: 'Dental Art' },
      { elements: 2, procedure: 'Protezë', lab: '' },
    ]);

    assert.deepEqual(parseDraftLines(raw), [{ elements: 2, procedure: 'Protezë', lab: '' }]);
  });

  it('defaults a missing count to one — a row is at least one element', () => {
    const [row] = parseDraftLines(JSON.stringify([{ procedure: 'Kurorë' }]));
    assert.equal(row.elements, 1);
    assert.equal(row.lab, '');
  });

  it('caps the case rather than accepting an import', () => {
    const many = Array.from({ length: MAX_WORK_LINES + 10 }, () => ({
      elements: 1,
      procedure: 'Kurorë',
      lab: '',
    }));
    assert.equal(parseDraftLines(JSON.stringify(many)).length, MAX_WORK_LINES);
  });

  it('survives anything that is not a case', () => {
    assert.deepEqual(parseDraftLines(''), []);
    assert.deepEqual(parseDraftLines('not json'), []);
    assert.deepEqual(parseDraftLines('{"elements":3}'), [], 'an object is not a list');
    assert.deepEqual(parseDraftLines('[null, 7, "x"]'), []);
    assert.deepEqual(parseDraftLines(JSON.stringify([{ procedure: 42 }])), []);
  });
});

describe('elementsOf / totalElements — the figure the invoice is checked against', () => {
  it('adds a case up across its rows', () => {
    assert.equal(elementsOf(work({ lines: [line(3), line(1), line(2)] })), 6);
  });

  it('counts a case with no rows as nothing, not as one', () => {
    assert.equal(elementsOf(work()), 0);
  });

  it('adds a month up across its cases', () => {
    const month = [
      work({ number: 1, lines: [line(3), line(1)] }),
      work({ number: 2, lines: [line(5)] }),
      work({ number: 3, lines: [] }),
    ];
    assert.equal(totalElements(month), 9);
  });
});

describe('the month, which is the unit this register is billed in', () => {
  it('offers only the months the register has something in, newest first', () => {
    const works = [
      { sentAt: day('2026-08-14') },
      { sentAt: day('2026-06-02') },
      { sentAt: day('2026-08-01') },
    ];
    assert.deepEqual(monthsPresent(works), ['2026-08', '2026-06'], 'no empty July offered');
  });

  it('reads a month key back, and refuses anything that is not one', () => {
    assert.equal(fromMonthKey('2026-08')?.toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(fromMonthKey('2026-13'), null, 'there is no thirteenth month');
    assert.equal(fromMonthKey('2026-00'), null);
    assert.equal(fromMonthKey('2026-8'), null, 'must be padded');
    assert.equal(fromMonthKey('all'), null);
    assert.equal(fromMonthKey(''), null);
    assert.equal(fromMonthKey(null), null);
  });

  it('places a case by the day it was sent, not by when it was typed up', () => {
    const late = { sentAt: day('2026-07-31') };
    assert.equal(inMonth(late, '2026-07'), true);
    assert.equal(inMonth(late, '2026-08'), false);
    assert.equal(inMonth(late, null), true, 'no month means the whole run');
  });
});

describe('worksToRows — the register flattened for a spreadsheet', () => {
  it('repeats the case down its own pieces of work and totals the file', () => {
    const rows = worksToRows(
      [
        work({
          number: 7,
          diagnosis: '3 x 4 x 7',
          lines: [line(3, 'Urë zirkoni', 'Dental Art'), line(1, 'Kurorë', null)],
        }),
      ],
      HEADERS,
      stamp,
    );

    assert.equal(rows.length, 4, 'a heading, one row per piece of work, and the total');
    assert.deepEqual(rows[0], [
      'Dërguar',
      'Nr',
      'Serial',
      'Pacienti',
      'Telefoni',
      'Ura',
      'Elementet',
      'Punimi',
      'Laboratori',
      'Shënime',
    ]);
    assert.deepEqual(rows[1], [
      '2026-08-14',
      '7',
      'L-100',
      'Arta Krasniqi',
      '069 123 4567',
      '3 x 4 x 7',
      '3',
      'Urë zirkoni',
      'Dental Art',
      '',
    ]);
    assert.deepEqual(rows[2].slice(0, 6), rows[1].slice(0, 6), 'the case repeats');
    assert.deepEqual(rows[2].slice(6, 9), ['1', 'Kurorë', '']);
    assert.deepEqual(rows[3], ['', '', '', '', '', 'Totali', '4', '', '', '']);
  });

  it('still exports a case that has no work on it yet', () => {
    const rows = worksToRows([work({ number: 3, labSerial: null })], HEADERS, stamp);
    assert.equal(rows.length, 3, 'the case must not vanish from the file');
    assert.deepEqual(rows[1].slice(6, 9), ['', '', '']);
    assert.equal(rows[1][2], '', 'a serial that has not arrived is blank, not "null"');
    assert.equal(rows[2][6], '0');
  });

  it('totals the whole file, not just the last case', () => {
    const rows = worksToRows(
      [
        work({ number: 1, lines: [line(3), line(1)] }),
        work({ number: 2, lines: [line(5)] }),
      ],
      HEADERS,
      stamp,
    );
    assert.equal(rows.at(-1)![6], '9');
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
    assert.equal(csvCell('3 x 4\n5 x 7'), '"3 x 4\n5 x 7"');
  });

  it('marks a leading + as text, so Excel does not evaluate a phone number', () => {
    assert.equal(csvCell('+355 69 123 4567'), "'+355 69 123 4567");
    assert.equal(csvCell('=1+1'), "'=1+1");
  });

  it('leaves an ordinary value exactly as it is', () => {
    assert.equal(csvCell('3 x 4 x 7'), '3 x 4 x 7');
    assert.equal(csvCell('Urë zirkoni'), 'Urë zirkoni');
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
