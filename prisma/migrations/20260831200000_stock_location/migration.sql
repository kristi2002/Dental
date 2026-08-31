-- Where a box physically is, as distinct from what kind of thing it is.
--
-- Free text, and nullable with no default: an empty location is the honest
-- state for a practice where every material has one obvious home, and a
-- backfilled placeholder would read as an answer somebody had given.

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "location" TEXT;
