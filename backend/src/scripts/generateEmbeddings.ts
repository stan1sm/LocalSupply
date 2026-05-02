/**
 * @module generateEmbeddings
 * One-shot script that generates and persists vector embeddings for every catalog product
 * that does not yet have an embedding for the configured AI model.
 *
 * Run with: `npx tsx src/scripts/generateEmbeddings.ts`
 *
 * The embedding model is resolved from the `AI_EMBEDDING_MODEL` environment variable
 * (defaults to `"text-embedding-3-small"`).  Products that already have an embedding
 * for the target model are skipped so the script is safe to re-run incrementally.
 */
import 'dotenv/config'
import { getPrismaClient } from '../lib/prisma.js'
import { generateAndStoreProductEmbedding } from '../lib/embeddings.js'

/**
 * Queries all catalog products without an existing embedding for the target model,
 * then calls `generateAndStoreProductEmbedding` for each one, logging progress.
 *
 * @returns Promise<void> — resolves after all products have been processed.
 */
async function main() {
  const prisma = getPrismaClient()

  const modelName = process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'

  const products = await prisma.catalogProduct.findMany({
    where: {
      embeddings: {
        none: {
          modelName,
        },
      },
    },
    select: { id: true, name: true, brand: true },
  })

  console.log(
    `Generating embeddings for ${products.length} catalog products without embeddings for model "${modelName}"...`,
  )

  let processed = 0
  for (const product of products) {
    const label = [product.name, product.brand].filter(Boolean).join(' | ')
    console.log(`→ [${processed + 1}/${products.length}] ${product.id} ${label}`)
    try {
      await generateAndStoreProductEmbedding(product.id)
      processed += 1
    } catch (error) {
      console.error(`✖ Failed to generate embedding for product ${product.id} (${label || 'unnamed'}):`, error)
    }
  }

  console.log(`Done. Generated embeddings for ${processed} products.`)
}

main().catch((error) => {
  console.error('Embedding generation failed', error)
  process.exit(1)
})

