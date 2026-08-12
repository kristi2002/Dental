/**
 * One definition of "matches" for people, used on both sides of the wire.
 *
 * The patient list searched the database with `contains` + `mode: 'insensitive'`
 * — `ILIKE '%q%'` — which folds case but leaves diacritics alone, while the
 * in-memory `matches()` helper folds both. Two different answers to the same
 * question, and the difference only showed up on the names most likely to carry
 * an ë or a ç, which in an Albanian practice is most of them.
 */

/** Lowercase, strip diacritics, collapse whitespace. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The haystack stored on the row. Everything somebody might type into a search
 * box looking for this person, in one folded string.
 */
export function buildSearchKey(patient: {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
}): string {
  return fold(
    [patient.lastName, patient.firstName, patient.phone, patient.email ?? '']
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * The `OR` clauses a patient search should use.
 *
 * `searchKey` is the good path — one folded column, one comparison, indexable.
 * The raw columns are kept beside it deliberately, because `searchKey` is
 * populated by a backfill and a deployment that has not run it yet would
 * otherwise return *nothing* for every name typed. Basic search must not depend
 * on a data migration having happened; it degrades to the old case-insensitive
 * behaviour instead, and sharpens once the backfill runs.
 *
 * The phone clause is only added when digits were actually typed: an empty
 * `contains` matches every row, which would turn a name search into
 * "show everyone".
 */
export function patientSearchClauses(query: string, folded: string, digits: string) {
  return [
    { searchKey: { contains: folded } },
    { lastName: { contains: query, mode: 'insensitive' as const } },
    { firstName: { contains: query, mode: 'insensitive' as const } },
    { email: { contains: query, mode: 'insensitive' as const } },
    ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
  ];
}

/**
 * Digits only, for deciding whether two people gave the same number.
 *
 * `069 12 34 567`, `+355 69 1234567` and `0691234567` are one number written
 * three ways, and a duplicate check comparing the strings would miss all three.
 * The trailing nine digits are compared rather than the whole thing, so a local
 * and an international spelling of the same line still collide.
 */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}
