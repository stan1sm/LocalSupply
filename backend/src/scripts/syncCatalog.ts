import 'dotenv/config'
import { syncCatalog } from '../lib/catalogSync.js'
import { getPrismaClient } from '../lib/prisma.js'

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
