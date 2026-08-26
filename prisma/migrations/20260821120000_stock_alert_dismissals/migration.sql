-- CreateTable
CREATE TABLE "StockAlertDismissal" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "atQuantity" INTEGER NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedById" TEXT,

    CONSTRAINT "StockAlertDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAlertDismissal_stockItemId_key" ON "StockAlertDismissal"("stockItemId");

-- CreateIndex
CREATE INDEX "StockAlertDismissal_dismissedById_idx" ON "StockAlertDismissal"("dismissedById");

-- AddForeignKey
ALTER TABLE "StockAlertDismissal" ADD CONSTRAINT "StockAlertDismissal_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlertDismissal" ADD CONSTRAINT "StockAlertDismissal_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
