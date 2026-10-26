/*
  Warnings:

  - A unique constraint covering the columns `[recipientConfirmationToken]` on the table `Parcel` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "preferredDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "preferredTimeSlot" TEXT,
ADD COLUMN     "recipientConfirmationToken" TEXT,
ADD COLUMN     "recipientConfirmedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_recipientConfirmationToken_key" ON "Parcel"("recipientConfirmationToken");
