-- AlterTable
ALTER TABLE "User"
ALTER COLUMN "passwordHash" DROP NOT NULL,
ADD COLUMN "vippsSub" TEXT,
ADD COLUMN "vippsPhoneNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_vippsSub_key" ON "User"("vippsSub");
