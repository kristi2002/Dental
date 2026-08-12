-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "searchKey" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Patient_searchKey_idx" ON "Patient"("searchKey");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");
