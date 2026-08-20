import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVE_PATIENTS,
  buildSearchKey,
  fold,
  patientSearchClauses,
  phoneKey,
} from '../src/lib/patient-search';

/**
 * The module G-18 was closed with, and the one that had no test.
 *
 * The bug it fixed was that the database searched with `ILIKE`, which folds case
 * and leaves diacritics alone, while the in-memory helper folded both — two
 * answers to one question, diverging on exactly the names an Albanian practice
 * is made of. Nothing was holding that fix in place.
 */

describe('fold — one spelling of a name to compare against', () => {
  it('folds case', () => {
    assert.equal(fold('BERISHA'), 'berisha');
  });

  it('strips the diacritics an Albanian name is full of', () => {
    // The whole point of G-18: these are what ILIKE left alone.
    assert.equal(fold('Ndërmarrje'), 'ndermarrje');
    assert.equal(fold('Çeliku'), 'celiku');
    assert.equal(fold('Gëzim Çaushi'), 'gezim caushi');
  });

  it('strips Italian accents too — the practice is trilingual', () => {
    assert.equal(fold('Niccolò'), 'niccolo');
    assert.equal(fold('Renée'), 'renee');
  });

  it('collapses whitespace, including a pasted double space or a tab', () => {
    assert.equal(fold('  Arta   Krasniqi  '), 'arta krasniqi');
    assert.equal(fold('Arta\tKrasniqi'), 'arta krasniqi');
    assert.equal(fold('Arta\nKrasniqi'), 'arta krasniqi');
  });

  it('is idempotent — folding a folded string changes nothing', () => {
    const once = fold('  Çelimë   GËZIM ');
    assert.equal(fold(once), once);
  });

  it('leaves an empty string empty rather than throwing', () => {
    assert.equal(fold(''), '');
    assert.equal(fold('   '), '');
  });

  it('is what makes a search box find a name typed without its diacritics', () => {
    // The receptionist types "celiku" and the row says "Çeliku". This equality
    // is the entire fix.
    assert.equal(fold('Çeliku'), fold('celiku'));
    assert.equal(fold('Gëzim'), fold('gezim'));
  });
});

describe('buildSearchKey — the haystack stored on the row', () => {
  const patient = {
    firstName: 'Gëzim',
    lastName: 'Çeliku',
    phone: '069 12 34 567',
    email: 'G.Celiku@Example.AL',
  };

  it('folds every field into one string', () => {
    assert.equal(buildSearchKey(patient), 'celiku gezim 069 12 34 567 g.celiku@example.al');
  });

  it('leads with the surname, which is how a clinic files people', () => {
    assert.ok(buildSearchKey(patient).startsWith('celiku'));
  });

  it('contains what somebody would actually type, in folded form', () => {
    const key = buildSearchKey(patient);
    for (const typed of ['celiku', 'gezim', 'g.celiku@example.al']) {
      assert.ok(key.includes(fold(typed)), `expected the key to contain ${typed}`);
    }
  });

  it('omits a missing email rather than leaving a gap in the string', () => {
    assert.equal(
      buildSearchKey({ firstName: 'Arta', lastName: 'Krasniqi', phone: '0691234567' }),
      'krasniqi arta 0691234567',
    );
    assert.equal(
      buildSearchKey({ firstName: 'Arta', lastName: 'Krasniqi', phone: '0691234567', email: null }),
      'krasniqi arta 0691234567',
    );
  });

  it('is already folded, so it never needs folding again to be searched', () => {
    const key = buildSearchKey(patient);
    assert.equal(fold(key), key);
  });
});

describe('patientSearchClauses — the OR the query is built from', () => {
  it('always searches the folded key and the raw name columns', () => {
    // The raw columns are the safety net for a deployment where the backfill has
    // not run: without them, every search would return nothing.
    const clauses = patientSearchClauses('Celiku', 'celiku', '');
    assert.deepEqual(clauses[0], { searchKey: { contains: 'celiku' } });
    assert.equal(clauses.length, 4);
    assert.ok(clauses.some((c) => 'lastName' in c));
    assert.ok(clauses.some((c) => 'firstName' in c));
    assert.ok(clauses.some((c) => 'email' in c));
  });

  it('adds a phone clause once three digits have been typed', () => {
    const clauses = patientSearchClauses('069', '069', '069');
    assert.equal(clauses.length, 5);
    assert.deepEqual(clauses.at(-1), { phone: { contains: '069' } });
  });

  it('withholds the phone clause below three digits', () => {
    // `contains: ''` matches every row, which would turn a name search into
    // "show everyone" the moment somebody typed a single letter.
    for (const digits of ['', '0', '06']) {
      const clauses = patientSearchClauses('x', 'x', digits);
      assert.equal(clauses.length, 4, `digits ${JSON.stringify(digits)} should add no clause`);
      assert.ok(!clauses.some((c) => 'phone' in c));
    }
  });

  it('keeps the raw columns case-insensitive', () => {
    const clauses = patientSearchClauses('Celiku', 'celiku', '');
    for (const clause of clauses.slice(1)) {
      assert.equal(Object.values(clause)[0].mode, 'insensitive');
    }
  });
});

describe('phoneKey — is this the same number written differently', () => {
  it('reduces the three spellings of one Albanian mobile to one key', () => {
    const local = phoneKey('069 12 34 567');
    assert.equal(phoneKey('+355 69 1234567'), local);
    assert.equal(phoneKey('0691234567'), local);
    assert.equal(phoneKey('00355 69 12 34 567'), local);
  });

  it('compares the trailing nine digits', () => {
    assert.equal(phoneKey('0691234567'), '691234567');
  });

  it('keeps a short number whole rather than padding or truncating it', () => {
    assert.equal(phoneKey('12345'), '12345');
    assert.equal(phoneKey('123456789'), '123456789');
  });

  it('strips anything that is not a digit', () => {
    assert.equal(phoneKey('(069) 12-34-567'), '691234567');
    assert.equal(phoneKey('069/12.34.567'), '691234567');
  });

  it('gives an empty key for a number with no digits at all', () => {
    // Two patients with "n/a" for a phone must not read as the same person.
    assert.equal(phoneKey('n/a'), '');
    assert.equal(phoneKey(''), '');
  });

  it('does not collide two genuinely different numbers', () => {
    assert.notEqual(phoneKey('069 1234567'), phoneKey('068 1234567'));
  });
});

describe('ACTIVE_PATIENTS — the not-archived filter', () => {
  it('is the null-archivedAt clause every list shares', () => {
    assert.deepEqual(ACTIVE_PATIENTS, { archivedAt: null });
  });
});
