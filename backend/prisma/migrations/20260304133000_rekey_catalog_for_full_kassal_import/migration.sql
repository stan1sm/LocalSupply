ALTER TABLE "CatalogProduct"
ADD COLUMN "catalogKey" TEXT;

UPDATE "CatalogProduct"
SET "catalogKey" = CONCAT('legacy:', "externalId")
WHERE "catalogKey" IS NULL;

ALTER TABLE "CatalogProduct"
ALTER COLUMN "catalogKey" SET NOT NULL;

ALTER TABLE "CatalogProductPrice"
ADD COLUMN "externalId" TEXT;

UPDATE "CatalogProductPrice" AS price
SET "externalId" = product."externalId"
FROM "CatalogProduct" AS product
WHERE price."catalogProductId" = product."id"
  AND price."externalId" IS NULL;

ALTER TABLE "CatalogProductPrice"
ALTER COLUMN "externalId" SET NOT NULL;

DROP INDEX "CatalogProduct_externalId_key";

CREATE UNIQUE INDEX "CatalogProduct_catalogKey_key" ON "CatalogProduct"("catalogKey");
CREATE INDEX "CatalogProduct_externalId_idx" ON "CatalogProduct"("externalId");
CREATE UNIQUE INDEX "CatalogProductPrice_externalId_storeCode_key" ON "CatalogProductPrice"("externalId", "storeCode");
CREATE INDEX "CatalogProductPrice_externalId_idx" ON "CatalogProductPrice"("externalId");
