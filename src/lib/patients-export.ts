/**
 * The patient list as a spreadsheet.
 *
 * The one thing a register cannot do on a screen is leave it. A practice needs
 * its own list out of the building for the ordinary reasons — a mail merge for
 * recall cards, a hand-over to an accountant, a migration onto whatever comes
 * after this app — and until now the only way out was the encrypted whole-database
 * backup, which is a disaster-recovery artefact and not something anybody opens.
 *
 * ## What is deliberately not in the file
 *
 * `medicalNotes`. It is the one column on `Patient` behind a permission of its
 * own (`patient.medical.view`) — the front desk keeps phone numbers, not
 * diagnoses — and a spreadsheet is exactly the wrong container for it: the file
 * gets emailed, copied to a laptop and kept in a downloads folder for a decade.
 * Making the column appear or vanish depending on who pressed the button would
 * also mean two files with the same name and different shapes, which is worse
 * than one honest file.
 *
 * So this exports the *directory* — who somebody is and how to reach them — and
 * the clinical record stays where it is read, behind the login.
 */

import type { ContactChannel } from '@/generated/prisma/enums';
import { age } from './dates';

/** Column titles, translated by the caller. */
export type PatientHeaders = {
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  age: string;
  address: string;
  fiscalCode: string;
  guardian: string;
  guardianPhone: string;
  emergencyContact: string;
  referralSource: string;
  recallMonths: string;
  consent: string;
  channel: string;
  language: string;
  registered: string;
  archived: string;
  /** Written into the consent column. See the note on `consentCell`. */
  yes: string;
  no: string;
};

/** Exactly the columns this file reads — see the note above on what is absent. */
export type ExportablePatient = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  fiscalCode: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  emergencyContact: string | null;
  referralSource: string | null;
  recallMonths: number;
  contactConsent: boolean | null;
  preferredChannel: ContactChannel | null;
  locale: string | null;
  createdAt: Date;
  archivedAt: Date | null;
};

/**
 * Consent is three answers, not two, so the column cannot be the marked-or-empty
 * shape the works export uses for `urgent`.
 *
 * `null` means nobody has asked yet, which is a different fact from "no" and the
 * honest state of every record written before the question existed — see
 * `Patient.contactConsent`. Blank is the only cell that can carry "unknown"
 * without inventing a word for it, so the two real answers are spelled out.
 */
function consentCell(value: boolean | null, headers: PatientHeaders): string {
  if (value === null) return '';
  return value ? headers.yes : headers.no;
}

/**
 * One row per patient, in the order the screen lists them.
 *
 * No total row, unlike the works register: there is nothing here to sum. A count
 * of patients is the number of rows, which every spreadsheet shows in its own
 * status bar without being told.
 *
 * Cells are `string | number` rather than all strings, which is what `csvCell`
 * already accepts. The two numeric columns — age and the recall interval — are
 * arithmetic somebody will want to do in the spreadsheet, and a number written
 * as text arrives left-aligned and refuses to sort.
 */
export function patientsToRows(
  patients: ReadonlyArray<ExportablePatient>,
  headers: PatientHeaders,
  formatDate: (value: Date) => string,
  /** Today, so the age column is reproducible in a test. */
  on?: Date,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    [
      headers.lastName,
      headers.firstName,
      headers.phone,
      headers.email,
      headers.dateOfBirth,
      headers.age,
      headers.address,
      headers.fiscalCode,
      headers.guardian,
      headers.guardianPhone,
      headers.emergencyContact,
      headers.referralSource,
      headers.recallMonths,
      headers.consent,
      headers.channel,
      headers.language,
      headers.registered,
      headers.archived,
    ],
  ];

  for (const patient of patients) {
    rows.push([
      // Surname first, as every list in the app orders them — a spreadsheet
      // sorted on column A should come out in the order the screen was in.
      patient.lastName,
      patient.firstName,
      patient.phone,
      patient.email ?? '',
      patient.dateOfBirth ? formatDate(patient.dateOfBirth) : '',
      // Alongside the date rather than instead of it: the date is the fact, and
      // the age is what somebody scanning the column actually wants. Blank when
      // there is no date of birth, rather than 0, which would read as a newborn.
      patient.dateOfBirth ? age(patient.dateOfBirth, on) : '',
      patient.address ?? '',
      patient.fiscalCode ?? '',
      patient.guardianName ?? '',
      patient.guardianPhone ?? '',
      patient.emergencyContact ?? '',
      patient.referralSource ?? '',
      // 0 is a real answer — recall switched off for this person — so it is
      // written rather than blanked. See `Patient.recallMonths`.
      patient.recallMonths,
      consentCell(patient.contactConsent, headers),
      patient.preferredChannel ?? '',
      patient.locale ?? '',
      formatDate(patient.createdAt),
      // Only ever filled on the archived view, where it is the whole point of
      // the column; blank everywhere else rather than absent, so both views
      // produce a file of the same shape.
      patient.archivedAt ? formatDate(patient.archivedAt) : '',
    ]);
  }

  return rows;
}
