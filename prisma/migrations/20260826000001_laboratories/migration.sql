-- The laboratory becomes a row, and the register keeps its text.
--
-- `WorkLine.lab` was free text on the argument that a practice sends to two or
-- three labs whose names it already knows how to spell. `WorkProcedure`, in the
-- same file, exists because that argument was made for `procedure` and then
-- reversed: the same work went out under three spellings in one week and
-- nothing could be counted. `lab` had the identical failure mode plus one more —
-- the follow-up board's whole reason for existing is that somebody has to ring
-- the laboratory, and the only telephone number the register held was the
-- patient's.
--
-- The text column stays. It is the snapshot of what the docket said, exactly as
-- `procedure` and `patientName` are, and a laboratory renamed in 2028 must not
-- rewrite what was sent in March.

-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WorkLine" ADD COLUMN "labId" TEXT;

-- CreateIndex
CREATE INDEX "WorkLine_labId_idx" ON "WorkLine"("labId");

-- AddForeignKey
ALTER TABLE "WorkLine" ADD CONSTRAINT "WorkLine_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one row per laboratory the register already names.
--
-- Grouped on the folded name — trimmed and lower-cased — so "DentalTech",
-- "dentaltech" and "DentalTech " become one laboratory rather than three. That
-- is the drift this change exists to stop, and it is the only kind of drift a
-- migration is entitled to resolve on its own: it is the same string typed
-- carelessly, not two names somebody chose.
--
-- Anything that differs by more than case and whitespace stays separate.
-- Deciding that "Dental Tech" and "Dentaltech" are one laboratory is a judgement
-- about the practice's suppliers, and a migration that made it would be silently
-- merging two companies' invoices.
--
-- The name kept is the spelling the register uses **most**, ties broken
-- alphabetically. Both halves matter: picking the most-used one means the
-- practice sees the name it actually writes rather than whichever variant sorts
-- first — `min()` would have named this laboratory "dentaltech" on a register
-- that says "DentalTech" nine times out of ten — and the alphabetical tie-break
-- is what makes the result identical on every database this replays against.
INSERT INTO "Lab" ("id", "name", "createdAt")
SELECT gen_random_uuid(), "name", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (lower("spelling")) "spelling" AS "name"
    FROM (
        SELECT btrim("lab") AS "spelling", count(*) AS "uses"
        FROM "WorkLine"
        WHERE "lab" IS NOT NULL AND btrim("lab") <> ''
        GROUP BY btrim("lab")
    ) AS "counted"
    ORDER BY lower("spelling"), "uses" DESC, "spelling" ASC
) AS "picked";

-- Point every existing line at the row its own text now names.
UPDATE "WorkLine" AS wl
SET "labId" = l."id"
FROM "Lab" AS l
WHERE wl."lab" IS NOT NULL
  AND lower(btrim(wl."lab")) = lower(btrim(l."name"));
