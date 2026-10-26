-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "agencyId" TEXT;

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_code_key" ON "Agency"("code");

-- CreateIndex
CREATE INDEX "Agency_name_idx" ON "Agency"("name");

-- CreateIndex
CREATE INDEX "Agency_city_idx" ON "Agency"("city");

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
