import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  findManySupplierProductMock,
  countSupplierProductMock,
  findManyCatalogPriceMock,
  findUniqueCatalogPriceMock,
} = vi.hoisted(() => ({
  findManySupplierProductMock: vi.fn(),
  countSupplierProductMock: vi.fn(),
  findManyCatalogPriceMock: vi.fn(),
  findUniqueCatalogPriceMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    product: {
      findMany: findManySupplierProductMock,
      count: countSupplierProductMock,
    },
    catalogProductPrice: {
      findMany: findManyCatalogPriceMock,
      findUnique: findUniqueCatalogPriceMock,
    },
  }),
}))

vi.mock('../src/lib/embeddings.js', () => ({
  findSimilarProductsForProduct: vi.fn().mockResolvedValue([]),
}))

vi.mock('../src/lib/catalogSync.js', () => ({
  syncCatalog: vi.fn().mockResolvedValue(undefined),
}))

import app from '../src/app.js'

const sampleSupplierProduct = {
  id: 'prod_1',
  name: 'Farm Eggs',
  description: 'Free-range eggs from local hens',
  unit: 'dozen',
  price: 65.0,
  imageUrl: null,
  isActive: true,
  supplier: { id: 'sup_1', businessName: 'Green Farm AS' },
}

// ── GET /api/products?category=local-suppliers ────────────────────────────────

describe('GET /api/products (local-suppliers category)', () => {
  beforeEach(() => {
    findManySupplierProductMock.mockReset()
    countSupplierProductMock.mockReset()
  })

  it('returns products from local suppliers', async () => {
    findManySupplierProductMock.mockResolvedValue([sampleSupplierProduct])
    countSupplierProductMock.mockResolvedValue(1)

    const res = await request(app).get('/api/products?category=local-suppliers')

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].name).toBe('Farm Eggs')
    expect(res.body.items[0].source).toBe('supplier')
    expect(res.body.items[0].supplierId).toBe('sup_1')
    expect(res.body.items[0].store).toBe('Green Farm AS')
    expect(res.body.items[0].price).toBe(65.0)
    expect(res.body.total).toBe(1)
  })

  it('returns empty items array when no supplier products exist', async () => {
    findManySupplierProductMock.mockResolvedValue([])
    countSupplierProductMock.mockResolvedValue(0)

    const res = await request(app).get('/api/products?category=local-suppliers')

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(0)
    expect(res.body.total).toBe(0)
  })

  it('passes search term to the database query for local suppliers', async () => {
    findManySupplierProductMock.mockResolvedValue([sampleSupplierProduct])
    countSupplierProductMock.mockResolvedValue(1)

    await request(app).get('/api/products?category=local-suppliers&q=eggs')

    expect(findManySupplierProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: 'eggs', mode: 'insensitive' } },
          ]),
        }),
      }),
    )
  })
})

// ── GET /api/products/stores ──────────────────────────────────────────────────

describe('GET /api/products/stores', () => {
  beforeEach(() => { findManyCatalogPriceMock.mockReset() })

  it('returns a list of distinct store codes and names', async () => {
    findManyCatalogPriceMock.mockResolvedValue([
      { storeCode: 'REMA', storeName: 'REMA 1000' },
      { storeCode: 'KIWI', storeName: 'Kiwi' },
    ])

    const res = await request(app).get('/api/products/stores')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toEqual({ code: 'REMA', name: 'REMA 1000' })
    expect(res.body[1]).toEqual({ code: 'KIWI', name: 'Kiwi' })
  })

  it('returns an empty array when no stores exist', async () => {
    findManyCatalogPriceMock.mockResolvedValue([])

    const res = await request(app).get('/api/products/stores')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

// ── GET /api/products/:productId/substitutions ────────────────────────────────

describe('GET /api/products/:productId/substitutions', () => {
  beforeEach(() => {
    findUniqueCatalogPriceMock.mockReset()
    findManyCatalogPriceMock.mockReset()
  })

  it('returns 404 when the product does not exist', async () => {
    findUniqueCatalogPriceMock.mockResolvedValue(null)

    const res = await request(app).get('/api/products/nonexistent/substitutions')

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Product not found.')
  })

  it('returns an empty suggestions array when no similar products are found', async () => {
    findUniqueCatalogPriceMock.mockResolvedValue({
      id: 'price_1',
      storeName: 'REMA 1000',
      storeCode: 'REMA',
      currentPrice: 15.9,
      currentUnitPrice: 15.9,
      currentUnitPriceUnit: 'l',
      productUrl: null,
      catalogProduct: {
        id: 'cat_1',
        brand: 'Tine',
        category: 'Melk',
        gtin: '7038010013781',
        imageUrl: 'https://example.com/milk.jpg',
        name: 'Tine Lettmelk 1 l',
        unit: '1 l',
      },
    })

    const res = await request(app).get('/api/products/price_1/substitutions')

    expect(res.status).toBe(200)
    expect(res.body.suggestions).toEqual([])
  })
})
