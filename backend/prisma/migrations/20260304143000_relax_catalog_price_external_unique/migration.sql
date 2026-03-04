DROP INDEX IF EXISTS "CatalogProductPrice_externalId_storeCode_key";

CREATE INDEX "CatalogProductPrice_storeCode_currentPrice_idx" ON "CatalogProductPrice"("storeCode", "currentPrice");
