-- CreateEnum
CREATE TYPE "SupplierVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Supplier"
  ADD COLUMN "orgnr" TEXT,
  ADD COLUMN "verificationStatus" "SupplierVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verificationRejectedReason" TEXT;

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_orgnr_key" ON "Supplier"("orgnr");
