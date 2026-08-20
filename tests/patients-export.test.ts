import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toCsv } from '../src/lib/csv';
import {
  patientsToRows,
  type ExportablePatient,
  type PatientHeaders,
} from '../src/lib/patients-export';

/** The columns `patientsToRows` writes, so the assertions below can name them. */
const HEADERS: PatientHeaders = {
  lastName: 'Mbiemri',
  firstName: 'Emri',
  phone: 'Telefoni',
  email: 'Email',
  dateOfBirth: 'Datëlindja',
  age: 'Mosha',
  address: 'Adresa',
  fiscalCode: 'NIPT',
  guardian: 'Kujdestari',
  guardianPhone: 'Telefoni i kujdestarit',
  emergencyContact: 'Kontakt urgjence',
  referralSource: 'Burimi',
  recallMonths: 'Rikthimi',
  consent: 'Pëlqimi',
  channel: 'Kanali',
  language: 'Gjuha',
  registered: 'Regjistruar',
  archived: 'Arkivuar',
  yes: 'Po',
  no: 'Jo',
};

const COLUMNS = patientsToRows([], HEADERS, () => '')[0];
const at = (name: string) => COLUMNS.indexOf(name);

/** A day to measure ages against, so the expected numbers never move. */
const TODAY = new Date(Date.UTC(2026, 7, 20));

function patient(overrides: Partial<ExportablePatient> = {}): ExportablePatient {
  return {
    firstName: 'Arta',
    lastName: 'Krasniqi',
    phone: '+355 69 65 84 447',
    email: null,
    dateOfBirth: null,
    address: null,
    fiscalCode: null,
    guardianName: null,
    guardianPhone: null,
    emergencyContact: null,
    referralSource: null,
    recallMonths: 6,
    contactConsent: null,
    preferredChannel: null,
    locale: null,
    createdAt: new Date(Date.UTC(2024, 2, 14)),
    archivedAt: null,
    ...overrides,
  };
}

const iso = (value: Date) => value.toISOString().slice(0, 10);
const rowsFor = (people: ExportablePatient[]) => patientsToRows(people, HEADERS, iso, TODAY);

describe('patientsToRows — the directory flattened for a spreadsheet', () => {
  it('writes the column titles first and one row per patient, surname first', () => {
    const rows = rowsFor([
      patient({ lastName: 'Krasniqi', firstName: 'Arta' }),
      patient({ lastName: 'Bulaj', firstName: 'Ahmedin' }),
    ]);

    assert.equal(rows.length, 3);
    assert.equal(rows[0][0], HEADERS.lastName);
    assert.equal(rows[0][1], HEADERS.firstName);
    // Order is the caller's — the route asks the database for it — so the rows
    // come out exactly as handed in rather than re-sorted here.
    assert.deepEqual(
      rows.slice(1).map((row) => row[0]),
      ['Krasniqi', 'Bulaj'],
    );
  });

  it('carries no medical column at all', () => {
    // The point of the file, stated as a test: whatever else moves, the one
    // column behind `patient.medical.view` must never appear in it.
    const rows = rowsFor([patient()]);
    for (const title of COLUMNS) {
      assert.ok(
        !/medical|mjek|anamnez/i.test(String(title)),
        `unexpected clinical column: ${title}`,
      );
    }
    assert.equal(rows[0].length, rows[1].length);
  });

  it('writes the age beside the date of birth, and leaves both blank without one', () => {
    const [, withDob] = rowsFor([patient({ dateOfBirth: new Date(Date.UTC(1991, 0, 15)) })]);
    assert.equal(withDob[at(HEADERS.dateOfBirth)], '1991-01-15');
    assert.equal(withDob[at(HEADERS.age)], 35);

    // Not 0 — that would read as a newborn rather than as "nobody asked".
    const [, without] = rowsFor([patient({ dateOfBirth: null })]);
    assert.equal(without[at(HEADERS.dateOfBirth)], '');
    assert.equal(without[at(HEADERS.age)], '');
  });

  it('keeps consent as three answers, because it is three answers', () => {
    const [, unknown] = rowsFor([patient({ contactConsent: null })]);
    const [, agreed] = rowsFor([patient({ contactConsent: true })]);
    const [, refused] = rowsFor([patient({ contactConsent: false })]);

    // Blank is "nobody has asked", which is not the same fact as a refusal —
    // see `Patient.contactConsent`.
    assert.equal(unknown[at(HEADERS.consent)], '');
    assert.equal(agreed[at(HEADERS.consent)], HEADERS.yes);
    assert.equal(refused[at(HEADERS.consent)], HEADERS.no);
  });

  it('writes a recall of 0 rather than blanking it', () => {
    // 0 means recall is switched off for this person, which is a decision
    // somebody made; blank would read as a field never filled in.
    const [, row] = rowsFor([patient({ recallMonths: 0 })]);
    assert.equal(row[at(HEADERS.recallMonths)], 0);
  });

  it('survives the trip through the CSV writer with the phone intact', () => {
    // A phone number in this country starts `+`, which Excel reads as
    // arithmetic — `csvCell` guards it, and this is the end-to-end proof that
    // the guard is still between this file and the spreadsheet.
    const csv = toCsv(rowsFor([patient({ phone: '+355 69 65 84 447' })]));
    assert.ok(csv.includes("'+355 69 65 84 447"), csv);
  });

  it('quotes a value containing the delimiter rather than splitting the row', () => {
    const csv = toCsv(rowsFor([patient({ address: 'Rr. Myslym Shyri; 12' })]));
    assert.ok(csv.includes('"Rr. Myslym Shyri; 12"'), csv);
  });

  it('fills the archived column only for somebody who is archived', () => {
    const [, live] = rowsFor([patient()]);
    assert.equal(live[at(HEADERS.archived)], '');

    const [, gone] = rowsFor([patient({ archivedAt: new Date(Date.UTC(2025, 10, 2)) })]);
    assert.equal(gone[at(HEADERS.archived)], '2025-11-02');
    // Both views produce a file of the same shape — the column is always there.
    assert.equal(live.length, gone.length);
  });
});
