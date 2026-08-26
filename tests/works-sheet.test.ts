import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SheetCell, SheetRow } from '../src/lib/pdf-sheet';
import { worksToSheet, type WorkSheetLabels } from '../src/lib/works-sheet';
import type { ExportableWork } from '../src/lib/works';

const LABELS: WorkSheetLabels = {
  sentAt: 'Dërguar',
  dueAt: 'Afati',
  labSerial: 'Nr. serial i lab.',
  patientName: 'Pacienti',
  teeth: 'Dhëmbët',
  elements: 'Elementet',
  elementsShort: 'El.',
  procedure: 'Punimi',
  lab: 'Laboratori',
  urgent: 'Urgjent',
  statusBack: 'Erdhi',
  lateBy: (days) => `${days} ditë vonesë`,
  total: 'Totali i elementeve',
  empty: 'Bosh',
};

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const ON = day('2026-08-21');

function work(partial: Partial<ExportableWork> = {}): ExportableWork {
  return {
    number: 1,
    labSerial: null,
    patientName: 'Ylli Berisha',
    phone: '',
    diagnosis: null,
    notes: null,
    sentAt: day('2026-08-03'),
    dueAt: null,
    receivedAt: null,
    urgent: false,
    lines: [],
    ...partial,
  };
}

const line = (partial: Partial<ExportableWork['lines'][number]> = {}) => ({
  elements: 1,
  procedure: 'Zirkon',
  lab: 'Dentart',
  teeth: null,
  ...partial,
});

/** Every run of type in a cell, joined — what the column actually says. */
const said = (cell: SheetCell): string => (cell ?? []).map((span) => span.text).join(' | ');

/** Which column is which, by the heading it was given. */
const columnOf = (sheet: { columns: { header: string }[] }, header: string) =>
  sheet.columns.findIndex((column) => column.header === header);

const sheetOf = (works: ExportableWork[]) =>
  worksToSheet(works, LABELS, (value) => value.toISOString().slice(8, 10), ON);

describe('worksToSheet — the register as a document rather than a spreadsheet', () => {
  it('heads the columns in the register’s own order and abbreviates the count', () => {
    const sheet = sheetOf([]);
    assert.deepEqual(
      sheet.columns.map((column) => column.header),
      ['Dërguar', 'Afati', 'Nr. serial i lab.', 'Pacienti', 'Dhëmbët', 'El.', 'Punimi', 'Laboratori'],
    );
    // The only column whose figures are read down rather than across.
    assert.equal(sheet.columns[columnOf(sheet, 'El.')].align, 'right');
  });

  it('writes the case once and runs its items underneath it', () => {
    const sheet = sheetOf([
      work({
        labSerial: '1045',
        lines: [line({ procedure: 'Metal-porcelan', elements: 6 }), line({ procedure: 'Provizor' })],
      }),
    ]);

    const serial = columnOf(sheet, 'Nr. serial i lab.');
    const procedure = columnOf(sheet, 'Punimi');

    // Two items and the case's own count: three rows, one case.
    assert.equal(sheet.rows.length, 3);
    assert.equal(sheet.rows.filter((row) => row.opensGroup).length, 1);
    assert.equal(sheet.rows[0].opensGroup, true);

    assert.equal(said(sheet.rows[0].cells[serial]), '1045');
    assert.equal(said(sheet.rows[0].cells[procedure]), 'Metal-porcelan');

    // `null`, not an empty cell: the serial belongs to the case, and the rows
    // under it are continuations rather than cases with no serial. This is what
    // stops the rule being drawn through the middle of a patient's name.
    assert.equal(sheet.rows[1].cells[serial], null);
    assert.equal(said(sheet.rows[1].cells[procedure]), 'Provizor');
  });

  it('gives a case with more than one item its own count, and one item none', () => {
    const many = sheetOf([work({ lines: [line({ elements: 6 }), line({ elements: 4 })] })]);
    const one = sheetOf([work({ lines: [line({ elements: 6 })] })]);

    const elements = columnOf(many, 'El.');
    const teeth = columnOf(many, 'Dhëmbët');

    assert.equal(many.rows.length, 3);
    assert.equal(said(many.rows[2].cells[teeth]), 'Totali i elementeve');
    assert.equal(said(many.rows[2].cells[elements]), '10');

    // Nothing to add up, so nothing is added up.
    assert.equal(one.rows.length, 1);
  });

  it('keeps a case with no items on the sheet', () => {
    // Dropping it would mean the sheet quietly holds fewer cases than the screen.
    const sheet = sheetOf([work({ labSerial: '1048', lines: [] })]);
    assert.equal(sheet.rows.length, 1);
    assert.equal(said(sheet.rows[0].cells[columnOf(sheet, 'Nr. serial i lab.')]), '1048');
  });

  it('falls back to the free-text span for a case written before the chart existed', () => {
    const sheet = sheetOf([
      work({ diagnosis: '3 x 4 x 7', lines: [line({ teeth: null })] }),
    ]);
    assert.equal(said(sheet.rows[0].cells[columnOf(sheet, 'Dhëmbët')]), '3 x 4 x 7');
  });

  it('prints FDI codes when the line has a span of its own', () => {
    const sheet = sheetOf([
      work({ diagnosis: 'ignored', lines: [line({ teeth: '15,16x,17' })] }),
    ]);
    // Chart order, which runs from the back of the mouth forwards — the order
    // the docket is written in, not the order the string was stored in.
    assert.equal(said(sheet.rows[0].cells[columnOf(sheet, 'Dhëmbët')]), '17, 16x, 15');
  });

  it('says what the promised date means today', () => {
    const back = sheetOf([work({ dueAt: day('2026-08-12'), receivedAt: day('2026-08-11'), lines: [line()] })]);
    const late = sheetOf([work({ dueAt: day('2026-08-18'), lines: [line()] })]);
    const open = sheetOf([work({ dueAt: day('2026-08-30'), lines: [line()] })]);
    const due = columnOf(back, 'Afati');

    assert.equal(said(back.rows[0].cells[due]), '11 | Erdhi');
    assert.equal(said(late.rows[0].cells[due]), '18 | 3 ditë vonesë');
    // A case due in nine days gets its date and nothing else — a register where
    // every open row carries a note has no notes.
    assert.equal(said(open.rows[0].cells[due]), '30');
  });

  it('flags the urgent case beside the name, where the case is', () => {
    const sheet = sheetOf([work({ urgent: true, phone: '+355 69 246 6241', lines: [line()] })]);
    assert.equal(
      said(sheet.rows[0].cells[columnOf(sheet, 'Pacienti')]),
      'Ylli Berisha | URGJENT | +355 69 246 6241',
    );
  });

  it('totals the month under the column it counts', () => {
    const sheet = sheetOf([
      work({ lines: [line({ elements: 6 }), line({ elements: 4 })] }),
      work({ lines: [line({ elements: 5 })] }),
    ]);
    assert.equal(sheet.total.value, '15');
    assert.equal(sheet.total.column, columnOf(sheet, 'El.'));
    assert.equal(sheet.total.label, 'Totali i elementeve');
  });

  it('gives every row a cell for every column', () => {
    // The renderer walks rows against the column list; a short row would draw a
    // case's laboratory in the column where its work belongs.
    const sheet = sheetOf([
      work({ lines: [line(), line()] }),
      work({ lines: [] }),
      work({ lines: [line()] }),
    ]);
    for (const row of sheet.rows as SheetRow[]) {
      assert.equal(row.cells.length, sheet.columns.length);
    }
  });
});
