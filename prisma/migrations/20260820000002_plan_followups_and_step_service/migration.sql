-- Two things a treatment plan could not say.
--
-- `TreatmentPlan.followUpOn` / `lastContactedAt`: stalled is derived from sixty
-- quiet days, and the only ways off that list were to tick off work nobody did
-- or to cancel the course of treatment. Neither describes the usual outcome of
-- ringing somebody, which is "after the summer". The plan now carries the day it
-- was promised for and stops shouting until it arrives — see `summarisePlan`.
--
-- `TreatmentStep.serviceId`: the step held the catalogue's *name* as free text
-- and nothing else, so booking a step could not know how long to leave in the
-- diary, and no report could tell planned treatment from delivered. The title
-- stays as the snapshot the row prints, exactly as `Appointment.serviceName`
-- sits beside `Appointment.serviceId`.
--
-- All three columns are nullable with no default, so `db push` applies them to a
-- live database without touching a row (see `docker/entrypoint.sh`).

-- AlterTable
ALTER TABLE "TreatmentPlan" ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "followUpOn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TreatmentStep" ADD COLUMN     "serviceId" TEXT;

-- CreateIndex
CREATE INDEX "TreatmentPlan_followUpOn_idx" ON "TreatmentPlan"("followUpOn");

-- CreateIndex
CREATE INDEX "TreatmentStep_serviceId_idx" ON "TreatmentStep"("serviceId");

-- AddForeignKey
ALTER TABLE "TreatmentStep" ADD CONSTRAINT "TreatmentStep_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
