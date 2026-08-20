import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CSV_DELIMITER, csvCell, toCsv } from '../src/lib/csv';
import {
  DUE_SOON_DAYS,
  MAX_ELEMENTS,
  MAX_WORK_LINES,
  NO_LAB,
  chaseOrder,
  daysLate,
  elementsOf,
  filterWorks,
  fromMonthKey,
  inMonth,
  isOutstanding,
  monthsPresent,
  parseDraftLines,
  resolveWorkMonth,
  toElementCount,
  totalElements,
  toWorkFilterStatus,
  workScope,
  workStatus,
  worksToRows,
  type ExportableWork,
  type WorkScope,
} from '../src/lib/works';

const HEADERS = {
  labSerial: 'Serial',
  patientName: 'Pacienti',
  phone: 'Telefoni',
  diagnosis: 'Ura',
  elements: 'Elementet',
  procedure: 'Punimi',
  lab: 'Laboratori',
  notes: 'Shënime',
  sentAt: 'Dërguar',
  dueAt: 'Kthimi',
  receivedAt: 'U kthye',
  urgent: 'Urgjent',
  yes: 'Po',
  total: 'Totali',
};

/** The columns `worksToRows` writes, so the assertions below can name them. */
const COL = {
  sentAt: 0,
  dueAt: 1,
  receivedAt: 2,
  labSerial: 3,
  patientName: 4,
  phone: 5,
  urgent: 6,
  /** The span — beside the work now, because a case can have more than one. */
  diagnosis: 7,
  elements: 8,
  procedure: 9,
  lab: 10,
  notes: 11,
} as const;

const stamp = (date: Date) => date.toISOString().slice(0, 10);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The day every date-sensitive test below is asked "as of". */
const TODAY = day('2026-08-15');

function work(over: Partial<ExportableWork> = {}): ExportableWork {
  return {
    // Still the register's own sequence, and still how these cases tell
    // themselves apart below — it just no longer has a column on screen or a
    // column in the file.
    number: 1,
    labSerial: 'L-100',
    patientName: 'Arta Krasniqi',
    phone: '069 123 4567',
    diagnosis: null,
    notes: null,
    sentAt: day('2026-08-14'),
    dueAt: null,
    receivedAt: null,
    urgent: false,
    lines: [],
    ...over,
  };
}

