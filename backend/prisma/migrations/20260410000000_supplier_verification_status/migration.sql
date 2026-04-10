-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Supplier"
  ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verificationRejectedReason" TEXT;

-- Migrate existing isVerified=true rows to VERIFIED
UPDATE "Supplier" SET "verificationStatus" = 'VERIFIED' WHERE "isVerified" = true;

-- DropColumn
ALTER TABLE "Supplier" DROP COLUMN "isVerified";
