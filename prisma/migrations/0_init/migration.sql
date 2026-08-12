-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ASSISTANT', 'RECEPTIONIST', 'READONLY');

-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreatmentStepStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('XRAY', 'PHOTO', 'CONSENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('PATIENT', 'CLINIC');

-- CreateEnum
CREATE TYPE "ToothNumbering" AS ENUM ('FDI', 'UNIVERSAL');

-- CreateEnum
CREATE TYPE "LabCaseStatus" AS ENUM ('SENT', 'RECEIVED', 'FITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MedicalAlertKind" AS ENUM ('ALLERGY', 'ANTICOAGULANT', 'PREGNANCY', 'DIABETES', 'CARDIAC_PROPHYLAXIS', 'LATEX', 'PACEMAKER', 'BISPHOSPHONATE', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'IMPORTANT', 'INFO');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'PHONE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "ContactPurpose" AS ENUM ('REMINDER', 'RECALL', 'CONFIRMATION', 'FOLLOW_UP', 'OTHER');

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RECEPTIONIST',
    "pinHash" TEXT NOT NULL,
    "pinSalt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operatory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "medicalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactConsent" BOOLEAN,
    "preferredChannel" "ContactChannel",
    "locale" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "address" TEXT,
    "fiscalCode" TEXT,
    "emergencyContact" TEXT,
    "referralSource" TEXT,
    "recallMonths" INTEGER NOT NULL DEFAULT 6,
    "recallSnoozedUntil" TIMESTAMP(3),
    "lastRecallAt" TIMESTAMP(3),

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "serviceId" TEXT,
    "serviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "staffUserId" TEXT,
    "operatoryId" TEXT,
    "cancelReason" TEXT,
    "cancelledBy" "CancelledBy",
    "rescheduledFromId" TEXT,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "toothNum" INTEGER,
    "notes" TEXT,
    "status" "TreatmentStepStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "appointmentId" TEXT,

    CONSTRAINT "TreatmentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "toothNum" INTEGER,
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "body" TEXT NOT NULL,

    CONSTRAINT "PrescriptionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "templateId" TEXT,
    "body" TEXT NOT NULL,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL,
    "services" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffUserId" TEXT,
    "performedById" TEXT,

    CONSTRAINT "VisitRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToothRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "toothNum" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "surfaces" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "visitRecordId" TEXT,

    CONSTRAINT "ToothRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicProfile" (
    "id" TEXT NOT NULL DEFAULT 'clinic',
    "name" TEXT NOT NULL DEFAULT '',
    "toothNumbering" "ToothNumbering" NOT NULL DEFAULT 'FDI',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minLimit" INTEGER NOT NULL DEFAULT 5,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "packSize" INTEGER NOT NULL DEFAULT 1,
    "orderQty" INTEGER,
    "supplierId" TEXT,
    "orderedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffUserId" TEXT,
    "visitRecordId" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitService" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VisitService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMaterial" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCase" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "labName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "teeth" TEXT,
    "status" "LabCaseStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "tryInAt" TIMESTAMP(3),
    "deliveryFrom" TEXT,
    "deliveryTo" TEXT,
    "careInstructions" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCaseItem" (
    "id" TEXT NOT NULL,
    "labCaseId" TEXT NOT NULL,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabCaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAlert" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" "MedicalAlertKind" NOT NULL,
    "substance" TEXT,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'IMPORTANT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "channel" "ContactChannel" NOT NULL,
    "purpose" "ContactPurpose" NOT NULL,
    "body" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicHours" (
    "weekday" INTEGER NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT NOT NULL DEFAULT '08:00',
    "closeTime" TEXT NOT NULL DEFAULT '20:00',
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicHours_pkey" PRIMARY KEY ("weekday")
);

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "staffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "note" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffUser_active_idx" ON "StaffUser"("active");

-- CreateIndex
CREATE INDEX "Operatory_active_idx" ON "Operatory"("active");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "Patient_lastName_firstName_idx" ON "Patient"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_rescheduledFromId_key" ON "Appointment"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_date_status_idx" ON "Appointment"("date", "status");

-- CreateIndex
CREATE INDEX "TreatmentPlan_patientId_idx" ON "TreatmentPlan"("patientId");

-- CreateIndex
CREATE INDEX "TreatmentPlan_status_idx" ON "TreatmentPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentStep_appointmentId_key" ON "TreatmentStep"("appointmentId");

-- CreateIndex
CREATE INDEX "TreatmentStep_planId_idx" ON "TreatmentStep"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDocument_storageKey_key" ON "PatientDocument"("storageKey");

-- CreateIndex
CREATE INDEX "PatientDocument_patientId_idx" ON "PatientDocument"("patientId");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "VisitRecord_patientId_idx" ON "VisitRecord"("patientId");

-- CreateIndex
CREATE INDEX "VisitRecord_visitDate_idx" ON "VisitRecord"("visitDate");

-- CreateIndex
CREATE UNIQUE INDEX "ToothRecord_patientId_toothNum_key" ON "ToothRecord"("patientId", "toothNum");

-- CreateIndex
CREATE INDEX "StockBatch_itemId_expiryDate_idx" ON "StockBatch"("itemId", "expiryDate");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "VisitService_visitId_idx" ON "VisitService"("visitId");

-- CreateIndex
CREATE INDEX "VisitService_serviceId_idx" ON "VisitService"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceMaterial_serviceId_idx" ON "ServiceMaterial"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMaterial_serviceId_itemId_key" ON "ServiceMaterial"("serviceId", "itemId");

-- CreateIndex
CREATE INDEX "LabCase_patientId_idx" ON "LabCase"("patientId");

-- CreateIndex
CREATE INDEX "LabCase_status_dueAt_idx" ON "LabCase"("status", "dueAt");

-- CreateIndex
CREATE INDEX "LabCaseItem_labCaseId_idx" ON "LabCaseItem"("labCaseId");

-- CreateIndex
CREATE INDEX "PatientAlert_patientId_idx" ON "PatientAlert"("patientId");

-- CreateIndex
CREATE INDEX "Contact_patientId_createdAt_idx" ON "Contact"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_appointmentId_idx" ON "Contact"("appointmentId");

-- CreateIndex
CREATE INDEX "Closure_from_to_idx" ON "Closure"("from", "to");

-- CreateIndex
CREATE INDEX "WaitlistEntry_resolvedAt_idx" ON "WaitlistEntry"("resolvedAt");

-- CreateIndex
CREATE INDEX "WaitlistEntry_patientId_idx" ON "WaitlistEntry"("patientId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_operatoryId_fkey" FOREIGN KEY ("operatoryId") REFERENCES "Operatory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentStep" ADD CONSTRAINT "TreatmentStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentStep" ADD CONSTRAINT "TreatmentStep_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PrescriptionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRecord" ADD CONSTRAINT "VisitRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRecord" ADD CONSTRAINT "VisitRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRecord" ADD CONSTRAINT "VisitRecord_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothRecord" ADD CONSTRAINT "ToothRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothRecord" ADD CONSTRAINT "ToothRecord_visitRecordId_fkey" FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_visitRecordId_fkey" FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitService" ADD CONSTRAINT "VisitService_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "VisitRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitService" ADD CONSTRAINT "VisitService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaterial" ADD CONSTRAINT "ServiceMaterial_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaterial" ADD CONSTRAINT "ServiceMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCaseItem" ADD CONSTRAINT "LabCaseItem_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCaseItem" ADD CONSTRAINT "LabCaseItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closure" ADD CONSTRAINT "Closure_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
