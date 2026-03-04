import 'dotenv/config'
import { syncCatalog } from '../lib/catalogSync.js'
import { getPrismaClient } from '../lib/prisma.js'

async function main() {
  const startedAt = Date.now()
  const result = await syncCatalog({ logger: console })

  console.log(
    JSON.stringify(
      {
        ...result,
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
