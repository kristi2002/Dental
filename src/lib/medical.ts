/**
 * An allergy hidden in a paragraph of medical notes is the one thing on a
 * patient record that must not be skim-read past — penicillin given to someone
 * allergic to it is an emergency, not a data-entry slip. So the notes are
 * scanned for it and the record shouts, instead of trusting whoever is reading
 * to notice the third sentence.
 */

import { crossReactingWith, drugsIn, familiesIn, type DrugFamily } from '@/lib/drugs';
import { fold } from '@/lib/utils';

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

/**
 * Why an alert fired, because the three reasons need three different sentences.
 *
 * - `direct` — the wording names the recorded substance itself.
 * - `group` — it names a different drug of the same family. Amoxicillin against
 *   a penicillin allergy: not the same molecule, the same thing as far as the
 *   patient is concerned.
 * - `cross` — it names a drug of a family known to cross-react with the recorded
 *   one. A weaker claim, and worded as one.
 */
export type AllergyReason = 'direct' | 'group' | 'cross';

export type AllergyHit = {
  alert: AlertLike;
  reason: AllergyReason;
  /**
   * What in the prescription raised it, quoted as written. Only meaningful for
   * `group` and `cross` — for a direct hit the substance already says it.
   */
  drug?: string;
  /** The family that bridges the two, for a `group` or `cross` hit. */
  family?: DrugFamily;
};

/** Words this short match too much to be worth testing against. */
const MIN_MATCH_LENGTH = 4;

/**
 * Which of a patient's recorded allergies a prescription appears to name.
 *
 * Two passes, and the second is the one that earns its keep.
 *
 * **By name.** Case- and accent-folded, matched **in both directions** word by
 * word: a record saying "Penicilinë" has to fire on a prescription saying
 * "Penicilin 500 mg", and the reverse, because the two are the same drug written
 * by two people.
 *
 * **By family.** Both sides are resolved against the drug catalogue and compared
 * as classes, which is what closes the hole the name test could never close:
 * "Amoxicillin 875 mg" against a recorded penicillin allergy shares not one
 * useful substring, and is the prescription most likely to be written. The
 * catalogue also reads the *sentence* form, so the same works for a record that
 * predates structured alerts and only says "Alergji ndaj penicilinës".
 *
 * A hit is reported once, under the strongest reason that produced it.
 *
 * Nothing is blocked. The dentist remains the check, and this is the thing that
 * makes them look — see `drugs.ts` for why the cross-reactivity list is kept
 * deliberately short rather than generous.
 */
export function matchingAllergies(body: string, alerts: readonly AlertLike[]): AllergyHit[] {
  const haystack = fold(body);
  if (!haystack) return [];

  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= MIN_MATCH_LENGTH);
  const prescribed = drugsIn(body);

  const hits: AllergyHit[] = [];

  for (const alert of alerts) {
    if (alert.kind !== 'ALLERGY') continue;

    const substance = alert.substance ?? '';

    if (namesIt(haystack, words, substance)) {
      hits.push({ alert, reason: 'direct' });
      continue;
    }

    // The catalogue only speaks up when it recognises *both* sides. An allergy
    // to pollen resolves to no family, so nothing downstream can invent a match
    // for it.
    const recorded = familiesIn(substance);
    if (recorded.size === 0) continue;

    const sameGroup = prescribed.find((drug) =>
      drug.families.some((family) => recorded.has(family)),
    );
    if (sameGroup) {
      hits.push({
        alert,
        reason: 'group',
        drug: sameGroup.text,
        family: sameGroup.families.find((family) => recorded.has(family)),
      });
      continue;
    }

    for (const drug of prescribed) {
      const bridge = drug.families.find((family) =>
        crossReactingWith(family).some((related) => recorded.has(related)),
      );
      if (bridge) {
        hits.push({ alert, reason: 'cross', drug: drug.text, family: bridge });
        break;
      }
    }
  }

  return hits;
}

/**
 * The original name test, unchanged.
 *
 * It deliberately over-fires on a multi-word substance: a record of "gome
 * lateksi" also matches a prescription that merely says "gome", because
 * `needle.includes(word)` is true. For a check whose only job is to make
 * somebody look twice before handing over a drug, a false alarm costs a glance
 * and a miss costs an anaphylaxis — so the asymmetry is the point, not an
 * oversight.
 */
function namesIt(haystack: string, words: readonly string[], substance: string): boolean {
  const needle = fold(substance);
  if (needle.length < MIN_MATCH_LENGTH) return false;

  // The whole phrase, when it is there verbatim.
  if (haystack.includes(needle)) return true;

  // Otherwise compare whole words either way round, so a trailing "ë" or a
  // doubled consonant does not hide the match.
  return words.some((word) => word.includes(needle) || needle.includes(word));
}
