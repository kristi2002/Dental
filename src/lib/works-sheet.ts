/**
 * The works register, shaped for paper.
 *
 * The spreadsheet and the sheet want opposite things out of the same rows, which
 * is why this is not `worksToRows` with a different separator. A spreadsheet is
 * sorted and filtered and summed, so it gets one flat row per piece of work with
 * the case's own columns repeated down its items — see the note on `worksToRows`.
 * A sheet is *read*, in order, by somebody holding an invoice next to it, so it
 * gets what the paper ledger and the screen both give: the case written once,
 * its items listed under it, and a rule between one case and the next.
 *
 * What the two share is the thing that matters — `filterWorks` decides which
 * cases either of them contains, so "the file is what was on screen" stays one
 * promise kept in one place rather than three implementations that have to be
 * edited together.
 *
 * Pure, and separate from `pdf.ts`, so the shape of the register can be tested
 * without rendering a PDF to assert against.
 */

import { daysLate, elementsOf, totalElements, workStatus, type ExportableWork } from './works';
import { SHEET_SMALL, type SheetSpan } from './pdf';
import type { SheetColumn, SheetRow } from './pdf-sheet';
import { spanCodes } from './tooth-span';
import { today } from './dates';

/**
 * The columns, in the order the register is read in, and how wide each one wants
 * to be relative to the others. They are weights rather than millimetres — see
 * `SheetColumn` — so this one list prints on any paper.
 *
 * The order is the screen's order, which is the paper ledger's order: when it
 * went out, when it is due, whose it is, and then what was actually made, with
 * the tick column last because it is the only one the paper is written on. The
 * two columns that hold sentences get the width; the four that hold dates and
 * counts take what they need and no more.
 */
