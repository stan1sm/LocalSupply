-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "User" ADD COLUMN "orgNumber" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT;
