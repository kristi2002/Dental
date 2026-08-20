-- Attachments on a follow-up: photographs, scans and PDFs pinned to one errand.
--
-- Purely additive — one new table, no column on an existing one — so this
-- applies to a live practice database without touching a row of it.

-- CreateTable
CREATE TABLE "FollowUpAttachment" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpAttachment_storageKey_key" ON "FollowUpAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "FollowUpAttachment_followUpId_idx" ON "FollowUpAttachment"("followUpId");

-- AddForeignKey
ALTER TABLE "FollowUpAttachment" ADD CONSTRAINT "FollowUpAttachment_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpAttachment" ADD CONSTRAINT "FollowUpAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
