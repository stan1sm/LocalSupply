import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  catalogProductCountMock,
  catalogProductPriceCountMock,
  catalogProductPriceFindManyMock,
  catalogProductPriceUpsertMock,
  catalogProductUpsertMock,
} = vi.hoisted(() => ({
  catalogProductCountMock: vi.fn(),
  catalogProductPriceCountMock: vi.fn(),
  catalogProductPriceFindManyMock: vi.fn(),
  catalogProductPriceUpsertMock: vi.fn(),
  catalogProductUpsertMock: vi.fn(),
}))

const prismaMock = {
  $disconnect: vi.fn(),
  catalogProduct: {
    count: catalogProductCountMock,
    upsert: catalogProductUpsertMock,
  },
  catalogProductPrice: {
    count: catalogProductPriceCountMock,
    findMany: catalogProductPriceFindManyMock,
    upsert: catalogProductPriceUpsertMock,
  },
}

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}))

import app from '../src/app.js'

describe('GET /api/products', () => {
  beforeEach(() => {
    process.env.KASSAL_API_KEY = 'kassal-test-key'
    process.env.CATALOG_SYNC_REQUEST_DELAY_MS = '0'
    catalogProductCountMock.mockReset()
    catalogProductPriceCountMock.mockReset()
    catalogProductPriceFindManyMock.mockReset()
    catalogProductPriceUpsertMock.mockReset()
    catalogProductUpsertMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('returns an empty result without querying the database when no search or category is provided', async () => {
    const response = await request(app).get('/api/products?page=1&pageSize=50')

    expect(response.status).toBe(200)
    expect(catalogProductPriceFindManyMock).not.toHaveBeenCalled()
    expect(catalogProductPriceCountMock).not.toHaveBeenCalled()
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
    })
  })

  it('returns catalog rows from the database with store filtering', async () => {
    catalogProductPriceFindManyMock.mockResolvedValue([
      {
        id: 'price_1',
        storeName: 'MENY',
        currentPrice: 32.9,
        currentUnitPrice: 32.9,
        currentUnitPriceUnit: 'l',
        productUrl: 'https://kassal.app/products/1',
        catalogProduct: {
          brand: 'Fresh Farm',
          category: 'Dairy',
          gtin: '7038010000001',
          imageUrl: 'https://images.example.com/milk.jpg',
          name: 'Organic Milk',
          unit: '1 l',
        },
      },
    ])
    catalogProductPriceCountMock.mockResolvedValue(1)

    const response = await request(app).get('/api/products?q=milk&store=MENY_NO&sort=price-asc&page=2&pageSize=24')

    expect(response.status).toBe(200)
    expect(catalogProductPriceFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          catalogProduct: true,
        },
        orderBy: [{ currentPrice: 'asc' }, { catalogProduct: { name: 'asc' } }],
        skip: 24,
        take: 24,
        where: expect.objectContaining({
          storeCode: 'MENY_NO',
          catalogProduct: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { name: { contains: 'milk', mode: 'insensitive' } },
                ]),
              }),
            ]),
          }),
        }),
      }),
    )
    expect(response.body).toEqual({
      items: [
        {
          brand: 'Fresh Farm',
          category: 'Dairy',
          description: null,
          ean: '7038010000001',
          id: 'price_1',
          imageUrl: 'https://images.example.com/milk.jpg',
          name: 'Organic Milk',
          price: 32.9,
          priceText: '32.90 kr',
          store: 'MENY',
          unitInfo: '32.90 kr/l',
          url: 'https://kassal.app/products/1',
        },
      ],
      page: 2,
      pageSize: 24,
      total: 1,
    })
  })
})

