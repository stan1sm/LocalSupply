ALTER TABLE "User"
ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User"
ADD COLUMN "vippsSub" TEXT,
ADD COLUMN "vippsPhoneNumber" TEXT;

CREATE UNIQUE INDEX "User_vippsSub_key" ON "User"("vippsSub");
