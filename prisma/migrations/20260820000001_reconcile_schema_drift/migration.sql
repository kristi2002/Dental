-- CreateEnum
CREATE TYPE "FollowUpPriority" AS ENUM ('NORMAL', 'URGENT');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "ClinicProfile" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "calendarFeedVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "StockBatch" ADD COLUMN     "manufacturedAt" TIMESTAMP(3),
ADD COLUMN     "purchasedAt" TIMESTAMP(3),
ADD COLUMN     "unitPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "code" TEXT,
ADD COLUMN     "photoKey" TEXT,
ADD COLUMN     "photoMime" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(12,2),
ADD COLUMN     "variantName" TEXT,
ALTER COLUMN "unit" SET DEFAULT 'box';

-- AlterTable
ALTER TABLE "ToothRecord" ADD COLUMN     "bleeding" TEXT,
ADD COLUMN     "mobility" INTEGER,
ADD COLUMN     "pockets" TEXT;

-- AlterTable
ALTER TABLE "VisitRecord" ADD COLUMN     "appointmentId" TEXT;

-- CreateTable
CREATE TABLE "ProductBarcode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "packQty" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "rawSample" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "photoKey" TEXT,
    "photoMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "labSerial" TEXT,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "diagnosis" TEXT,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLine" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "elements" INTEGER NOT NULL DEFAULT 1,
    "teeth" TEXT,
    "procedure" TEXT NOT NULL,
    "lab" TEXT,

    CONSTRAINT "WorkLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProcedure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "priority" "FollowUpPriority" NOT NULL DEFAULT 'NORMAL',
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdById" TEXT,
    "assignedToId" TEXT,
    "patientId" TEXT,
    "workId" TEXT,
    "stockItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductBarcode_code_key" ON "ProductBarcode"("code");

-- CreateIndex
CREATE INDEX "ProductBarcode_itemId_idx" ON "ProductBarcode"("itemId");

-- CreateIndex
CREATE INDEX "ServiceCategory_parentId_idx" ON "ServiceCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Work_number_key" ON "Work"("number");

-- CreateIndex
CREATE INDEX "Work_sentAt_idx" ON "Work"("sentAt");

-- CreateIndex
CREATE INDEX "Work_patientId_idx" ON "Work"("patientId");

-- CreateIndex
CREATE INDEX "Work_labSerial_idx" ON "Work"("labSerial");

-- CreateIndex
CREATE INDEX "Work_receivedAt_dueAt_idx" ON "Work"("receivedAt", "dueAt");

-- CreateIndex
CREATE INDEX "WorkLine_workId_idx" ON "WorkLine"("workId");

-- CreateIndex
CREATE INDEX "FollowUp_doneAt_dueAt_idx" ON "FollowUp"("doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "FollowUp_assignedToId_idx" ON "FollowUp"("assignedToId");

-- CreateIndex
CREATE INDEX "FollowUp_patientId_idx" ON "FollowUp"("patientId");

-- CreateIndex
CREATE INDEX "FollowUp_workId_idx" ON "FollowUp"("workId");

-- CreateIndex
CREATE INDEX "FollowUp_stockItemId_idx" ON "FollowUp"("stockItemId");

-- CreateIndex
CREATE INDEX "Appointment_seriesId_idx" ON "Appointment"("seriesId");

-- CreateIndex
CREATE INDEX "Appointment_serviceId_idx" ON "Appointment"("serviceId");

-- CreateIndex
CREATE INDEX "Appointment_staffUserId_idx" ON "Appointment"("staffUserId");

-- CreateIndex
CREATE INDEX "Appointment_operatoryId_idx" ON "Appointment"("operatoryId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_createdAt_idx" ON "AuditLog"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Patient_archivedAt_idx" ON "Patient"("archivedAt");

-- CreateIndex
CREATE INDEX "Prescription_templateId_idx" ON "Prescription"("templateId");

-- CreateIndex
CREATE INDEX "Service_categoryId_idx" ON "Service"("categoryId");

-- CreateIndex
CREATE INDEX "StockItem_code_idx" ON "StockItem"("code");

-- CreateIndex
CREATE INDEX "StockItem_productId_idx" ON "StockItem"("productId");

-- CreateIndex
CREATE INDEX "StockItem_categoryId_idx" ON "StockItem"("categoryId");

-- CreateIndex
CREATE INDEX "StockItem_supplierId_idx" ON "StockItem"("supplierId");

-- CreateIndex
CREATE INDEX "StockMovement_visitRecordId_idx" ON "StockMovement"("visitRecordId");

-- CreateIndex
CREATE INDEX "StockMovement_staffUserId_idx" ON "StockMovement"("staffUserId");

-- CreateIndex
CREATE INDEX "ToothRecord_visitRecordId_idx" ON "ToothRecord"("visitRecordId");

-- CreateIndex
CREATE INDEX "VisitRecord_appointmentId_idx" ON "VisitRecord"("appointmentId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_serviceId_idx" ON "WaitlistEntry"("serviceId");

-- AddForeignKey
ALTER TABLE "VisitRecord" ADD CONSTRAINT "VisitRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StockProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLine" ADD CONSTRAINT "WorkLine_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
