-- Categories become rows a practice names once, instead of free text retyped
-- per material.
--
-- `StockItem."category"` is deliberately left in place. It is the only copy of
-- what the practice already typed, and the deploy runs `prisma db push` without
-- `--accept-data-loss` (see `docker/entrypoint.sh`), so dropping it here would
-- halt a release rather than migrate it. The values are moved onto the new rows
-- by `getStockCategories` in `src/lib/queries.ts`, the first time the stock or
-- stocktake page is read, and the column is cleared as each one is adopted —
-- the same reason `Patient.searchKey` shipped without its backfill in SQL.

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "StockCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCategory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StockCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
