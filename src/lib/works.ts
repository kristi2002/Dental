/**
 * The works register, minus the database and the screen.
 *
 * Three things live here rather than beside their callers: reading the case a
 * form posted, bucketing the register by month, and flattening it for export.
 * All pure, all testable, and none of them belongs in a `'use server'` module —
 * everything exported from one of those has to be an async action.
 */

import { addDays, addMonths, startOfMonth, toDay, today, toMonthKey } from './dates';
import { formatToothSpan, parseToothSpan, spanCodes, spanElements } from './tooth-span';
import { matches } from './utils';

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

export type DraftLine = {
  elements: number;
  procedure: string;
  /**
   * Which `WorkProcedure` row was picked, when one was.
   *
   * The same pair as `lab`/`labId` below, added for the same reason and one
   * release later: the name is what the docket said and the id is what the
   * quarter's invoice is counted by. Empty on a case written before the
   * catalogue had ids, and on a line whose kind of work has since been retired
   * out of the picker — both keep their `procedure` text and read exactly as
   * before.
   */
  procedureId: string;
  /** The laboratory's name, snapshotted onto the line. */
  lab: string;
  /**
   * Which `Lab` row was picked, when one was.
   *
   * Empty on a case written before laboratories were rows, and on a line whose
   * laboratory has since been retired out of the picker — both of which keep
   * their `lab` text and are readable exactly as before.
   */
  labId: string;
  teeth: string;
};

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
    const { elements, procedure, procedureId, lab, labId, teeth } = entry as Record<
      string,
      unknown
    >;

    // Re-read rather than trusted: what arrives is whatever the chart last put
    // in a hidden field, and it comes back canonical — chart order, one entry
    // per position, nothing in it that is not a tooth.
    const span = typeof teeth === 'string' ? formatToothSpan(parseToothSpan(teeth)) : '';

    const line = {
      // A span of five positions is five elements and cannot be anything else,
      // so it settles the count. The number box is only asked when no teeth were
      // named — a denture, a repair — which is the one case it can still be
      // right about. See `spanElements`.
      elements: span ? spanElements(span) : toElementCount(elements),
      procedure: typeof procedure === 'string' ? procedure.trim().slice(0, FIELD_LIMIT) : '',
      // Checked against the catalogue by `saveWork`, never trusted — see
      // `labId` below, which says why at length and says it for both.
      procedureId: typeof procedureId === 'string' ? procedureId.trim().slice(0, FIELD_LIMIT) : '',
      lab: typeof lab === 'string' ? lab.trim().slice(0, FIELD_LIMIT) : '',
      // Read back like everything else here, and checked against the catalogue
      // by `saveWork` rather than trusted: this arrives in a hidden field, and a
      // foreign key taken on faith from one is a foreign key somebody can point
      // anywhere.
      labId: typeof labId === 'string' ? labId.trim().slice(0, FIELD_LIMIT) : '',
      teeth: span,
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
  dueAt: Date | null;
  receivedAt: Date | null;
  urgent: boolean;
  lines: ReadonlyArray<{
    elements: number;
    procedure: string;
    lab: string | null;
    teeth: string | null;
  }>;
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

/**
 * How near a case is to the day it was promised back.
 *
 * `open` covers both ends of the harmless middle: a case with no promised date
 * at all, and one whose date is far enough off to be nobody's problem today.
 * That is deliberate — the register should only colour a row when the colour
 * means "do something", and a bridge due in three weeks does not.
 */
export type WorkStatus = 'received' | 'overdue' | 'dueToday' | 'dueSoon' | 'open';

/** How far ahead counts as "coming up". Two working days plus the weekend. */
export const DUE_SOON_DAYS = 3;

export type DatedWork = { dueAt: Date | null; receivedAt: Date | null };

export function workStatus(work: DatedWork, on: Date = today()): WorkStatus {
  // Back is back. A case that came in late is not still late — it is finished,
  // and leaving it red would mean the register never goes quiet.
  if (work.receivedAt) return 'received';
  if (!work.dueAt) return 'open';

  const day = toDay(on);
  const due = toDay(work.dueAt).getTime();

  if (due < day.getTime()) return 'overdue';
  if (due === day.getTime()) return 'dueToday';
  return due <= addDays(day, DUE_SOON_DAYS).getTime() ? 'dueSoon' : 'open';
}

/** Still out at the laboratory, whatever its promised date says. */
export function isOutstanding(work: Pick<DatedWork, 'receivedAt'>): boolean {
  return work.receivedAt === null;
}

/**
 * Whole days past the promise, or 0 for anything not overdue.
 *
 * What the register prints next to a late case — "4 days" is a sentence a
 * practice can ring a laboratory with, and a bare date is not.
 */
export function daysLate(work: DatedWork, on: Date = today()): number {
  if (work.receivedAt || !work.dueAt) return 0;
  const diff = toDay(on).getTime() - toDay(work.dueAt).getTime();
  return diff > 0 ? Math.round(diff / 86_400_000) : 0;
}

/**
 * The chase list: everything still out, most pressing first.
 *
 * Urgent beats the date rather than the other way round — the flag exists to
 * jump a case that would otherwise sort into next week, and a chase list that
 * sorted purely by date could not express it. Within one level of urgency the
 * oldest promise leads, and a case with no promised date sorts last, because
 * nothing about it says it is late.
 */
/** Sentinel for "no laboratory written on this line" — never a real lab name. */
export const NO_LAB = '__none__';

/**
 * One laboratory's name, folded the way the filter compares it.
 *
 * Trimmed and lower-cased, matching the backfill in
 * `20260826000001_laboratories` exactly — and it has to. The filter is driven
 * from the `Lab` catalogue, whose name is the *most-used* spelling, while every
 * line keeps the spelling its own docket carried. An exact comparison would
 * therefore hide every case written "dentaltech" the moment the catalogue
 * settled on "DentalTech", which is the register losing rows to a tidy-up.
 */
function foldLab(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Which cases the register is showing: any, still out, late, or back.
 *
 * `''` is "don't ask", not a fourth state — it is what the filter posts when
 * nobody has touched it.
 */
export type WorkFilterStatus = '' | 'out' | 'late' | 'back';

export function toWorkFilterStatus(value: string | null | undefined): WorkFilterStatus {
  return value === 'out' || value === 'late' || value === 'back' ? value : '';
}

export type FilterableWork = DatedWork & {
  labSerial: string | null;
  patientName: string;
  phone: string;
  diagnosis: string | null;
  notes: string | null;
  sentAt: Date;
  lines: ReadonlyArray<{ procedure: string; lab: string | null; teeth: string | null }>;
};

export type WorkFilters = {
  query: string;
  lab: string;
  /** `YYYY-MM`, or null for the whole run. */
  month: string | null;
  status: WorkFilterStatus;
};

/**
 * The register, narrowed — the one copy of these rules.
 *
 * The screen and the CSV both used to carry their own version of this, which is
 * a promise ("the file is what was on screen") kept by two pieces of code that
 * had to be edited together and were not checked against each other. Adding the
 * status filter would have made it three.
 *
 * Filtering happens in memory rather than in the query because `matches()` folds
 * accents and `ILIKE` does not — typing *puron* has to find *Purón*.
 */
export function filterWorks<T extends FilterableWork>(
  works: ReadonlyArray<T>,
  filters: WorkFilters,
  on: Date = today(),
): T[] {
  return works.filter((work) => {
    if (filters.month && toMonthKey(work.sentAt) !== filters.month) return false;

    if (filters.status === 'out' && work.receivedAt) return false;
    if (filters.status === 'back' && !work.receivedAt) return false;
    if (filters.status === 'late' && workStatus(work, on) !== 'overdue') return false;

    if (filters.lab === NO_LAB) {
      if (work.lines.some((line) => line.lab?.trim())) return false;
    } else if (
      filters.lab &&
      !work.lines.some((line) => foldLab(line.lab) === foldLab(filters.lab))
    ) {
      return false;
    }

    if (!filters.query) return true;

    // Everything printed on the row is searchable, including the work itself —
    // "who did we send a zirconia bridge for" is the question this answers.
    //
    // The practice's own case number is deliberately not in here any more: it
    // came off the register when the column did, and a register that answers to
    // a number nobody can see is a register with a secret.
    const haystack = [
      work.labSerial ?? '',
      work.patientName,
      work.phone,
      // The span, both ways it can be written: the codes each line now carries,
      // and the free text cases were written with before the chart existed. So
      // "16" finds the bridge that crosses it.
      ...work.lines.map((line) => spanCodes(line.teeth)),
      work.diagnosis ?? '',
      work.notes ?? '',
      ...work.lines.map((line) => line.procedure),
      ...work.lines.map((line) => line.lab ?? ''),
    ];
    return haystack.some((field) => field && matches(field, filters.query));
  });
}

/**
 * The half of that filter a database can answer on its own.
 *
 * The register used to read itself into memory in full — every case ever
 * written, with its lines — and then narrow it. That is fine at forty cases and
 * is the sort of thing that stays fine right up until it is not, because the
 * register only ever grows and a month is the unit anybody reads it in.
 *
 * So the coarse half moves into the query: which month, and whether the case is
 * still out. What stays behind is what SQL cannot do — `matches()` folds accents
 * and `ILIKE` does not, so typing *puron* has to find *Purón*.
 *
 * This is a second copy of rules `filterWorks` owns, which is the thing that
 * function's comment warns about, so it is held to one rule: **the scope may be
 * wider than the filter and must never be narrower.** A row this leaves out is a
 * row the register will never show, and nothing downstream can notice. The two
 * are kept adjacent for the reading, and a test pins the invariant.
 */
export type WorkScope = {
  sentAt?: { gte: Date; lt: Date };
  receivedAt?: null | { not: null };
  dueAt?: { lt: Date };
};

export function workScope(
  filters: Pick<WorkFilters, 'month' | 'status'>,
  on: Date = today(),
): WorkScope {
  const scope: WorkScope = {};

  // Half-open, so a case sent on the last day of the month is in it and one
  // sent on the first of the next is not.
  const start = fromMonthKey(filters.month);
  if (start) scope.sentAt = { gte: start, lt: addMonths(start, 1) };

  // Both of these mean the box has not come back yet; `late` only adds *when*.
  if (filters.status === 'out' || filters.status === 'late') scope.receivedAt = null;
  if (filters.status === 'back') scope.receivedAt = { not: null };

  // `dueAt` is stored at UTC midnight, so "before today" is the comparison
  // `workStatus` already makes — and in SQL it drops the null promises too,
  // which is right: nothing about a case with no promised date says it is late.
  if (filters.status === 'late') scope.dueAt = { lt: toDay(on) };

  return scope;
}

/**
 * Which month the register opens on.
 *
 * The default is the newest month with anything in it, because the month is the
 * unit this register is billed in. The exception is the whole reason the status
 * filter exists: a case that went out in March is exactly the one still missing
 * in August, so asking what is late has to widen the view to every month —
 * otherwise the filter would answer "nothing" while the practice waits on four
 * cases. Naming a month explicitly still wins over both.
 */
export function resolveWorkMonth(
  months: ReadonlyArray<string>,
  requested: string | null | undefined,
  status: WorkFilterStatus = '',
): string | null {
  if (requested === 'all') return null;
  if (requested && fromMonthKey(requested)) return requested;
  if (status) return null;
  return months[0] ?? null;
}

export type ChaseableWork = DatedWork & { urgent: boolean; sentAt: Date };

export function chaseOrder<T extends ChaseableWork>(works: ReadonlyArray<T>): T[] {
  return works
    .filter(isOutstanding)
    .slice()
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      // A case with no promised date sorts behind every case that has one:
      // nothing about it says it is late.
      if (!a.dueAt !== !b.dueAt) return a.dueAt ? -1 : 1;
      if (a.dueAt && b.dueAt && a.dueAt.getTime() !== b.dueAt.getTime()) {
        return a.dueAt.getTime() - b.dueAt.getTime();
      }
      // Same promise, or none on either: the one that went out first has been
      // waiting longest.
      return a.sentAt.getTime() - b.sentAt.getTime();
    });
}

