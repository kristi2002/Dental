-- The practice's own contact details, for the paper it hands out.
--
-- Nullable with no default and no backfill: blank is the honest state for a
-- practice that has not been asked yet, and every sheet that prints these omits
-- the ones that are empty rather than printing an empty line. An existing
-- database therefore keeps exactly the header it had before this ran.
ALTER TABLE "ClinicProfile" ADD COLUMN "phone" TEXT;
ALTER TABLE "ClinicProfile" ADD COLUMN "email" TEXT;
ALTER TABLE "ClinicProfile" ADD COLUMN "address" TEXT;
