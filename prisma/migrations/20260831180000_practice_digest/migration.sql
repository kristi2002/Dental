-- CreateTable
CREATE TABLE "PracticeDigest" (
    "id" TEXT NOT NULL,
    "forDay" TIMESTAMP(3) NOT NULL,
    "followUpsOverdue" INTEGER NOT NULL,
    "followUpsToday" INTEGER NOT NULL,
    "stockOut" INTEGER NOT NULL,
    "stockLow" INTEGER NOT NULL,
    "ordersLate" INTEGER NOT NULL,
    "worksToChase" INTEGER NOT NULL,
    "requestsWaiting" INTEGER NOT NULL,
    "unreadMail" INTEGER NOT NULL,
    "unremindedTomorrow" INTEGER NOT NULL,
    "appointmentsUnclosed" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One row per morning, and the unique index is what makes the clock safe to run
-- twice: a container restart that fires the composer again upserts rather than
-- writing a second row for the same day. Same reasoning as
-- `ScheduledMessage.dedupeKey`, and shippable for the same reason — the deploy
-- replays migrations.
CREATE UNIQUE INDEX "PracticeDigest_forDay_key" ON "PracticeDigest"("forDay");
