-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('RECEIVED', 'REGISTERED', 'AWAITING_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED');

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "externalTrackingNumber" TEXT,
    "sendingAgency" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT,
    "deliveryInstructions" TEXT,
    "description" TEXT,
    "conditionOnArrival" TEXT,
    "sealNumber" TEXT,
    "status" "ParcelStatus" NOT NULL DEFAULT 'RECEIVED',
    "registeredById" TEXT NOT NULL,
    "assignedCourierId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelStatusHistory" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "status" "ParcelStatus" NOT NULL,
    "note" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParcelStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelPhoto" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParcelPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_trackingNumber_key" ON "Parcel"("trackingNumber");

-- CreateIndex
CREATE INDEX "Parcel_status_idx" ON "Parcel"("status");

-- CreateIndex
CREATE INDEX "Parcel_recipientPhone_idx" ON "Parcel"("recipientPhone");

-- CreateIndex
CREATE INDEX "Parcel_assignedCourierId_idx" ON "Parcel"("assignedCourierId");

-- CreateIndex
CREATE INDEX "ParcelStatusHistory_parcelId_changedAt_idx" ON "ParcelStatusHistory"("parcelId", "changedAt");

-- CreateIndex
CREATE INDEX "ParcelPhoto_parcelId_idx" ON "ParcelPhoto"("parcelId");

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_assignedCourierId_fkey" FOREIGN KEY ("assignedCourierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelStatusHistory" ADD CONSTRAINT "ParcelStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelStatusHistory" ADD CONSTRAINT "ParcelStatusHistory_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelPhoto" ADD CONSTRAINT "ParcelPhoto_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
