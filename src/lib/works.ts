/**
 * The works register, minus the database and the screen.
 *
 * Three things live here rather than beside their callers: reading the case a
 * form posted, bucketing the register by month, and flattening it for export.
 * All pure, all testable, and none of them belongs in a `'use server'` module —
 * everything exported from one of those has to be an async action.
 */

import { startOfMonth, toMonthKey } from './dates';

/** A case is a handful of items, never an import. Past this, something is wrong. */
export const MAX_WORK_LINES = 40;

/** Long enough for "harku i sipërm, pa 26" and short enough to print in a cell. */
const FIELD_LIMIT = 200;

/**
 * A bridge is not fifty units. The cap is here so a slipped keystroke in the one
 * column the practice checks its invoices against cannot quietly add a thousand
 * elements to the month.
 */
export const MAX_ELEMENTS = 99;

export type DraftLine = { elements: number; procedure: string; lab: string };

/** A count of elements, clamped to something a docket could actually say. */
export function toElementCount(value: unknown, fallback = 1): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_ELEMENTS, Math.max(0, Math.trunc(parsed)));
}

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

  const lines: DraftLine[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { elements, procedure, lab } = entry as Record<string, unknown>;

    const line = {
      elements: toElementCount(elements),
      procedure: typeof procedure === 'string' ? procedure.trim().slice(0, FIELD_LIMIT) : '',
      lab: typeof lab === 'string' ? lab.trim().slice(0, FIELD_LIMIT) : '',
    };
    // A row with nothing on it is not a piece of work — it is a blank somebody
    // tabbed past. The procedure is what makes it one.
    if (!line.procedure) continue;

    lines.push(line);
    if (lines.length === MAX_WORK_LINES) break;
  }
  return lines;
}

/** Just enough of a row to count and export it. Structural, so the query can pick fields. */
export type ExportableWork = {
  number: number;
  labSerial: string | null;
  patientName: string;
  phone: string;
  diagnosis: string | null;
  notes: string | null;
  sentAt: Date;
  lines: ReadonlyArray<{ elements: number; procedure: string; lab: string | null }>;
};

/**
 * How many elements went out on this case.
 *
 * The number the whole register exists to produce. A laboratory bills by the
 * element, and the invoice is the only other copy of this figure — which is
 * exactly why the practice keeps its own.
 */
export function elementsOf(work: Pick<ExportableWork, 'lines'>): number {
  return work.lines.reduce((total, line) => total + line.elements, 0);
}

/** The same sum across a whole month, or whatever else is on screen. */
export function totalElements(works: ReadonlyArray<Pick<ExportableWork, 'lines'>>): number {
  return works.reduce((total, work) => total + elementsOf(work), 0);
}

/**
 * Every month the register has anything in, newest first, as `YYYY-MM`.
 *
 * Built from the rows rather than from a range of dates: a practice that started
 * keeping this in March should not be offered January, and one that missed a
 * month should not be offered it either.
 */
export function monthsPresent(works: ReadonlyArray<{ sentAt: Date }>): string[] {
  return [...new Set(works.map((work) => toMonthKey(work.sentAt)))].sort().reverse();
}

/** `YYYY-MM` back to the month it names, or null if it is not one. */
export function fromMonthKey(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const parsed = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : startOfMonth(parsed);
}

/** Whether a case belongs to the month named, `null` meaning every month. */
export function inMonth(work: { sentAt: Date }, monthKey: string | null): boolean {
  return !monthKey || toMonthKey(work.sentAt) === monthKey;
}

export type WorkHeaders = {
  number: string;
  labSerial: string;
  patientName: string;
  phone: string;
  diagnosis: string;
  elements: string;
  procedure: string;
  lab: string;
  notes: string;
  sentAt: string;
  total: string;
};

/**
 * The register as a spreadsheet: **one row per piece of work**, not per case.
 *
 * On screen the case is one row with its work stacked inside a cell, which is
 * how the paper register reads. A spreadsheet is not read, it is sorted and
 * filtered and summed — and none of that works on a cell holding four lines of
 * text. So the case's own columns repeat down its items, which is the shape that
 * answers "how many elements did we send this laboratory in March".
 *
 * A case with no items still exports one row, with its work columns empty:
 * dropping it would mean the file quietly holds fewer cases than the screen.
 *
 * The last row is the total. It is the figure the month's invoice is checked
 * against, so it is written into the file rather than left for whoever opens it
 * to select a column and hope they caught every row.
 */
export function worksToRows(
  works: ReadonlyArray<ExportableWork>,
  headers: WorkHeaders,
  formatDate: (value: Date) => string,
): string[][] {
  const rows: string[][] = [
    [
      headers.sentAt,
      headers.number,
      headers.labSerial,
      headers.patientName,
      headers.phone,
      headers.diagnosis,
      headers.elements,
      headers.procedure,
      headers.lab,
      headers.notes,
    ],
  ];

  for (const work of works) {
    const head = [
      formatDate(work.sentAt),
      String(work.number),
      work.labSerial ?? '',
      work.patientName,
      work.phone,
      work.diagnosis ?? '',
    ];
    const notes = [work.notes ?? ''];

    if (work.lines.length === 0) {
      rows.push([...head, '', '', '', ...notes]);
      continue;
    }
    for (const line of work.lines) {
      rows.push([...head, String(line.elements), line.procedure, line.lab ?? '', ...notes]);
    }
  }

  rows.push(['', '', '', '', '', headers.total, String(totalElements(works)), '', '', '']);

  return rows;
}
