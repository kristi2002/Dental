/**
 * The works register, minus the database and the screen.
 *
 * Two things live here rather than beside their callers: reading the case a form
 * posted, and flattening the register for export. Both are pure, both are
 * testable, and neither belongs in a `'use server'` module — everything exported
 * from one of those has to be an async action.
 */

/** A case is a handful of items, never an import. Past this, something is wrong. */
export const MAX_WORK_LINES = 40;

/** Long enough for "harku i sipërm, pa 26" and short enough to print in a cell. */
const FIELD_LIMIT = 200;

export type DraftLine = { elements: string; procedure: string; lab: string };

/**
 * The rows of the case, as posted by the builder in one hidden JSON field.
 *
 * Same shape as `parseDraftSteps` in `plans.ts`, and for the same reason: the
 * whole case is written before anything is saved, so the lines travel with the
 * row they belong to rather than being added one dialog at a time afterwards.
 * Anything malformed is dropped rather than guessed at.
 */
export function parseDraftLines(raw: string): DraftLine[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const clean = (value: unknown) =>
    typeof value === 'string' ? value.trim().slice(0, FIELD_LIMIT) : '';

  const lines: DraftLine[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { elements, procedure, lab } = entry as Record<string, unknown>;

    const line = {
      elements: clean(elements),
      procedure: clean(procedure),
      lab: clean(lab),
    };
    // A row with nothing on it is not a piece of work — it is a blank somebody
    // tabbed past. The procedure is what makes it one.
    if (!line.procedure) continue;

    lines.push(line);
    if (lines.length === MAX_WORK_LINES) break;
  }
  return lines;
}

/** Just enough of a row to export it. Kept structural so the query can pick fields. */
export type ExportableWork = {
  number: number;
  labSerial: string | null;
  patientName: string;
  phone: string;
  diagnosis: string | null;
  notes: string | null;
  createdAt: Date;
  lines: ReadonlyArray<{ elements: string; procedure: string; lab: string | null }>;
};

/**
 * The register as a spreadsheet: **one row per piece of work**, not one per case.
 *
 * On screen the case is one row with its work stacked inside a cell, which is
 * how the paper register reads. A spreadsheet is not read, it is sorted and
 * filtered and counted — and none of that works on a cell holding four lines of
 * text. So the case's own columns repeat down its items, which is the shape
 * that answers "how many bridges did we send to this lab in March".
 *
 * A case with no items still exports one row, with its work columns empty:
 * dropping it would mean the file quietly holds fewer cases than the screen.
 */
export function worksToRows(
  works: ReadonlyArray<ExportableWork>,
  headers: {
    number: string;
    labSerial: string;
    patientName: string;
    phone: string;
    diagnosis: string;
    elements: string;
    procedure: string;
    lab: string;
    notes: string;
    createdAt: string;
  },
  formatDate: (value: Date) => string,
): string[][] {
  const rows: string[][] = [
    [
      headers.number,
      headers.labSerial,
      headers.patientName,
      headers.phone,
      headers.diagnosis,
      headers.elements,
      headers.procedure,
      headers.lab,
      headers.notes,
      headers.createdAt,
    ],
  ];

  for (const work of works) {
    const head = [
      String(work.number),
      work.labSerial ?? '',
      work.patientName,
      work.phone,
      work.diagnosis ?? '',
    ];
    const tail = [work.notes ?? '', formatDate(work.createdAt)];

    if (work.lines.length === 0) {
      rows.push([...head, '', '', '', ...tail]);
      continue;
    }
    for (const line of work.lines) {
      rows.push([...head, line.elements, line.procedure, line.lab ?? '', ...tail]);
    }
  }

  return rows;
}
