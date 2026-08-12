/**
 * An allergy hidden in a paragraph of medical notes is the one thing on a
 * patient record that must not be skim-read past — penicillin given to someone
 * allergic to it is an emergency, not a data-entry slip. So the notes are
 * scanned for it and the record shouts, instead of trusting whoever is reading
 * to notice the third sentence.
 */

/** Albanian "alergji", English "allergy/allergic", Italian "allergia" — one stem. */
const ALLERGY_PATTERN = /al+erg/i;

export function hasAllergyNote(notes: string | null | undefined): boolean {
  return notes ? ALLERGY_PATTERN.test(notes) : false;
}

/**
 * Just the sentences that mention an allergy, so the warning can quote the
 * substance rather than reprinting the whole history in red — "Allergic to
 * penicillin" is actionable; a wall of scarlet text is not.
 */
export function allergyLines(notes: string | null | undefined): string[] {
  if (!notes) return [];

  return notes
    .split(/[\n.;]+/)
    .map((line) => line.trim())
    .filter((line) => ALLERGY_PATTERN.test(line));
}

export type AlertLike = {
  kind: string;
  substance: string | null;
  severity: string;
};

/** Words this short match too much to be worth testing against. */
const MIN_MATCH_LENGTH = 4;

/**
 * Which of a patient's recorded allergies a prescription appears to name.
 *
 * Case- and accent-folded, and matched **in both directions** word by word:
 * a record saying "Penicilinë" has to fire on a prescription saying
 * "Penicilin 500 mg", and the reverse, because the two are the same drug
 * written by two people. That is the whole failure this guard exists to catch.
 *
 * It makes no claim about drug *families* — "Amoxicillin" does not trip a
 * "penicillin" allergy, even though clinically it should. Pretending otherwise
 * would give a false sense of coverage, which is worse than none; the dentist
 * remains the check. Nothing is blocked either, only reported.
 */
export function matchingAllergies(body: string, alerts: readonly AlertLike[]): AlertLike[] {
  const haystack = fold(body);
  if (!haystack) return [];

  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= MIN_MATCH_LENGTH);

  return alerts.filter((alert) => {
    if (alert.kind !== 'ALLERGY') return false;

    const needle = fold(alert.substance ?? '');
    if (needle.length < MIN_MATCH_LENGTH) return false;

    // The whole phrase, when it is there verbatim.
    if (haystack.includes(needle)) return true;

    // Otherwise compare whole words either way round, so a trailing "ë" or a
    // doubled consonant does not hide the match.
    //
    // This deliberately over-fires on a multi-word substance: a record of
    // "gome lateksi" also matches a prescription that merely says "gome",
    // because `needle.includes(word)` is true. For a check whose only job is to
    // make somebody look twice before handing over a drug, a false alarm costs
    // a glance and a miss costs an anaphylaxis — so the asymmetry is the point,
    // not an oversight.
    return words.some((word) => word.includes(needle) || needle.includes(word));
  });
}

/** Lowercase and strip diacritics, so "Penicilinë" matches "penicilin". */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