const line = (
  elements: number,
  procedure = 'Kurorë',
  lab: string | null = null,
  teeth: string | null = null,
) => ({
  elements,
  procedure,
  lab,
  teeth,
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
      { elements: 3, procedure: 'Urë zirkoni', lab: 'Dental Art', teeth: '' },
      { elements: 1, procedure: 'Kurorë', lab: '', teeth: '' },
    ]);
  });

  it('drops a row with no work on it — that is a blank, not a piece of work', () => {
    const raw = JSON.stringify([
      { elements: 4, procedure: '   ', lab: 'Dental Art' },
      { elements: 2, procedure: 'Protezë', lab: '' },
    ]);

    assert.deepEqual(parseDraftLines(raw), [
      { elements: 2, procedure: 'Protezë', lab: '', teeth: '' },
    ]);
  });

  it('takes the count from the span, which is the one thing that cannot be wrong', () => {
    const raw = JSON.stringify([
      // A bridge: two teeth and the gap between them. The count posted with it
      // is what a stale form field would have said.
      { elements: 99, procedure: 'Urë', lab: '', teeth: '15,16x,17' },
    ]);

    const [row] = parseDraftLines(raw);
    assert.equal(row.elements, 3, 'three positions, three elements');
    assert.equal(row.teeth, '17,16x,15', 'stored in chart order');
  });

  it('keeps the typed count for work that names no teeth', () => {
    const raw = JSON.stringify([{ elements: 14, procedure: 'Protezë e plotë', lab: '' }]);
    assert.equal(parseDraftLines(raw)[0].elements, 14);
  });

  it('drops a span that is not teeth rather than believing it', () => {
    const raw = JSON.stringify([
      { elements: 2, procedure: 'Kurorë', lab: '', teeth: '19,99,abc' },
    ]);

    const [row] = parseDraftLines(raw);
    assert.equal(row.teeth, '');
    assert.equal(row.elements, 2, 'and the typed count stands, because no span survived');
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
          lines: [
            line(3, 'Urë zirkoni', 'Dental Art', '17,16x,15'),
            line(1, 'Kurorë', null, '24'),
          ],
        }),
      ],
      HEADERS,
      stamp,
    );

    assert.equal(rows.length, 4, 'a heading, one row per piece of work, and the total');
    assert.deepEqual(rows[0], [
      'Dërguar',
      'Kthimi',
      'U kthye',
      'Serial',
      'Pacienti',
      'Telefoni',
      'Urgjent',
      'Ura',
      'Elementet',
      'Punimi',
      'Laboratori',
      'Shënime',
    ]);
    assert.deepEqual(rows[1], [
      '2026-08-14',
      '',
      '',
      'L-100',
      'Arta Krasniqi',
      '069 123 4567',
      '',
      // FDI codes rather than the drawn bracket: a spreadsheet cell cannot hold
      // the corner of the mouth, and `15` says it on its own.
      '17, 16x, 15',
      '3',
      'Urë zirkoni',
      'Dental Art',
      '',
    ]);
    assert.deepEqual(
      rows[2].slice(0, COL.diagnosis),
      rows[1].slice(0, COL.diagnosis),
      'the case repeats',
    );
    assert.deepEqual(
      rows[2].slice(COL.diagnosis, COL.notes),
      ['24', '1', 'Kurorë', ''],
      'each piece of work carries its own span',
    );

    const total = rows[3];
    assert.equal(total.length, rows[0].length, 'the total row is as wide as the file');
    assert.equal(total[COL.diagnosis], 'Totali', 'labelled in the column before the count');
    assert.equal(total[COL.elements], '4');
  });

  it('writes the promised and actual return dates, and marks only the urgent cases', () => {
    const rows = worksToRows(
      [
        work({
          number: 9,
          dueAt: day('2026-08-20'),
          receivedAt: day('2026-08-22'),
          urgent: true,
          lines: [line(1)],
        }),
      ],
      HEADERS,
      stamp,
    );

    assert.equal(rows[1][COL.dueAt], '2026-08-20');
    assert.equal(rows[1][COL.receivedAt], '2026-08-22');
    assert.equal(rows[1][COL.urgent], 'Po');
  });

  it('leaves the urgent cell blank rather than writing a localised "no"', () => {
    const rows = worksToRows([work({ lines: [line(1)] })], HEADERS, stamp);
    assert.equal(rows[1][COL.urgent], '', 'a marked column filters; a Yes/No column does not');
  });

  it('still exports a case that has no work on it yet', () => {
    const rows = worksToRows([work({ labSerial: null })], HEADERS, stamp);
    assert.equal(rows.length, 3, 'the case must not vanish from the file');
    assert.deepEqual(rows[1].slice(COL.diagnosis, COL.notes), ['', '', '', '']);
    assert.equal(rows[1][COL.labSerial], '', 'a serial that has not arrived is blank, not "null"');
    assert.equal(rows[2][COL.elements], '0');
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
    assert.equal(rows.at(-1)![COL.elements], '9');
  });
});

describe('workStatus — how near a case is to the day it was promised', () => {
  it('calls a case with no promised date open, whatever its age', () => {
    assert.equal(workStatus(work({ sentAt: day('2020-01-01') }), TODAY), 'open');
  });

  it('reads the days around the promise', () => {
    assert.equal(workStatus(work({ dueAt: day('2026-08-14') }), TODAY), 'overdue');
    assert.equal(workStatus(work({ dueAt: day('2026-08-15') }), TODAY), 'dueToday');
    assert.equal(workStatus(work({ dueAt: day('2026-08-18') }), TODAY), 'dueSoon');
    assert.equal(
      workStatus(work({ dueAt: day('2026-08-19') }), TODAY),
      'open',
      `past ${DUE_SOON_DAYS} days it is nobody's problem today`,
    );
  });

  it('stops chasing a case that is back, even one that came back late', () => {
    const late = work({ dueAt: day('2026-07-01'), receivedAt: day('2026-08-10') });
    assert.equal(
      workStatus(late, TODAY),
      'received',
      'a register that never goes quiet stops being read',
    );
    assert.equal(daysLate(late, TODAY), 0);
    assert.equal(isOutstanding(late), false);
  });

  it('counts the days a case is late by, for the phone call', () => {
    assert.equal(daysLate(work({ dueAt: day('2026-08-10') }), TODAY), 5);
    assert.equal(daysLate(work({ dueAt: day('2026-08-15') }), TODAY), 0, 'today is not late');
    assert.equal(daysLate(work({ dueAt: day('2026-09-01') }), TODAY), 0);
    assert.equal(daysLate(work(), TODAY), 0, 'no promise, no lateness');
  });
});

