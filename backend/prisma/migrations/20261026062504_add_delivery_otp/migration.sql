-- CreateTable
CREATE TABLE "DeliveryOtp" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryOtp_parcelId_createdAt_idx" ON "DeliveryOtp"("parcelId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryOtp_expiresAt_idx" ON "DeliveryOtp"("expiresAt");

-- AddForeignKey
ALTER TABLE "DeliveryOtp" ADD CONSTRAINT "DeliveryOtp_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
