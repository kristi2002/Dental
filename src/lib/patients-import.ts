/**
 * Reading a patient list somebody else kept.
 *
 * Every practice that adopts this app arrives holding a list — nine years of
 * Excel, or an export out of whatever they used before — and until now the only
 * way in was to type it. Three thousand people at a minute each is a week of
 * somebody's life, so in practice the list does not come in at all: it stays in
 * the spreadsheet beside the app, and the app is wrong from its first day.
 *
 * The whole design here follows from one judgement: **the file is not going to
 * be clean, and refusing it is not an answer.** So nothing throws. Every row
 * comes back either as a draft patient or as a draft patient with a list of
 * problems attached, the screen shows both, and the person importing decides.
 * A file where half the rows are unusable should still bring in the other half.
 *
 * The counterpart of `patients-export.ts`, and it reads that file too — a list
 * exported from one practice imports into another without being touched.
 */

import { matchColumns } from './csv-parse';
import { phoneKey } from './patient-search';

/**
 * How many rows one import may carry.
 *
 * A practice's whole history is a few thousand people, so this is not a limit
 * anybody meets honestly — it is a bound on what a single request can be made to
 * do. The drafts cross to the server as one JSON string in a form post, and
 * without a cap a pasted 200 MB file becomes a server holding 200 MB of strings
 * and a `createMany` that never returns.
 *
 * Lives here rather than beside the action that enforces it because a module
 * marked `'use server'` may only export async functions — and because the
 * browser needs the same number, to stop before it has read the file twice.
 */
export const IMPORT_LIMIT = 5000;

export const IMPORT_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'dateOfBirth',
  'address',
  'fiscalCode',
  'guardianName',
  'guardianPhone',
  'emergencyContact',
  'referralSource',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/**
 * What a column might be called, in the three languages the app speaks plus the
 * English a spreadsheet is likely to already be in.
 *
 * Matched through `normaliseHeader`, so case, accents and punctuation are
 * already handled and only the *words* need listing here. The app's own export
 * titles lead each list, which is what makes a file that came out of this app
 * go straight back into another copy of it.
 */
export const PATIENT_ALIASES: Record<ImportField, readonly string[]> = {
  lastName: ['Mbiemri', 'Cognome', 'Last name', 'Surname', 'Family name'],
  firstName: ['Emri', 'Nome', 'First name', 'Name', 'Given name'],
  phone: ['Telefoni', 'Telefono', 'Phone', 'Mobile', 'Cel', 'Celular', 'Tel'],
  email: ['Email', 'E-mail', 'Posta elektronike'],
  dateOfBirth: ['Datëlindja', 'Data di nascita', 'Date of birth', 'DOB', 'Ditelindja'],
  address: ['Adresa', 'Indirizzo', 'Address'],
  fiscalCode: ['NIPT', 'Codice fiscale', 'Fiscal code', 'Tax code'],
  guardianName: ['Kujdestari', 'Genitore', 'Guardian', 'Parent'],
  guardianPhone: ['Telefoni i kujdestarit', 'Telefono del genitore', 'Guardian phone'],
  emergencyContact: ['Kontakt urgjence', 'Contatto di emergenza', 'Emergency contact'],
  referralSource: ['Burimi', 'Come ci ha conosciuto', 'Referral source', 'Source'],
};

/** The two columns without which a row is not a person. */
export const REQUIRED_FIELDS: readonly ImportField[] = ['lastName', 'phone'];

/** What can be wrong with a row. Each is shown against the row on the screen. */
export type ImportProblem =
  /** No surname, or no name at all. */
  | 'noName'
  /** No phone number — the one thing every list in the app is reached by. */
  | 'noPhone'
  /** A date of birth that could not be read; the rest of the row is still good. */
  | 'badDate'
  /** Another row in this same file already claimed the number. */
  | 'duplicateInFile'
  /** Somebody in the practice already has the number. Decided by the server. */
  | 'alreadyHere';

export type DraftPatient = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  dateOfBirth: string | null;
  address: string | null;
  fiscalCode: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  emergencyContact: string | null;
  referralSource: string | null;
};

export type ImportRow = {
  /** Which line of the file this was, counting the header as line 1. */
  line: number;
  draft: DraftPatient;
  problems: ImportProblem[];
};

/**
 * Problems that mean the row cannot be written. `badDate` is not one of them —
 * the date is dropped and the person still comes in, because a patient with no
 * birthday is a smaller loss than a patient who was not imported.
 */
const FATAL: ReadonlySet<ImportProblem> = new Set<ImportProblem>([
  'noName',
  'noPhone',
  'duplicateInFile',
  'alreadyHere',
]);

export function isImportable(row: ImportRow): boolean {
  return !row.problems.some((problem) => FATAL.has(problem));
}

