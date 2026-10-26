-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "courierId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "failureReason" TEXT,
    "notes" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rescheduledAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAttempt_parcelId_attemptedAt_idx" ON "DeliveryAttempt"("parcelId", "attemptedAt");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_courierId_idx" ON "DeliveryAttempt"("courierId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_parcelId_attemptNumber_key" ON "DeliveryAttempt"("parcelId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
