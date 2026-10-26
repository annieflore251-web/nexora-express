-- AlterTable
ALTER TABLE "DeliveryAttempt" ADD COLUMN     "recipientChoice" TEXT,
ADD COLUMN     "relayPointDetails" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);
