-- Two personal preferences, moved onto the account.
--
-- `hiddenNav` is which sections of the menu somebody has switched off, as
-- dot-joined keys. It started life in a cookie beside the rail's collapse and
-- fold, which made it a property of the browser — so the same nurse signing in
-- at the surgery screen and at the front desk had to switch the same things off
-- twice. Unlike the theme, which really is a property of the room, this is a
-- fact about the person.
--
-- `helpSeenAt` is when they were first shown where the help lives. Null means
-- never, which is what makes the one-time pointer one-time.
--
-- Both are additive with defaults, so this lands on a table with rows in it and
-- needs no backfill: an empty string is "nothing hidden", and NULL is "has not
-- been told yet", which is the truth for everybody who existed before today.

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "hiddenNav" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "helpSeenAt" TIMESTAMP(3);
