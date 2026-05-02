/**
 * @module embeddings
 * Generates and stores vector embeddings for catalog products, and finds semantically similar products using cosine similarity.
 */

import { getPrismaClient } from './prisma.js'
import { getEmbedding } from './aiClient.js'

const DEFAULT_EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'

function buildProductEmbeddingInput(product: {
  name: string
  brand: string | null
  category: string | null
  unit: string | null
}): string {
  const parts = [
    product.name,
    product.brand ? `Brand: ${product.brand}` : '',
    product.category ? `Category: ${product.category}` : '',
    product.unit ? `Unit: ${product.unit}` : '',
  ]

  return parts.filter(Boolean).join(' | ')
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    normA += x * x
    normB += y * y
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Generates a vector embedding for a catalog product and persists it to the `ProductEmbedding` table.
 *
 * Looks up the product by `productId`, builds a pipe-delimited embedding input string from its
 * name, brand, category, and unit fields, calls the AI embedding API, then upserts the resulting
 * vector under the configured model name.  Throws if the product does not exist.
 *
 * @param {string} productId - The ID of the `CatalogProduct` record to embed.
 * @returns {Promise<void>} Resolves when the embedding has been saved.
 */
export async function generateAndStoreProductEmbedding(productId: string): Promise<void> {
  const prisma = getPrismaClient()

  const product = await prisma.catalogProduct.findUnique({
    where: { id: productId },
    select: { id: true, name: true, brand: true, category: true, unit: true },
  })

  if (!product) {
    throw new Error(`Catalog product not found: ${productId}`)
  }

  const input = buildProductEmbeddingInput(product)
  const vector = await getEmbedding(input)

  await (prisma as any).productEmbedding.upsert({
    where: {
      productId_modelName: {
        productId: product.id,
        modelName: DEFAULT_EMBEDDING_MODEL,
      },
    },
    update: {
      vectorJson: vector as unknown as any,
    },
    create: {
      productId: product.id,
      modelName: DEFAULT_EMBEDDING_MODEL,
      vectorJson: vector as unknown as any,
    },
  })
}

/**
 * A catalog product ranked by its embedding similarity to a reference product.
 * @property {string} productId - The ID of the similar `CatalogProduct`.
 * @property {number} similarity - Cosine similarity score in the range [0, 1]; higher is more similar.
 */
export type SimilarProduct = {
  productId: string
  similarity: number
}

/**
 * Returns the most semantically similar catalog products to a given product using stored embeddings.
 *
 * Fetches the base product's embedding (generating and storing it first if absent), then scores
 * every other embedding in the database via cosine similarity, sorts the results descending, and
 * returns the top `limit` matches.
 *
 * @param {string} productId - The ID of the reference `CatalogProduct`.
 * @param {{ limit?: number }} [options={}] - Optional config; `limit` caps the number of results (default 20).
 * @returns {Promise<SimilarProduct[]>} Ranked list of similar products, most similar first.
 */
export async function findSimilarProductsForProduct(productId: string, options: { limit?: number } = {}): Promise<SimilarProduct[]> {
  const prisma = getPrismaClient()
  const limit = options.limit ?? 20

  const baseEmbedding = await (prisma as any).productEmbedding.findUnique({
    where: {
      productId_modelName: {
        productId,
        modelName: DEFAULT_EMBEDDING_MODEL,
      },
    },
  })

  if (!baseEmbedding) {
    await generateAndStoreProductEmbedding(productId)
    return findSimilarProductsForProduct(productId, options)
  }

  const allEmbeddings = await (prisma as any).productEmbedding.findMany({
    where: {
      modelName: DEFAULT_EMBEDDING_MODEL,
      productId: { not: productId },
    },
  })

  const baseVector = baseEmbedding.vectorJson as unknown as number[]

  const scored: SimilarProduct[] = []

  for (const row of allEmbeddings) {
    const otherVector = row.vectorJson as unknown as number[]
    if (!Array.isArray(otherVector) || otherVector.length === 0) continue

    const similarity = cosineSimilarity(baseVector, otherVector)
    scored.push({ productId: row.productId, similarity })
  }

  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, limit)
}