const COLUMNS = [
  { key: 'sentAt', weight: 6 },
  { key: 'dueAt', weight: 7.5 },
  // Wider than the four digits in it, because the *heading* is the widest thing
  // in this column in every language the app speaks — `Nr. serial i lab.` over a
  // column of serials like 1041.
  { key: 'labSerial', weight: 7.5 },
  { key: 'patientName', weight: 17 },
  { key: 'teeth', weight: 11 },
  { key: 'elements', weight: 4, align: 'right' as const },
  { key: 'procedure', weight: 17.5 },
  { key: 'lab', weight: 11.5 },
  // The one column that arrives empty: a box per case for whoever is reading
  // the sheet with the laboratory's invoice beside it, ticked as each case is
  // found on it. It sits at the end because the tick is what the reader does
  // *after* reading the row, and because the eight columns before it are the
  // register's order — the screen's, and the paper ledger's — which a column of
  // empty boxes has no business getting in front of. Its width is the heading's
  // rather than the box's: `KONTROLL` in the heading's caps is four times the
  // width of the square under it.
  { key: 'check', weight: 7, box: true as const },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

/** Where the element count sits, so the totals land under it whatever else moves. */
const ELEMENTS_AT = COLUMNS.findIndex((column) => column.key === 'elements');

export type WorkSheetLabels = Record<ColumnKey, string> & {
  /** The abbreviation the column heading uses — the full word will not fit. */
  elementsShort: string;
  /** Set against the patient's name when the case is flagged. */
  urgent: string;
  /** Printed under the date a case came back on. */
  statusBack: string;
  /** "{days} days late", for a case that has not. */
  lateBy: (days: number) => string;
  /** The label on both the per-case subtotal and the month's own total. */
  total: string;
  /** What a register with nothing in it says instead of a table. */
  empty: string;
};

export type WorkSheet = {
  columns: SheetColumn[];
  rows: SheetRow[];
  total: { label: string; value: string; column: number };
};

/** A cell that is one plain run of type, which most of them are. */
const cell = (text: string, span: Omit<SheetSpan, 'text'> = {}): SheetSpan[] =>
  text ? [{ text, ...span }] : [];

/**
 * The tick box, which is a cell with nothing in it in a column that draws boxes
 * rather than type — see `SheetColumn.box`. Only ever set on the row that opens
 * a case: `null` underneath is what makes the case's four items share one box.
 */
const BOX: SheetSpan[] = [];

/**
 * The register as a printable table.
 *
 * `formatDate` is passed in rather than chosen here because the sheet's dates
 * have to read the way the rest of the register reads them, and that is the
 * locale's business — the same reason `worksToRows` takes one.
 */
export function worksToSheet(
  works: ReadonlyArray<ExportableWork>,
  labels: WorkSheetLabels,
  formatDate: (value: Date) => string,
  on: Date = today(),
): WorkSheet {
  const columns: SheetColumn[] = COLUMNS.map((column) => ({
    header: column.key === 'elements' ? labels.elementsShort : labels[column.key],
    width: column.weight,
    align: 'align' in column ? column.align : undefined,
    box: 'box' in column ? column.box : undefined,
  }));

  const rows: SheetRow[] = [];

  for (const work of works) {
    // When it is due, and what that means today. A date on its own does not say
    // whether somebody should be ringing the laboratory this morning, and that
    // is the whole reason this column exists — so the state is written under it
    // in words rather than left as a colour the printer may not have.
    const due: SheetSpan[] = [];
    if (work.receivedAt) {
      due.push({ text: formatDate(work.receivedAt), tone: 'soft' });
      due.push({ text: labels.statusBack, size: SHEET_SMALL, tone: 'faint' });
    } else if (work.dueAt) {
      due.push({ text: formatDate(work.dueAt), tone: 'soft' });
      if (workStatus(work, on) === 'overdue') {
        due.push({ text: labels.lateBy(daysLate(work, on)), size: SHEET_SMALL, bold: true });
      }
    }

    // Who it is for, and how to reach them — the two facts a chase needs, in the
    // order the ledger keeps them. The note goes here too, under the name, which
    // is where the screen puts it and the only column wide enough to hold one.
    const patient: SheetSpan[] = [{ text: work.patientName, bold: true }];
    if (work.urgent) patient.push({ text: labels.urgent.toUpperCase(), size: SHEET_SMALL, bold: true });
    if (work.phone.trim()) patient.push({ text: work.phone, size: SHEET_SMALL, tone: 'soft' });
    if (work.notes?.trim()) patient.push({ text: work.notes, size: SHEET_SMALL, tone: 'faint' });

    const head: (SheetSpan[] | null)[] = [
      cell(formatDate(work.sentAt), { tone: 'soft' }),
      due,
      cell(work.labSerial ?? '', { bold: true }),
      patient,
    ];
    // Every row after the first continues the case rather than repeating it.
    const continued: (SheetSpan[] | null)[] = [null, null, null, null];

    if (work.lines.length === 0) {
      rows.push({
        opensGroup: true,
        cells: [...head, cell('—', { tone: 'faint' }), [], [], [], BOX],
      });
      continue;
    }

    for (const [index, line] of work.lines.entries()) {
      rows.push({
        opensGroup: index === 0,
        cells: [
          ...(index === 0 ? head : continued),
          // FDI codes rather than the drawn bracket: the notation the chart
          // paints is a piece of layout, and `15` says which corner of the mouth
          // it means where a bare `5` does not. A case written before the chart
          // existed falls back to the free text it was written with, so no span
          // drops off the sheet.
          cell(spanCodes(line.teeth) || work.diagnosis || '—', { tone: 'soft' }),
          cell(String(line.elements), { bold: true }),
          cell(line.procedure, { bold: true }),
          cell(line.lab ?? '', { tone: 'soft' }),
          index === 0 ? BOX : null,
        ],
      });
    }

    // A case's own count, when it has more than one thing in it. The same row
    // the screen draws, and for the same reason: an invoice is queried a case at
    // a time, and adding four numbers up by eye is how the wrong one gets paid.
    if (work.lines.length > 1) {
      rows.push({
        cells: [
          ...continued,
          cell(labels.total, { size: SHEET_SMALL, tone: 'faint', bold: true }),
          cell(String(elementsOf(work)), { bold: true }),
          [],
          [],
          // The case's box is the one on its first row; a second one here would
          // read as a second thing to tick.
          null,
        ],
      });
    }
  }

  return {
    columns,
    rows,
    total: {
      label: labels.total,
      value: String(totalElements(works)),
      column: ELEMENTS_AT,
    },
  };
}