describe('POST /api/products/sync', () => {
  beforeEach(() => {
    process.env.KASSAL_API_KEY = 'kassal-test-key'
    process.env.CATALOG_SYNC_SECRET = 'test-sync-secret'
    process.env.CATALOG_SYNC_REQUEST_DELAY_MS = '0'
    catalogProductCountMock.mockReset()
    catalogProductPriceCountMock.mockReset()
    catalogProductPriceFindManyMock.mockReset()
    catalogProductPriceUpsertMock.mockReset()
    catalogProductUpsertMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('upserts the catalog so one product can hold prices from multiple stores', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 101,
              name: 'Whole Wheat Bread',
              brand: 'Bakers',
              ean: '7030001112223',
              image: 'https://images.example.com/bread.jpg',
              category: [{ id: 5, depth: 1, name: 'Bakeri' }],
              current_price: 39.9,
              current_unit_price: 39.9,
              weight: 1,
              weight_unit: 'piece',
              url: 'https://kassal.app/products/101',
              store: { code: 'MENY_NO', name: 'MENY', url: 'https://meny.no', logo: '' },
              updated_at: '2026-03-04T00:00:00.000Z',
            },
          ],
          links: {
            next: 'https://kassal.app/api/v1/products?page=2',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 202,
              name: 'Whole Wheat Bread',
              brand: 'Bakers',
              ean: '7030001112223',
              image: 'https://images.example.com/bread.jpg',
              category: [{ id: 5, depth: 1, name: 'Bakeri' }],
              current_price: 37.9,
              current_unit_price: 37.9,
              weight: 1,
              weight_unit: 'piece',
              url: 'https://kassal.app/products/202',
              store: { code: 'JOKER_NO', name: 'Joker', url: 'https://joker.no', logo: '' },
              updated_at: '2026-03-04T01:00:00.000Z',
            },
          ],
          links: {
            next: null,
          },
        }),
      })

    vi.stubGlobal('fetch', fetchMock)
    catalogProductUpsertMock.mockResolvedValue({ id: 'catalog_1' })
    catalogProductPriceUpsertMock.mockResolvedValue({ id: 'price_1' })

    const response = await request(app).post('/api/products/sync').set('x-catalog-sync-secret', 'test-sync-secret')

    expect(response.status).toBe(200)
    expect(catalogProductUpsertMock).toHaveBeenCalledTimes(2)
    expect(catalogProductUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          catalogKey: 'gtin:7030001112223',
          externalId: '101',
          gtin: '7030001112223',
          name: 'Whole Wheat Bread',
        }),
      }),
    )
    expect(catalogProductPriceUpsertMock).toHaveBeenCalledTimes(2)
    expect(catalogProductPriceUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          catalogProductId: 'catalog_1',
          externalId: '101',
          storeCode: 'MENY_NO',
          storeName: 'MENY',
          currentPrice: 39.9,
        }),
      }),
    )
    expect(catalogProductPriceUpsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          catalogProductId: 'catalog_1',
          externalId: '202',
          storeCode: 'JOKER_NO',
          storeName: 'Joker',
          currentPrice: 37.9,
        }),
      }),
    )
    expect(response.body).toEqual({
      fetchedListings: 2,
      importedPrices: 2,
      importedProducts: 1,
      pagesSynced: 2,
      storesSynced: ['JOKER_NO', 'MENY_NO'],
    })
  })

  it('does not depend on externalId/storeCode uniqueness to upsert prices', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 101,
            name: 'Whole Wheat Bread',
            brand: 'Bakers',
            ean: '7030001112223',
            current_price: 39.9,
            current_unit_price: 39.9,
            weight: 1,
            weight_unit: 'piece',
            url: 'https://kassal.app/products/101',
            store: { code: 'MENY_NO', name: 'MENY' },
            updated_at: '2026-03-04T00:00:00.000Z',
          },
        ],
        links: {
          next: null,
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)
    catalogProductUpsertMock.mockResolvedValue({ id: 'catalog_1' })
    catalogProductPriceUpsertMock.mockResolvedValue({ id: 'price_1' })

    const response = await request(app).post('/api/products/sync').set('x-catalog-sync-secret', 'test-sync-secret')

    expect(response.status).toBe(200)
    expect(catalogProductPriceUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          catalogProductId_storeCode: {
            catalogProductId: 'catalog_1',
            storeCode: 'MENY_NO',
          },
        },
      }),
    )
  })
})
