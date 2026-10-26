-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "deliveryFee" INTEGER,
ADD COLUMN     "deliveryZone" TEXT,
ADD COLUMN     "isBulky" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCashOnDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isExpress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSecondPresentation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "baseFee" INTEGER NOT NULL,
    "expressSurcharge" INTEGER NOT NULL DEFAULT 0,
    "bulkySurcharge" INTEGER NOT NULL DEFAULT 0,
    "cashOnDeliverySurcharge" INTEGER NOT NULL DEFAULT 0,
    "secondPresentationSurcharge" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_zone_key" ON "PricingRule"("zone");

-- CreateIndex
CREATE INDEX "PricingRule_isActive_idx" ON "PricingRule"("isActive");