describe('chaseOrder — what to ring the laboratory about first', () => {
  it('drops everything already back', () => {
    const list = chaseOrder([
      work({ number: 1, receivedAt: day('2026-08-12') }),
      work({ number: 2, dueAt: day('2026-08-10') }),
    ]);
    assert.deepEqual(
      list.map((entry) => entry.number),
      [2],
    );
  });

  it('puts an urgent case above an older promise', () => {
    const list = chaseOrder([
      work({ number: 1, dueAt: day('2026-08-01') }),
      work({ number: 2, dueAt: day('2026-08-30'), urgent: true }),
    ]);
    assert.deepEqual(
      list.map((entry) => entry.number),
      [2, 1],
      'the flag exists precisely to jump the queue',
    );
  });

  it('sorts an undated case behind every dated one, then by how long it has waited', () => {
    const list = chaseOrder([
      work({ number: 1, sentAt: day('2026-08-02') }),
      work({ number: 2, dueAt: day('2026-08-20') }),
      work({ number: 3, sentAt: day('2026-08-01') }),
      work({ number: 4, dueAt: day('2026-08-10') }),
    ]);
    assert.deepEqual(
      list.map((entry) => entry.number),
      [4, 2, 3, 1],
    );
  });
});

describe('filterWorks — the one copy of the register’s filter', () => {
  const register = [
    work({ number: 1, patientName: 'Arta Krasniqi', sentAt: day('2026-08-14') }),
    work({
      number: 2,
      patientName: 'Blerim Purón',
      sentAt: day('2026-07-02'),
      dueAt: day('2026-08-01'),
      lines: [line(1, 'Kurorë', 'Dental Art')],
    }),
    work({
      number: 3,
      patientName: 'Dritan Hoxha',
      sentAt: day('2026-08-05'),
      dueAt: day('2026-08-12'),
      receivedAt: day('2026-08-13'),
      lines: [line(2, 'Protezë', 'Smile Lab')],
    }),
  ];

  const run = (over: Partial<Parameters<typeof filterWorks>[1]> = {}) =>
    filterWorks(register, { query: '', lab: '', month: null, status: '', ...over }, TODAY).map(
      (entry) => entry.number,
    );

  it('folds accents, so typing puron finds Purón', () => {
    assert.deepEqual(run({ query: 'puron' }), [2]);
  });

  it('searches the work itself, not only the patient', () => {
    assert.deepEqual(run({ query: 'protezë' }), [3]);
    assert.deepEqual(run({ query: 'Dental Art' }), [2]);
  });

  it('narrows to a month by the day the case went out', () => {
    assert.deepEqual(run({ month: '2026-08' }), [1, 3]);
  });

  it('separates what is still out from what is late from what is back', () => {
    assert.deepEqual(run({ status: 'out' }), [1, 2]);
    assert.deepEqual(run({ status: 'late' }), [2], 'only a promise that has passed');
    assert.deepEqual(run({ status: 'back' }), [3]);
  });

  it('finds the cases with no laboratory named', () => {
    assert.deepEqual(run({ lab: NO_LAB }), [1]);
    assert.deepEqual(run({ lab: 'Smile Lab' }), [3]);
  });
});

