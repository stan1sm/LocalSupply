import { describe, expect, it, vi } from 'vitest'
import { findSimilarProductsForProduct, generateAndStoreProductEmbedding } from './embeddings.js'

vi.mock('./prisma.js', () => {
  const embeddings: any[] = []

  const prisma = {
    catalogProduct: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id === 'p1') {
          return { id: 'p1', name: 'Milk 1L', brand: 'BrandA', category: 'Milk', unit: '1L' }
        }
        return null
      }),
    },
    productEmbedding: {
      upsert: vi.fn(async ({ create }: any) => {
        embeddings.push({ ...create })
        return create
      }),
      findUnique: vi.fn(async () => embeddings[0] ?? null),
      findMany: vi.fn(async () => embeddings.slice(1)),
    },
  }

  return {
    getPrismaClient: () => prisma,
  }
})

vi.mock('./aiClient.js', () => ({
  getEmbedding: vi.fn(async () => [1, 0, 0]),
}))

describe('embeddings helpers', () => {
  it('generates and stores an embedding', async () => {
    await generateAndStoreProductEmbedding('p1')
    const similar = await findSimilarProductsForProduct('p1', { limit: 10 })
    expect(Array.isArray(similar)).toBe(true)
  })
})

