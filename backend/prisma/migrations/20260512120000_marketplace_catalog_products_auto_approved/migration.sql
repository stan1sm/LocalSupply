-- Catalog (Kassal) checkout line items are stored as Product rows under the synthetic
-- marketplace supplier; they should never sit in the supplier moderation queue.
UPDATE "Product" AS p
SET "approvalStatus" = 'APPROVED'::"ProductApprovalStatus"
FROM "Supplier" AS s
WHERE p."supplierId" = s.id
  AND s.email = 'marketplace@localsupply.local'
  AND p."approvalStatus" = 'PENDING'::"ProductApprovalStatus";