export type WorkHeaders = {
  labSerial: string;
  patientName: string;
  phone: string;
  diagnosis: string;
  elements: string;
  procedure: string;
  lab: string;
  notes: string;
  sentAt: string;
  dueAt: string;
  receivedAt: string;
  urgent: string;
  /** Printed in the urgent column when the flag is set; the cell is blank when it is not. */
  yes: string;
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
  const columns = [
    headers.sentAt,
    headers.dueAt,
    headers.receivedAt,
    headers.labSerial,
    headers.patientName,
    headers.phone,
    headers.urgent,
    // Beside the work rather than beside the patient, because that is where it
    // belongs now: a case with a bridge and a crown on it has two spans, and
    // one column against the patient could only ever hold one of them.
    headers.diagnosis,
    headers.elements,
    headers.procedure,
    headers.lab,
    headers.notes,
  ];
  const rows: string[][] = [columns];

  /** Where the element count sits, so the total row lands under it whatever moves. */
  const elementsAt = columns.indexOf(headers.elements);

  for (const work of works) {
    const head = [
      formatDate(work.sentAt),
      work.dueAt ? formatDate(work.dueAt) : '',
      work.receivedAt ? formatDate(work.receivedAt) : '',
      work.labSerial ?? '',
      work.patientName,
      work.phone,
      // Blank rather than a localised "no": a column of Yes/No is harder to
      // filter in a spreadsheet than a column that is either marked or empty.
      work.urgent ? headers.yes : '',
    ];
    const notes = [work.notes ?? ''];

    if (work.lines.length === 0) {
      rows.push([...head, work.diagnosis ?? '', '', '', '', ...notes]);
      continue;
    }
    for (const line of work.lines) {
      rows.push([
        ...head,
        // FDI codes rather than the drawn notation: a bracket does not survive a
        // spreadsheet cell, and `15` says which corner of the mouth it means on
        // its own where a bare `5` does not. A case written before the chart
        // existed falls back to the free text it was written with, so no span
        // ever drops out of the file.
        spanCodes(line.teeth) || work.diagnosis || '',
        String(line.elements),
        line.procedure,
        line.lab ?? '',
        ...notes,
      ]);
    }
  }

  const total = Array<string>(columns.length).fill('');
  total[elementsAt - 1] = headers.total;
  total[elementsAt] = String(totalElements(works));
  rows.push(total);

  return rows;
}
