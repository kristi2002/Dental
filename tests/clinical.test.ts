import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allergyLines, hasAllergyNote, matchingAllergies } from '../src/lib/medical';
import {
  ALL_TEETH,
  dentitionOf,
  formatSurfaces,
  isValidTooth,
  quadrantOf,
  selectedTeeth,
  toothKind,
} from '../src/lib/teeth';
import { matches, parseServiceList } from '../src/lib/utils';

describe('allergy notes — the safety net over prose', () => {
  it('catches the stem in all three languages', () => {
    assert.equal(hasAllergyNote('Alergji ndaj penicilinës'), true); // sq
    assert.equal(hasAllergyNote('Allergic to penicillin'), true); // en
    assert.equal(hasAllergyNote('Allergia alla penicillina'), true); // it
  });

  it('is not fooled by case', () => {
    assert.equal(hasAllergyNote('ALLERGY'), true);
  });

  it('says no when there is nothing to say', () => {
    assert.equal(hasAllergyNote(''), false);
    assert.equal(hasAllergyNote(null), false);
    assert.equal(hasAllergyNote('Hypertension, on medication'), false);
  });

  it('quotes only the sentence that mentions it', () => {
    const lines = allergyLines('Hipertension. Alergji ndaj penicilinës. Pi duhan.');
    assert.deepEqual(lines, ['Alergji ndaj penicilinës']);
  });
});

describe('matchingAllergies — the prescription cross-check', () => {
  const penicillin = { kind: 'ALLERGY', substance: 'Penicilinë', severity: 'CRITICAL' };

  it('fires across a diacritic and a dosage', () => {
    assert.equal(matchingAllergies('Penicilin 500 mg, 3x daily', [penicillin]).length, 1);
  });

  it('fires in the other direction too', () => {
    // The record may be the shorter spelling and the prescription the longer.
    const short = { kind: 'ALLERGY', substance: 'Penicilin', severity: 'CRITICAL' };
    assert.equal(matchingAllergies('Penicilinë 500 mg', [short]).length, 1);
  });

  it('does not claim to know drug families', () => {
    // Amoxicillin clinically should trip a penicillin allergy. Pretending this
    // check knows that would be a false sense of coverage, which is worse than
    // none — the dentist stays the check.
    assert.equal(matchingAllergies('Amoxicillin 500 mg', [penicillin]).length, 0);
  });

  it('ignores non-allergy alerts', () => {
    const pregnancy = { kind: 'PREGNANCY', substance: null, severity: 'IMPORTANT' };
    assert.equal(matchingAllergies('Ibuprofen 400 mg', [pregnancy]).length, 0);
  });

  it('ignores substances too short to mean anything', () => {
    const vague = { kind: 'ALLERGY', substance: 'ab', severity: 'INFO' };
    assert.equal(matchingAllergies('Paracetamol', [vague]).length, 0);
  });

  it('errs toward firing on a multi-word substance', () => {
    // "gome lateksi" also fires on a prescription that only says "gome". For a
    // check whose job is to make somebody look twice, a false alarm costs a
    // glance and a miss costs an anaphylaxis — the asymmetry is deliberate.
    const latex = { kind: 'ALLERGY', substance: 'gome lateksi', severity: 'CRITICAL' };
    assert.equal(matchingAllergies('Doreza me gome lateksi', [latex]).length, 1);
    assert.equal(matchingAllergies('Gome e bardhë', [latex]).length, 1);
    assert.equal(matchingAllergies('Paracetamol 500 mg', [latex]).length, 0);
  });

  it('says nothing about an empty prescription', () => {
    assert.equal(matchingAllergies('', [penicillin]).length, 0);
  });
});

