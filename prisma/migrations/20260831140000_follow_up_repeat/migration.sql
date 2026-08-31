-- CreateEnum
CREATE TYPE "FollowUpRepeat" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "repeatEvery" "FollowUpRepeat";

