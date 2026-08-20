/**
 * One definition of "matches" for people, used on both sides of the wire.
 *
 * The patient list searched the database with `contains` + `mode: 'insensitive'`
 * — `ILIKE '%q%'` — which folds case but leaves diacritics alone, while the
 * in-memory `matches()` helper folds both. Two different answers to the same
 * question, and the difference only showed up on the names most likely to carry
 * an ë or a ç, which in an Albanian practice is most of them.
 */

/**
 * The "not retired" filter, shared by every list and picker that looks people up.
 *
 * The same shape and the same job as `ACTIVE_STOCK`: an archived patient keeps
 * every word of their record (see `Patient.archivedAt`) but must not turn up in
 * a search, a picker or a count, or archiving would be a label nobody sees.
 * Their own screen is reached by id and deliberately still works.
 */
export const ACTIVE_PATIENTS = { archivedAt: null } as const;

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
 * It is filled on every save and, since
 * `20260820100000_backfill_patient_search_key`, for every row that predates the
 * column too. That migration is what finally made accent folding real in
 * production: until the deploy started replaying migrations there was no way to
 * run it, so typing `cesh` found nothing called `Çështje` on any row nobody had
 * happened to edit.
 *
 * The raw columns are kept beside it all the same. They cost nothing, and they
 * mean a search still works on a database restored from an older backup, or one
 * where the backfill has yet to be applied — basic search should never depend on
 * a data migration having happened.
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
