-- The periodontal half of the chart gets a memory, and the two readings it was
-- missing.
--
-- `ToothRecord` is unique on [patientId, toothNum]: one row per tooth,
-- overwritten on every save. For the condition half that is right — a filled
-- tooth is filled. For the periodontal half it destroyed the measurement's
-- whole point. A 5mm pocket that was 3mm last year is disease progressing and
-- gets referred; a 5mm pocket that has been 5mm for three years is a stable
-- defect that gets maintained. The practice was taking the reading and throwing
-- away the comparison.
--
-- Two changes, both additive, neither touching an existing row:
--
--   1. `recession` and `furcation` on the snapshot. Without recession a pocket
--      depth cannot be turned into clinical attachment loss, and CAL is what
--      periodontal diagnosis actually runs on — 4mm of pocket on 3mm of
--      recession is 7mm of lost attachment and a very different tooth from 4mm
--      with none. Furcation grade is what decides whether a molar is
--      restorable at all.
--
--   2. `PerioExam`, an append-only history. Every perio save writes here as
--      well as updating the snapshot, so the newest row mirrors `ToothRecord`
--      by design — that duplication is what lets this table answer "chart this
--      tooth over time" without joining to a snapshot that is about to change.
--
-- Nothing is backfilled and nothing can be. The superseded readings were
-- overwritten in place before this table existed; the audit trail has them as
-- human-readable lines (`#36 · perio 3,2,,4,3,2 · M1`) and that is the only
-- record of them there will ever be. History starts today.

-- AlterTable
ALTER TABLE "ToothRecord" ADD COLUMN     "furcation" INTEGER,
ADD COLUMN     "recession" TEXT;

-- CreateTable
CREATE TABLE "PerioExam" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "toothNum" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pockets" TEXT,
    "bleeding" TEXT,
    "recession" TEXT,
    "mobility" INTEGER,
    "furcation" INTEGER,
    "visitRecordId" TEXT,

    CONSTRAINT "PerioExam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- "This tooth's readings, newest first" is the only question asked of this
-- table, and it is asked once per tooth on every periodontal view.
CREATE INDEX "PerioExam_patientId_toothNum_recordedAt_idx" ON "PerioExam"("patientId", "toothNum", "recordedAt");

-- CreateIndex
CREATE INDEX "PerioExam_visitRecordId_idx" ON "PerioExam"("visitRecordId");

-- AddForeignKey
ALTER TABLE "PerioExam" ADD CONSTRAINT "PerioExam_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull rather than Cascade: deleting a visit must not delete the readings
-- taken during it, the same call `ToothRecord` makes on the same column.
ALTER TABLE "PerioExam" ADD CONSTRAINT "PerioExam_visitRecordId_fkey" FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
