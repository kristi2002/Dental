-- Two uniqueness rules the schema has always stated in prose and never been
-- able to enforce.
--
-- Both were written as comments explaining that the constraint was *wanted* and
-- omitted only because the deploy ran `prisma db push`, which refuses to add a
-- unique index at all — not merely when the data would violate it — and takes
-- the release down on boot when asked to. The deploy now replays this directory
-- with `prisma migrate deploy`, so the rules can be what they always claimed to
-- be: rules.
--
-- Each half resolves conflicting rows first, because a constraint added to data
-- that violates it fails the migration, and a failed migration means the
-- container does not start. Both resolutions are deliberately conservative —
-- they clear a redundant *link* or a redundant *label*, and neither deletes a
-- row or touches anything clinical.

-- ---------------------------------------------------------------------------
-- 1. One write-up per appointment.
--
-- `saveVisit` has always been the gate ("it only ever links a slot that has no
-- write-up yet"), so a second visit pointing at one appointment can only come
-- from a row written before that gate existed, or from two people saving the
-- same slot in the same moment.
--
-- The earliest write-up keeps the link; any later one is unlinked. The visit
-- itself — its date, its notes, its services, its tooth records — is untouched,
-- and it stays exactly where it is on the patient's timeline. All that is lost
-- is a duplicate claim on one diary slot, which is the thing being declared
-- impossible.
UPDATE "VisitRecord" v
SET "appointmentId" = NULL
WHERE v."appointmentId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "VisitRecord" keeper
    WHERE keeper."appointmentId" = v."appointmentId"
      AND (keeper."createdAt", keeper.id) < (v."createdAt", v.id)
  );

-- CreateIndex
CREATE UNIQUE INDEX "VisitRecord_appointmentId_key" ON "VisitRecord"("appointmentId");

-- ---------------------------------------------------------------------------
-- 2. One material per article number.
--
-- `saveStockItem` checks for a duplicate before writing, and the schema is
-- candid that the check has a race in it: "two people typing the same number in
-- the same second would slip through". This closes it.
--
-- Postgres allows any number of NULLs in a unique index, which is what makes
-- this workable at all — `code` is optional on purpose, because "a practice that
-- never numbered anything should not be made to invent them".
--
-- An empty string is not a number either, and unlike NULL it would collide with
-- every other empty one, so those are normalised to NULL first.
UPDATE "StockItem" SET code = NULL WHERE code = '';

-- One row keeps the number and the others are left unnumbered — not renamed. An
-- invented code like "A-14 (2)" would be printed onto a shelf label and read
-- back as though somebody had chosen it, whereas a blank one is visibly waiting
-- to be filled in.
--
-- Which row keeps it: a material still on the shelf outranks an archived one,
-- since a code on something nobody stocks any more is the one worth freeing.
-- Beyond that the tie is broken on `id`, which is arbitrary but stable —
-- `StockItem` has no `createdAt` to prefer the older row by, only `updatedAt`,
-- and that moves every time somebody adjusts a quantity.
UPDATE "StockItem" s
SET code = NULL
WHERE s.code IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "StockItem" keeper
    WHERE keeper.code = s.code
      AND keeper.id <> s.id
      AND (
        (keeper."archivedAt" IS NULL AND s."archivedAt" IS NOT NULL)
        OR (
          (keeper."archivedAt" IS NULL) = (s."archivedAt" IS NULL)
          AND keeper.id < s.id
        )
      )
  );

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_code_key" ON "StockItem"("code");
