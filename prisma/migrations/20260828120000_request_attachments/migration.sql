-- What a stranger attached to a request off the public page.
--
-- The booking form took a name, a number and a sentence, and a good share of
-- the people filling it in are choosing between clinics in three countries with
-- an OPG from a dentist at home already in their hand. They wrote "I have an
-- X-ray" in the message box and the desk rang back to ask for it by email —
-- a second round trip on the one enquiry the practice most wants to answer
-- well. Now the form takes the file, and takes several.
--
-- Purely additive: one new table, not a column on an existing one, so this
-- applies to a live practice database without touching a row of it. Every
-- request written before today simply has none.
--
-- No `uploadedById`, unlike every other file table here. Nobody was signed in —
-- that is the whole nature of this form — and the request is who sent it.
--
-- CASCADE on the request for the reason `FollowUpAttachment` cascades on its
-- line: a request the desk deletes must not leave rows behind naming files
-- nothing can reach. The bytes are swept separately by
-- `prisma/sweep-orphan-files.ts`, which reads this column too.

-- CreateTable
CREATE TABLE "AppointmentRequestAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentRequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentRequestAttachment_storageKey_key" ON "AppointmentRequestAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "AppointmentRequestAttachment_requestId_idx" ON "AppointmentRequestAttachment"("requestId");

-- AddForeignKey
ALTER TABLE "AppointmentRequestAttachment" ADD CONSTRAINT "AppointmentRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AppointmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
