-- Catch-up for the schema change in 87d3fa2, which shipped through `db push`
-- and never reached this history: standard prescription wording gained the
-- treatments it follows, patient documents gained the two faces of an ID card,
-- and the lab module was dropped.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'ID_FRONT';
ALTER TYPE "DocumentKind" ADD VALUE 'ID_BACK';

-- DropForeignKey
ALTER TABLE "LabCase" DROP CONSTRAINT "LabCase_patientId_fkey";

-- DropForeignKey
ALTER TABLE "LabCase" DROP CONSTRAINT "LabCase_createdById_fkey";

-- DropForeignKey
ALTER TABLE "LabCaseItem" DROP CONSTRAINT "LabCaseItem_labCaseId_fkey";

-- DropForeignKey
ALTER TABLE "LabCaseItem" DROP CONSTRAINT "LabCaseItem_serviceId_fkey";

-- DropTable
DROP TABLE "LabCase";

-- DropTable
DROP TABLE "LabCaseItem";

-- DropEnum
DROP TYPE "LabCaseStatus";

-- CreateTable
CREATE TABLE "PrescriptionTemplateService" (
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "PrescriptionTemplateService_pkey" PRIMARY KEY ("templateId","serviceId")
);

-- CreateIndex
CREATE INDEX "PrescriptionTemplateService_serviceId_idx" ON "PrescriptionTemplateService"("serviceId");

-- AddForeignKey
ALTER TABLE "PrescriptionTemplateService" ADD CONSTRAINT "PrescriptionTemplateService_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PrescriptionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionTemplateService" ADD CONSTRAINT "PrescriptionTemplateService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
