-- Who found it, and that somebody looked at all.
--
-- Two gaps in the same record, closed together because they are the same gap
-- seen from either end.
--
-- `ToothFinding` already carried `recordedAt` and the visit. It did not carry a
-- person, so the only answer to "who found this caries" was the audit log — a
-- list of every edit ever made to the patient, to be matched against tooth
-- numbers by eye. `recordedById` puts the name on the finding, where it is
-- asked for.
--
-- `ChartExam` records the other half. A healthy tooth is a tooth with no
-- findings, which is the right model and which means a fully examined sound
-- mouth and a mouth nobody has looked in draw the same thirty-two clean teeth.
-- Everything else in this record has a date and a name against it; whether the
-- patient was examined, when, and by whom was the one thing the chart could
-- only imply.
--
-- No backfill for either. A finding recorded before today has no author this
-- migration could name, and inventing one — the patient's usual dentist, the
-- first admin — would put a name against work somebody may not have done, which
-- is worse than the null. Nothing has been examined before this ships either,
-- so the examination table starts empty and honest.

-- AlterTable
ALTER TABLE "ToothFinding" ADD COLUMN "recordedById" TEXT;

-- CreateIndex
CREATE INDEX "ToothFinding_recordedById_idx" ON "ToothFinding"("recordedById");

-- AddForeignKey
-- SET NULL rather than CASCADE: deactivating a dentist must not delete the
-- findings they made, and this practice deactivates rather than deletes anyway
-- (`StaffUser.active`) precisely so the trail survives.
ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ChartExam" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "examinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examinedById" TEXT,
    "visitRecordId" TEXT,
    "note" TEXT,

    CONSTRAINT "ChartExam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- "This patient's examinations, newest first" is the only question asked of it.
CREATE INDEX "ChartExam_patientId_examinedAt_idx" ON "ChartExam"("patientId", "examinedAt");

-- CreateIndex
CREATE INDEX "ChartExam_visitRecordId_idx" ON "ChartExam"("visitRecordId");

-- AddForeignKey
ALTER TABLE "ChartExam" ADD CONSTRAINT "ChartExam_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartExam" ADD CONSTRAINT "ChartExam_examinedById_fkey" FOREIGN KEY ("examinedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartExam" ADD CONSTRAINT "ChartExam_visitRecordId_fkey" FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
