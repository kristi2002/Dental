-- AlterTable
ALTER TABLE "StockBatch" ADD COLUMN     "usedQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
