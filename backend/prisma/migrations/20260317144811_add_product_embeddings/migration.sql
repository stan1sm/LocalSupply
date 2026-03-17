-- AlterTable
ALTER TABLE "CatalogProduct" ALTER COLUMN "externalId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "acceptDirectOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "minimumOrderAmount" DECIMAL(10,2),
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "openingHoursNote" TEXT,
ADD COLUMN     "orderNotesHint" TEXT,
ADD COLUMN     "preferredContactMethod" TEXT,
ADD COLUMN     "serviceAreas" TEXT,
ADD COLUMN     "serviceRadiusKm" INTEGER,
ADD COLUMN     "showInMarketplace" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "storeType" TEXT,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "ProductEmbedding" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "vectorJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductEmbedding_modelName_idx" ON "ProductEmbedding"("modelName");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEmbedding_productId_modelName_key" ON "ProductEmbedding"("productId", "modelName");

-- AddForeignKey
ALTER TABLE "ProductEmbedding" ADD CONSTRAINT "ProductEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
