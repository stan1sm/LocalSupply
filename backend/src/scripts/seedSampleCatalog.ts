/**
 * @module seedSampleCatalog
 * One-shot script that upserts a small set of hardcoded sample catalog products and their
 * store prices into the database, useful for local development and demo environments.
 *
 * Run with: `npx tsx src/scripts/seedSampleCatalog.ts`
 *
 * Each product is keyed by a deterministic `seed:<slugified-name>` catalog key so the
 * script is idempotent and safe to re-run without creating duplicates.
 */
import { getPrismaClient } from '../lib/prisma.js'

/**
 * Upserts sample catalog products and their associated store price rows, then logs
 * the total counts of products and prices written.
 *
 * @returns Promise<void> — resolves after all upsert operations have completed.
 */
async function main() {
  const prisma = getPrismaClient()

  const sampleProducts = [
    {
      name: 'Organic carrots 1kg',
      brand: 'Local Farm',
      category: 'Vegetables',
      unit: '1 kg',
      imageUrl: 'https://images.kassal.app/placeholder/carrots.png',
      prices: [
        {
          storeCode: 'MENY_NO',
          storeName: 'Meny',
          currentPrice: 29.9,
        },
        {
          storeCode: 'ODA_NO',
          storeName: 'Oda',
          currentPrice: 24.9,
        },
      ],
    },
    {
      name: 'Whole milk 1L',
      brand: 'Tine',
      category: 'Dairy',
      unit: '1 L',
      imageUrl: 'https://images.kassal.app/placeholder/milk.png',
      prices: [
        {
          storeCode: 'MENY_NO',
          storeName: 'Meny',
          currentPrice: 21.9,
        },
        {
          storeCode: 'COOP_NO',
          storeName: 'Coop',
          currentPrice: 19.9,
        },
      ],
    },
    {
      name: 'Sourdough bread',
      brand: 'Local Bakery',
      category: 'Bread',
      unit: '1 pc',
      imageUrl: 'https://images.kassal.app/placeholder/bread.png',
      prices: [
        {
          storeCode: 'JOKER_NO',
          storeName: 'Joker',
          currentPrice: 39.9,
        },
      ],
    },
  ]

  let productCount = 0
  let priceCount = 0

  for (const entry of sampleProducts) {
    const catalogKey = `seed:${entry.name.toLowerCase().replace(/\s+/g, '-')}`

    const product = await prisma.catalogProduct.upsert({
      where: { catalogKey },
      update: {
        name: entry.name,
        brand: entry.brand,
        category: entry.category,
        unit: entry.unit,
        imageUrl: entry.imageUrl,
      },
      create: {
        catalogKey,
        name: entry.name,
        brand: entry.brand,
        category: entry.category,
        unit: entry.unit,
        imageUrl: entry.imageUrl,
      },
    })

    productCount += 1

    for (const price of entry.prices) {
      await prisma.catalogProductPrice.upsert({
        where: {
          catalogProductId_storeCode: {
            catalogProductId: product.id,
            storeCode: price.storeCode,
          },
        },
        update: {
          storeName: price.storeName,
          currentPrice: price.currentPrice,
          currentUnitPrice: price.currentPrice,
          currentUnitPriceUnit: entry.unit,
        },
        create: {
          catalogProductId: product.id,
          externalId: `${catalogKey}:${price.storeCode}`,
          storeCode: price.storeCode,
          storeName: price.storeName,
          currentPrice: price.currentPrice,
          currentUnitPrice: price.currentPrice,
          currentUnitPriceUnit: entry.unit,
        },
      })

      priceCount += 1
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${productCount} catalog products and ${priceCount} price rows.`)
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Sample catalog seed failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    const prisma = getPrismaClient()
    await prisma.$disconnect()
  })

