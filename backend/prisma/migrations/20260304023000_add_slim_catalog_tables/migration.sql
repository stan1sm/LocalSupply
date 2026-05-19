CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "gtin" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "unit" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogProductPrice" (
    "id" TEXT NOT NULL,
    "catalogProductId" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "currentPrice" DECIMAL(10,2),
    "currentUnitPrice" DECIMAL(10,2),
    "currentUnitPriceUnit" TEXT,
    "productUrl" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogProduct_externalId_key" ON "CatalogProduct"("externalId");
CREATE INDEX "CatalogProduct_gtin_idx" ON "CatalogProduct"("gtin");
CREATE INDEX "CatalogProduct_name_idx" ON "CatalogProduct"("name");
CREATE INDEX "CatalogProduct_brand_idx" ON "CatalogProduct"("brand");
CREATE INDEX "CatalogProduct_category_idx" ON "CatalogProduct"("category");

CREATE UNIQUE INDEX "CatalogProductPrice_catalogProductId_storeCode_key" ON "CatalogProductPrice"("catalogProductId", "storeCode");
CREATE INDEX "CatalogProductPrice_storeCode_idx" ON "CatalogProductPrice"("storeCode");
CREATE INDEX "CatalogProductPrice_storeName_idx" ON "CatalogProductPrice"("storeName");
CREATE INDEX "CatalogProductPrice_currentPrice_idx" ON "CatalogProductPrice"("currentPrice");

ALTER TABLE "CatalogProductPrice"
ADD CONSTRAINT "CatalogProductPrice_catalogProductId_fkey"
FOREIGN KEY ("catalogProductId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