describe('FDI teeth', () => {
  it('accepts real teeth and rejects the gaps between quadrants', () => {
    assert.equal(isValidTooth(11), true);
    assert.equal(isValidTooth(48), true);
    assert.equal(isValidTooth(19), false, '19 is not a tooth');
    assert.equal(isValidTooth(29), false);
    assert.equal(isValidTooth(0), false);
    assert.equal(isValidTooth(99), false);
  });

  it('rejects Universal numbers that are not also FDI', () => {
    // The old numbering ran 1–32 and the two systems overlap, which is exactly
    // why the conversion had to be a migration rather than a read-time guess:
    // 32 is a real FDI tooth (lower-left lateral incisor) *and* was a real
    // Universal one, meaning something different.
    assert.equal(isValidTooth(1), false);
    assert.equal(isValidTooth(10), false);
    assert.equal(isValidTooth(32), true, '32 is a valid FDI tooth');
  });

  it('has 32 permanent and 20 primary teeth', () => {
    assert.equal(ALL_TEETH.length, 52);
    assert.equal(ALL_TEETH.filter((t) => dentitionOf(t) === 'PERMANENT').length, 32);
    assert.equal(ALL_TEETH.filter((t) => dentitionOf(t) === 'PRIMARY').length, 20);
  });

  it('normalises surfaces to anatomical order, so DOM and MOD are one record', () => {
    assert.equal(formatSurfaces('DOM'), formatSurfaces('MOD'));
  });

  it('drops letters that are not surfaces', () => {
    assert.equal(formatSurfaces('MZQ'), formatSurfaces('M'));
  });
});

describe('naming a tooth — what the findings list says out loud', () => {
  it('reads the position within the quadrant', () => {
    assert.equal(toothKind(11), 'CENTRAL_INCISOR');
    assert.equal(toothKind(13), 'CANINE');
    assert.equal(toothKind(14), 'FIRST_PREMOLAR');
    assert.equal(toothKind(48), 'THIRD_MOLAR');
  });

  it('gives a milk quadrant molars where a permanent one has premolars', () => {
    // A child has no premolars at all: 54 is the first *molar* of the upper
    // right milk quadrant, and naming it a premolar would describe a tooth that
    // is not in the mouth.
    assert.equal(toothKind(54), 'FIRST_MOLAR');
    assert.equal(toothKind(55), 'SECOND_MOLAR');
    assert.equal(toothKind(53), 'CANINE');
  });

  it('refuses to name something that is not a tooth', () => {
    assert.equal(toothKind(19), null);
    assert.equal(toothKind(0), null);
  });

  it('places the quadrant the way the chart is read', () => {
    assert.equal(quadrantOf(18), 'UPPER_RIGHT');
    assert.equal(quadrantOf(28), 'UPPER_LEFT');
    assert.equal(quadrantOf(38), 'LOWER_LEFT');
    assert.equal(quadrantOf(48), 'LOWER_RIGHT');
    // Primary quadrants follow the same four corners: 5 and 8 are the right.
    assert.equal(quadrantOf(55), 'UPPER_RIGHT');
    assert.equal(quadrantOf(85), 'LOWER_RIGHT');
  });

  it('names every tooth on the chart', () => {
    assert.equal(ALL_TEETH.every((toothNum) => toothKind(toothNum) !== null), true);
  });
});

describe('selectedTeeth — the lab case notation', () => {
  it('reads a bare number as the whole tooth', () => {
    // Returned in anatomical display order, not input order: quadrant 4 runs
    // from the midline outwards on the reader's left, so 47 precedes 46.
    assert.deepEqual(selectedTeeth('46, 47'), [47, 46]);
    assert.deepEqual(selectedTeeth('47, 46'), [47, 46], 'input order does not matter');
  });

  it('reads number:surfaces', () => {
    assert.deepEqual(selectedTeeth('22:MO,27:B,32').sort((a, b) => a - b), [22, 27, 32]);
  });

  it('ignores anything that is not a tooth', () => {
    assert.deepEqual(selectedTeeth('upper arch'), []);
    assert.deepEqual(selectedTeeth(''), []);
  });
});

describe('search and list helpers', () => {
  it('folds diacritics, so typing cesh finds Çështje', () => {
    assert.equal(matches('Çështje', 'cesh'), true);
    assert.equal(matches('Përshëndetje', 'pershend'), true);
  });

  it('is case-insensitive', () => {
    assert.equal(matches('Mbushje', 'MBUSH'), true);
  });

  it('says no when it does not match', () => {
    assert.equal(matches('Mbushje', 'kurorë'), false);
  });

  it('parses a typed service line, trimming and dropping blanks', () => {
    assert.deepEqual(parseServiceList('Mbushje,  Kontroll , '), ['Mbushje', 'Kontroll']);
    assert.deepEqual(parseServiceList(''), []);
  });
});
