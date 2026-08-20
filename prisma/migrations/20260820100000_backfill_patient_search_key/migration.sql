-- Fill in `Patient.searchKey`, which has never been populated in production.
--
-- The column was added with `@default("")` and is written by the app on every
-- save, so any patient edited since it shipped has one. Every patient who has
-- not been edited since still carries an empty string — and `searchKey` is the
-- *only* accent-folding path in the patient search. `patientSearchClauses`
-- deliberately ORs the raw name/phone/email columns beside it so that an
-- un-backfilled deployment still finds people, but that fallback is `contains`
-- on the raw text, which folds case and **not** diacritics.
--
-- The practical effect: typing `cesh` does not find `Çështje`, and typing
-- `berxulli` does not find `Bërxulli`. That is precisely the bug the column was
-- added to fix (G-18), silently unfixed for every row nobody happened to edit.
-- It could not be repaired before now, because the deploy ran `prisma db push`,
-- which applies schema but never runs SQL or a backfill script.
--
-- The expression below is `fold()` from `src/lib/patient-search.ts`, in SQL:
--
--   1. `concat_ws` joins the same four fields in the same order as
--      `buildSearchKey` — last name, first name, phone, email — skipping nulls,
--      with `NULLIF` turning an empty phone or email into one so the separator
--      does not double up.
--   2. `normalize(…, NFD)` decomposes `ë` into `e` + a combining diaeresis,
--      matching JavaScript's `String.normalize('NFD')`.
--   3. The `chr(768)`–`chr(879)` class is U+0300–U+036F, Combining Diacritical
--      Marks — what `\p{Diacritic}` strips from NFD-decomposed Latin text.
--   4. `lower`, then collapse runs of whitespace, then trim.
--
-- Verified character-for-character against `fold()` over the Albanian and
-- Italian cases the practice actually has (`Çështje`, `Bërxulli`, `Këlliçi`,
-- `Niccolò`) before this was written.
--
-- Every row is recomputed rather than only the empty ones. The expression is
-- the definition of the column, so running it over everything makes the column
-- authoritative instead of "authoritative for rows saved recently enough", and
-- it is idempotent — running it twice changes nothing.

UPDATE "Patient"
SET "searchKey" = btrim(
  regexp_replace(
    lower(
      regexp_replace(
        normalize(
          concat_ws(
            ' ',
            "lastName",
            "firstName",
            NULLIF(phone, ''),
            NULLIF(email, '')
          ),
          NFD
        ),
        '[' || chr(768) || '-' || chr(879) || ']',
        '',
        'g'
      )
    ),
    '\s+',
    ' ',
    'g'
  )
);
