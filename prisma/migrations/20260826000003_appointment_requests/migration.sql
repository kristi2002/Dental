-- Somebody the practice has never met, asking to be seen.
--
-- The public page ships with this migration, and this is the one thing on it
-- that writes. Every other row in this database is authored by a member of
-- staff or derived from a patient who already has a file; these arrive from an
-- unauthenticated browser, which is why the table holds a name, a telephone
-- number and a sentence and nothing else — no link to `Patient`, no clinical
-- column, nothing that would invite a stranger to type a diagnosis into a box
-- with no session behind it.
--
-- Deliberately not an `Appointment`. An appointment is a promise the practice
-- has made and the calendar is answerable for; this is a request the desk still
-- has to read, ring back and place. Writing straight into the book would let
-- anybody with a browser fill a working day.
--
-- `locale` is the column that will earn its keep. This practice works in three
-- languages and a good share of these will come from Italy — whoever rings back
-- needs to know which one to open in before they dial.

-- CreateEnum
CREATE TYPE "AppointmentRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "AppointmentRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "message" TEXT,
    "topic" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'sq',
    "status" "AppointmentRequestStatus" NOT NULL DEFAULT 'NEW',
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The desk's own query: what is still open, oldest first. A request that has
-- been sitting for two days is more urgent than one that arrived this morning,
-- which is the reverse of how every other list in this app is read.
CREATE INDEX "AppointmentRequest_status_createdAt_idx" ON "AppointmentRequest"("status", "createdAt");

-- AddForeignKey
-- `SET NULL` rather than cascade: a request answered by somebody who has since
-- left the practice is still a request that was answered, and deleting the
-- evidence with the account would be the wrong half to keep.
ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