/**
 * One cell, cleaned of what a spreadsheet does to it.
 *
 * The leading apostrophe is Excel's "this is text" marker, and it is not
 * decoration: `csv.ts` *writes* one in front of every phone number so Excel does
 * not evaluate `+355…` as arithmetic. Left alone, a list exported from this app
 * and imported into another copy would arrive with every number starting `'`.
 */
function cell(value: string | undefined): string {
  return (value ?? '').replace(/^'/, '').trim();
}

/** Empty means "not given", which is `null` in the database rather than `''`. */
function optional(value: string | undefined): string | null {
  return cell(value) || null;
}

/**
 * A date of birth, out of whatever the sending machine writes.
 *
 * **Day first when it is ambiguous.** `03/04/1990` is the third of April here
 * and in Italy, and reading it the American way would silently move a birthday
 * — the kind of wrong that is never noticed because both readings are plausible
 * dates. An ISO `1990-04-03` is unambiguous and is read as itself.
 *
 * Returns a `YYYY-MM-DD` key rather than a `Date`, so this stays pure and the
 * value survives being posted back to the server as JSON.
 */
export function parseImportDate(value: string): string | null {
  const text = cell(value);
  if (!text) return null;

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);

  let year: number;
  let month: number;
  let day: number;

  if (iso) [, year, month, day] = iso.map(Number) as [number, number, number, number];
  else if (dmy) {
    const [, d, m, y] = dmy.map(Number) as [number, number, number, number];
    year = y;
    month = m;
    day = d;
  } else return null;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Catches the 31st of February, which the constructor rolls forward rather
  // than rejecting — a rolled date is a wrong birthday nobody would spot.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  // A list of living patients has no birthdays in the future and none before
  // photography. Both ends catch a column that is not a date of birth at all.
  const thisYear = new Date().getUTCFullYear();
  if (year < 1890 || year > thisYear) return null;

  return date.toISOString().slice(0, 10);
}

export type ImportReading = {
  /** Where each field was found, or -1. Shown so somebody can check the guess. */
  columns: Record<ImportField, number>;
  /** Required fields the file has no column for at all. */
  missing: ImportField[];
  rows: ImportRow[];
};

/**
 * The parsed grid as draft patients.
 *
 * The header row is required. A file with no titles could only be read by
 * guessing what its columns mean from their contents, and guessing wrong here
 * writes somebody's phone number into the address field of a medical record.
 */
export function readPatients(grid: readonly string[][]): ImportReading {
  const [header, ...body] = grid;
  const columns = matchColumns(header ?? [], PATIENT_ALIASES);
  const missing = REQUIRED_FIELDS.filter((field) => columns[field] === -1);

  const at = (row: readonly string[], field: ImportField) =>
    columns[field] === -1 ? undefined : row[columns[field]];

  /** Numbers already claimed by an earlier row of this same file. */
  const claimed = new Set<string>();
  const rows: ImportRow[] = [];

  for (const [index, raw] of body.entries()) {
    const problems: ImportProblem[] = [];

    const rawLast = cell(at(raw, 'lastName'));
    const rawFirst = cell(at(raw, 'firstName'));
    const phone = cell(at(raw, 'phone'));

    // A row with only one name keeps it, in the surname — which is the column
    // every list in the app sorts and searches by, so the person is findable
    // rather than filed under a blank. A list of nine years is full of rows
    // with the whole name in one cell.
    const lastName = rawLast || rawFirst;
    const firstName = rawLast ? rawFirst : '';

    if (!lastName) problems.push('noName');
    if (!phone) problems.push('noPhone');

    const rawDate = cell(at(raw, 'dateOfBirth'));
    const dateOfBirth = parseImportDate(rawDate);
    // Only a problem if something was written and could not be read. A blank
    // birthday column is an ordinary gap, not a fault in the file.
    if (rawDate && !dateOfBirth) problems.push('badDate');

    if (phone) {
      const key = phoneKey(phone);
      if (key && claimed.has(key)) problems.push('duplicateInFile');
      else if (key) claimed.add(key);
    }

    rows.push({
      // +2: the header is line 1, and `entries()` counts from zero.
      line: index + 2,
      draft: {
        firstName,
        lastName,
        phone,
        email: optional(at(raw, 'email')),
        dateOfBirth,
        address: optional(at(raw, 'address')),
        fiscalCode: optional(at(raw, 'fiscalCode')),
        guardianName: optional(at(raw, 'guardianName')),
        guardianPhone: optional(at(raw, 'guardianPhone')),
        emergencyContact: optional(at(raw, 'emergencyContact')),
        referralSource: optional(at(raw, 'referralSource')),
      },
      problems,
    });
  }

  return { columns, missing, rows };
}
