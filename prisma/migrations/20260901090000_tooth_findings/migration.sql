-- A tooth can hold more than one finding.
--
-- `ToothRecord.status` was a single column, one row per tooth, so a tooth held
-- exactly one fact about itself. A crowned, root-filled molar with a filling on
-- the distal is one of the commonest teeth in an adult mouth and this chart
-- could record one of those three things; the other two went into the notes
-- field, where the findings list can print them and nothing can count, search
-- or plan from them.
--
-- The drawing knew before the schema did: `ToothGlyph` layers the canals under
-- the crown work "so a root-treated tooth that then took a crown reads as
-- both", and it never could.
--
-- Every existing finding is carried across. `HEALTHY` is dropped rather than
-- migrated, because it is now the absence of findings rather than a finding of
-- its own — a tooth with no rows here is a healthy tooth. `recordedAt` and the
-- visit are taken from the row being replaced, so a finding keeps the date it
-- was charted on and the visit that charted it rather than today's.
--
-- The old columns go in the same transaction as the backfill. Postgres DDL is
-- transactional, so this either lands whole or not at all; leaving `status`
-- behind would have been two sources of truth for exactly as long as somebody
-- forgot about it.

-- CreateTable
CREATE TABLE "ToothFinding" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "toothNum" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "surfaces" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitRecordId" TEXT,

    CONSTRAINT "ToothFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One of each kind per tooth: two caries entries on one tooth are one finding
-- with two faces, which is what `surfaces` is for.
CREATE UNIQUE INDEX "ToothFinding_patientId_toothNum_status_key" ON "ToothFinding"("patientId", "toothNum", "status");

-- CreateIndex
CREATE INDEX "ToothFinding_patientId_idx" ON "ToothFinding"("patientId");

-- CreateIndex
CREATE INDEX "ToothFinding_visitRecordId_idx" ON "ToothFinding"("visitRecordId");

-- AddForeignKey
ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_visitRecordId_fkey" FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one finding per charted tooth, keeping its date and its visit.
-- `gen_random_uuid()` is in core Postgres from 13 on; this schema already
-- requires far newer than that.
INSERT INTO "ToothFinding" ("id", "patientId", "toothNum", "status", "surfaces", "recordedAt", "visitRecordId")
SELECT gen_random_uuid(), "patientId", "toothNum", "status",
       NULLIF("surfaces", ''), "updatedAt", "visitRecordId"
FROM "ToothRecord"
WHERE "status" IS NOT NULL AND "status" <> 'HEALTHY';

-- AlterTable
ALTER TABLE "ToothRecord" DROP COLUMN "status",
DROP COLUMN "surfaces";
