CREATE TYPE "ProductApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Product" ADD COLUMN "approvalStatus" "ProductApprovalStatus" NOT NULL DEFAULT 'PENDING';
