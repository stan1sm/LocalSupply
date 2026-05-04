CREATE TABLE IF NOT EXISTS "Delivery" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "merchantOrderReference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "pickupStreet" TEXT NOT NULL,
  "pickupCity" TEXT NOT NULL,
  "pickupContactName" TEXT NOT NULL,
  "pickupContactPhone" TEXT NOT NULL,
  "dropoffStreet" TEXT NOT NULL,
  "dropoffCity" TEXT NOT NULL,
  "dropoffContactName" TEXT NOT NULL,
  "dropoffContactPhone" TEXT NOT NULL,
  "parcels" JSONB NOT NULL,
  "trackingUrl" TEXT NOT NULL,
  "etaMinutes" INTEGER NOT NULL DEFAULT 30,
  "distanceKm" DOUBLE PRECISION,
  "pickupAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Delivery_merchantOrderReference_key" ON "Delivery"("merchantOrderReference");
CREATE INDEX IF NOT EXISTS "Delivery_status_idx" ON "Delivery"("status");
CREATE INDEX IF NOT EXISTS "Delivery_merchantOrderReference_idx" ON "Delivery"("merchantOrderReference");
