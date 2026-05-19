-- AlterTable
ALTER TABLE "User"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Backfill verified rows from the previous timestamp-based field.
UPDATE "User"
SET "emailVerified" = true
WHERE "emailVerifiedAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "User"
DROP COLUMN "emailVerifiedAt",
DROP COLUMN "emailVerificationExpiresAt";