describe('workScope — the half of that filter the database answers', () => {
  /**
   * What Postgres will do with the scope, in the small amount of JavaScript it
   * takes to say it. The point of the tests below is that this and
   * `filterWorks` cannot disagree about which rows exist.
   */
  const inScope = (entry: ExportableWork, scope: WorkScope): boolean => {
    if (scope.sentAt && !(entry.sentAt >= scope.sentAt.gte && entry.sentAt < scope.sentAt.lt)) {
      return false;
    }
    if (scope.receivedAt === null && entry.receivedAt !== null) return false;
    if (scope.receivedAt && 'not' in scope.receivedAt && entry.receivedAt === null) return false;
    if (scope.dueAt && !(entry.dueAt !== null && entry.dueAt < scope.dueAt.lt)) return false;
    return true;
  };

  const register = [
    work({ number: 1, patientName: 'Arta Krasniqi', sentAt: day('2026-08-14') }),
    work({
      number: 2,
      patientName: 'Blerim Purón',
      sentAt: day('2026-07-02'),
      dueAt: day('2026-08-01'),
      lines: [line(1, 'Kurorë', 'Dental Art')],
    }),
    work({
      number: 3,
      patientName: 'Dritan Hoxha',
      sentAt: day('2026-08-05'),
      dueAt: day('2026-08-12'),
      receivedAt: day('2026-08-13'),
      lines: [line(2, 'Protezë', 'Smile Lab')],
    }),
    // Due today, which is the edge `late` must not claim.
    work({ number: 4, sentAt: day('2026-08-15'), dueAt: TODAY }),
    // The last day of a month and the first of the next, either side of the
    // boundary the range is drawn on.
    work({ number: 5, sentAt: day('2026-07-31') }),
    work({ number: 6, sentAt: day('2026-08-01') }),
    // Out for months with nothing promised: never late, always still out.
    work({ number: 7, sentAt: day('2026-06-09'), dueAt: null }),
  ];

  it('is a date range on the month, half-open at the far end', () => {
    assert.deepEqual(workScope({ month: '2026-07', status: '' }, TODAY), {
      sentAt: { gte: day('2026-07-01'), lt: day('2026-08-01') },
    });
  });

  it('asks for nothing at all when the register is opened on every month', () => {
    // The one query still unbounded, and the only one somebody has to choose.
    assert.deepEqual(workScope({ month: null, status: '' }, TODAY), {});
  });

  it('reads late as a promise that has passed on a case still out', () => {
    assert.deepEqual(workScope({ month: null, status: 'late' }, TODAY), {
      receivedAt: null,
      dueAt: { lt: TODAY },
    });
    assert.deepEqual(workScope({ month: null, status: 'out' }, TODAY), { receivedAt: null });
    assert.deepEqual(workScope({ month: null, status: 'back' }, TODAY), {
      receivedAt: { not: null },
    });
  });

  it('never drops a row the register would have shown', () => {
    const months = [null, '2026-08', '2026-07', '2026-06', '2026-05'];
    const statuses = ['', 'out', 'late', 'back'] as const;

    for (const month of months) {
      for (const status of statuses) {
        const filters = { query: '', lab: '', month, status };
        const where = workScope(filters, TODAY);
        const fetched = register.filter((entry) => inScope(entry, where));
        const shown = filterWorks(register, filters, TODAY);

        for (const entry of shown) {
          assert.ok(
            fetched.includes(entry),
            `case ${entry.number} is shown for month=${month} status=${status} but was never fetched`,
          );
        }

        // The whole promise, in one line: narrowing in SQL first changes
        // nothing about what ends up on screen.
        assert.deepEqual(
          filterWorks(fetched, filters, TODAY).map((entry) => entry.number),
          shown.map((entry) => entry.number),
          `month=${month} status=${status}`,
        );
      }
    }
  });
});

describe('resolveWorkMonth — which month the register opens on', () => {
  const months = ['2026-08', '2026-07'];

  it('opens on the newest month, because the invoice arrives monthly', () => {
    assert.equal(resolveWorkMonth(months, undefined), '2026-08');
    assert.equal(resolveWorkMonth(months, ''), '2026-08');
    assert.equal(resolveWorkMonth([], undefined), null, 'an empty register has no month');
  });

  it('honours a month that was named', () => {
    assert.equal(resolveWorkMonth(months, '2026-07'), '2026-07');
    assert.equal(resolveWorkMonth(months, 'all'), null);
    assert.equal(resolveWorkMonth(months, '2026-13'), '2026-08', 'nonsense falls back');
  });

  it('widens to every month when a state is being asked about', () => {
    assert.equal(
      resolveWorkMonth(months, undefined, 'late'),
      null,
      'a case sent in March is exactly the one still missing in August',
    );
    assert.equal(
      resolveWorkMonth(months, '2026-07', 'late'),
      '2026-07',
      'naming a month still wins',
    );
  });
});

describe('toWorkFilterStatus — what arrives in the query string', () => {
  it('takes the three it knows and refuses the rest', () => {
    assert.equal(toWorkFilterStatus('late'), 'late');
    assert.equal(toWorkFilterStatus('out'), 'out');
    assert.equal(toWorkFilterStatus('back'), 'back');
    assert.equal(toWorkFilterStatus('urgent'), '');
    assert.equal(toWorkFilterStatus(null), '');
    assert.equal(toWorkFilterStatus(undefined), '');
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
