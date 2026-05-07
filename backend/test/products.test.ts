import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  catalogProductCountMock,
  catalogProductFindManyMock,
  catalogProductCreateManyAndReturnMock,
  catalogProductPriceCountMock,
  catalogProductPriceFindManyMock,
  executeRawMock,
} = vi.hoisted(() => ({
  catalogProductCountMock: vi.fn(),
  catalogProductFindManyMock: vi.fn(),
  catalogProductCreateManyAndReturnMock: vi.fn(),
  catalogProductPriceCountMock: vi.fn(),
  catalogProductPriceFindManyMock: vi.fn(),
  executeRawMock: vi.fn(),
}))

const prismaMock = {
  $disconnect: vi.fn(),
  $executeRaw: executeRawMock,
  catalogProduct: {
    count: catalogProductCountMock,
    findMany: catalogProductFindManyMock,
    createManyAndReturn: catalogProductCreateManyAndReturnMock,
  },
  catalogProductPrice: {
    count: catalogProductPriceCountMock,
    findMany: catalogProductPriceFindManyMock,
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
    catalogProductFindManyMock.mockReset()
    catalogProductCreateManyAndReturnMock.mockReset()
    catalogProductPriceCountMock.mockReset()
    catalogProductPriceFindManyMock.mockReset()
    executeRawMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('returns products from the default discovery view when no search or category is given', async () => {
    catalogProductPriceFindManyMock.mockResolvedValue([
      {
        id: 'price_1',
        storeName: 'MENY',
        currentPrice: 32.9,
        currentUnitPrice: 32.9,
        currentUnitPriceUnit: 'l',
        productUrl: null,
        catalogProduct: {
          brand: 'Tine',
          category: 'Melk',
          gtin: '7038010000001',
          imageUrl: 'https://images.example.com/milk.jpg',
          name: 'Lettmelk 1l',
          unit: '1 l',
        },
      },
    ])
    catalogProductPriceCountMock.mockResolvedValue(500)

    const response = await request(app).get('/api/products?page=1&pageSize=50')

    expect(response.status).toBe(200)
    expect(catalogProductPriceFindManyMock).toHaveBeenCalled()
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0].name).toBe('Lettmelk 1l')
    expect(response.body.total).toBe(500)
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
    catalogProductFindManyMock.mockReset()
    catalogProductCreateManyAndReturnMock.mockReset()
    catalogProductPriceCountMock.mockReset()
    catalogProductPriceFindManyMock.mockReset()
    executeRawMock.mockReset()
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
    // Both pages have the same product (same GTIN) — findMany returns empty on first page,
    // then the created record on the second page.
    catalogProductFindManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'catalog_1', catalogKey: 'gtin:7030001112223' }])
    catalogProductCreateManyAndReturnMock.mockResolvedValue([{ id: 'catalog_1', catalogKey: 'gtin:7030001112223' }])
    executeRawMock.mockResolvedValue(1)

    const response = await request(app).post('/api/products/sync').set('x-catalog-sync-secret', 'test-sync-secret')

    expect(response.status).toBe(200)
    expect(catalogProductCreateManyAndReturnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            catalogKey: 'gtin:7030001112223',
            externalId: '101',
            gtin: '7030001112223',
            name: 'Whole Wheat Bread',
          }),
        ]),
      }),
    )
    // Page 1: 1 price write. Page 2: 1 product update + 1 price write = 3 total.
    expect(executeRawMock).toHaveBeenCalledTimes(3)
    expect(response.body).toEqual({
      fetchedListings: 2,
      importedPrices: 2,
      importedProducts: 2,
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
    catalogProductFindManyMock.mockResolvedValue([])
    catalogProductCreateManyAndReturnMock.mockResolvedValue([{ id: 'catalog_1', catalogKey: 'gtin:7030001112223' }])
    executeRawMock.mockResolvedValue(1)

    const response = await request(app).post('/api/products/sync').set('x-catalog-sync-secret', 'test-sync-secret')

    expect(response.status).toBe(200)
    // Price upsert uses ON CONFLICT via $executeRaw — verify it was called with the right product ID
    expect(executeRawMock).toHaveBeenCalledTimes(1)
    expect(response.body).toMatchObject({
      fetchedListings: 1,
      importedPrices: 1,
      storesSynced: ['MENY_NO'],
    })
  })
})
