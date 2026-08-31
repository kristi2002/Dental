-- Purchasing as a document rather than a flag.
--
-- `StockItem.orderedAt` stays exactly where it is and keeps its meaning: it is
-- the index four screens read on every render. These two tables are the record
-- behind it, and the one thing the flag could never hold — how much was asked
-- for, and how much of it has actually turned up.
--
-- Nothing is backfilled. An order placed before this migration left no trace of
-- its amounts anywhere in the database, so inventing lines for the items
-- currently flagged as ordered would be inventing quantities. Those items keep
-- their flag and are simply not covered by an order; receiving clears them the
-- way it always did. The record starts from the next order placed.

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL DEFAULT '',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "staffUserId" TEXT,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrder_closedAt_placedAt_idx" ON "PurchaseOrder"("closedAt", "placedAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_itemId_receivedQuantity_idx" ON "PurchaseOrderLine"("itemId", "receivedQuantity");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_orderId_idx" ON "PurchaseOrderLine"("orderId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
