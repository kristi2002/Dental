-- AlterTable
-- Nullable with no default: null means "has never shut the board", which the
-- app reads as *nothing is new* rather than everything. A default of now() would
-- have been worse than useless — it would claim every existing member of staff
-- had just looked.
ALTER TABLE "StaffUser" ADD COLUMN     "boardSeenAt" TIMESTAMP(3);
