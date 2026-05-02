/**
 * @module syncCatalog
 * One-shot script that runs a full catalog sync against the external product data source,
 * automatically resuming from the last synced page to avoid re-fetching already-imported data.
 *
 * Run with: `npx tsx src/scripts/syncCatalog.ts`
 *
 * The resume page is computed from the count of existing `CatalogProductPrice` rows divided
 * by the page size (100), so the script can be interrupted and restarted without data loss.
 * Final sync statistics and duration are printed as formatted JSON.
 */
import 'dotenv/config'
import { syncCatalog } from '../lib/catalogSync.js'
import { getPrismaClient } from '../lib/prisma.js'

/**
 * Determines the resume page from existing price rows, then delegates to `syncCatalog`
 * and prints the result (including page offset and elapsed time) as formatted JSON.
 *
 * @returns Promise<void> — resolves after the sync completes and results are logged.
 */
async function main() {
  const prisma = getPrismaClient()
  const pageSize = 100

  const existingPrices = await prisma.catalogProductPrice.count()
  const resumePage = Math.max(1, Math.floor(existingPrices / pageSize) + 1)

  if (resumePage > 1) {
    console.log(`Found ${existingPrices} existing price rows, resuming from page ${resumePage}`)
  }

  const startedAt = Date.now()
  const result = await syncCatalog({
    logger: console,
    startPage: resumePage,
  })

  console.log(
    JSON.stringify(
      {
        ...result,
        resumedFromPage: resumePage,
        durationMs: Date.now() - startedAt,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error('Catalog sync command failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await getPrismaClient().$disconnect().catch(() => undefined)
  })
