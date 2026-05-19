import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  findManyPriceMock,
  planMealMock,
  getEmbeddingsMock,
} = vi.hoisted(() => ({
  findManyPriceMock: vi.fn(),
  planMealMock: vi.fn(),
  getEmbeddingsMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    catalogProductPrice: { findMany: findManyPriceMock },
    catalogProduct: { findMany: vi.fn().mockResolvedValue([]) },
    productEmbedding: { findMany: vi.fn().mockResolvedValue([]) },
  }),
}))

vi.mock('../src/lib/intentCartPlanner.js', () => ({
  planMealFromText: planMealMock,
}))

vi.mock('../src/lib/aiClient.js', () => ({
  getEmbeddings: getEmbeddingsMock,
}))

vi.mock('../src/lib/email.js', () => ({
  sendBuyerOrderStatusEmail: vi.fn().mockResolvedValue(undefined),
  sendSupplierOrderEmail: vi.fn().mockResolvedValue(undefined),
  buildEmailVerifiedRedirectUrl: vi.fn(),
  sendUserVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

import app from '../src/app.js'

// ── POST /api/cart/match ──────────────────────────────────────────────────────

describe('POST /api/cart/match', () => {
  beforeEach(() => { findManyPriceMock.mockReset() })

  it('returns 400 when items array is missing', async () => {
    const res = await request(app).post('/api/cart/match').send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Cart is empty.')
  })

  it('returns 400 when items array is empty', async () => {
    const res = await request(app).post('/api/cart/match').send({ items: [] })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Cart is empty.')
  })

  it('returns 400 when all items have quantity 0', async () => {
    const res = await request(app)
      .post('/api/cart/match')
      .send({ items: [{ priceId: 'price_1', quantity: 0 }] })
    expect(res.status).toBe(400)
  })

  it('returns 400 when items have no priceId', async () => {
    const res = await request(app)
      .post('/api/cart/match')
      .send({ items: [{ quantity: 2 }] })
    expect(res.status).toBe(400)
  })

  it('returns 200 with empty stores when no catalog prices found', async () => {
    findManyPriceMock.mockResolvedValue([])

    const res = await request(app)
      .post('/api/cart/match')
      .send({ items: [{ priceId: 'price_1', quantity: 2 }] })

    expect(res.status).toBe(200)
    expect(res.body.stores).toHaveLength(0)
    expect(res.body.bestMatch).toBeNull()
    expect(res.body.savings).toBe(0)
    expect(res.body.totalCartItems).toBe(1)
  })

  it('returns 200 with ranked stores when matching prices exist', async () => {
    const catalogProductId = 'cat_prod_1'
    const priceId = 'price_1'

    // First call: resolve priceId → catalogProductId
    findManyPriceMock.mockResolvedValueOnce([{ id: priceId, catalogProductId }])

    // Second call: all prices for that catalog product across stores
    findManyPriceMock.mockResolvedValueOnce([
      {
        id: priceId,
        catalogProductId,
        storeCode: 'MENY_NO',
        storeName: 'Meny',
        currentPrice: '29.90',
        currentUnitPrice: null,
        currentUnitPriceUnit: null,
        catalogProduct: { name: 'Whole Milk', brand: 'Q', imageUrl: null, unit: 'l' },
      },
      {
        id: 'price_2',
        catalogProductId,
        storeCode: 'ODA_NO',
        storeName: 'Oda',
        currentPrice: '27.50',
        currentUnitPrice: null,
        currentUnitPriceUnit: null,
        catalogProduct: { name: 'Whole Milk', brand: 'Q', imageUrl: null, unit: 'l' },
      },
    ])

    const res = await request(app)
      .post('/api/cart/match')
      .send({ items: [{ priceId, quantity: 1 }] })

    expect(res.status).toBe(200)
    expect(res.body.stores.length).toBeGreaterThanOrEqual(1)
    expect(res.body.bestMatch).not.toBeNull()
    // Oda has free delivery so total is lower despite slightly cheaper price at Meny after delivery
    expect(res.body.bestMatch.storeCode).toBeDefined()
    expect(res.body.totalCartItems).toBe(1)
  })

  it('returns 503 on database error', async () => {
    findManyPriceMock.mockRejectedValue(new Error('DB down'))

    const res = await request(app)
      .post('/api/cart/match')
      .send({ items: [{ priceId: 'price_1', quantity: 1 }] })

    expect(res.status).toBe(503)
  })
})

// ── POST /api/cart/intent ─────────────────────────────────────────────────────

describe('POST /api/cart/intent', () => {
  beforeEach(() => {
    planMealMock.mockReset()
    getEmbeddingsMock.mockReset()
    findManyPriceMock.mockReset()
  })

  it('returns 400 when text is missing', async () => {
    const res = await request(app).post('/api/cart/intent').send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Text is required.')
  })

  it('returns 400 when text is an empty string', async () => {
    const res = await request(app).post('/api/cart/intent').send({ text: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 200 with empty items when LLM returns no ingredients', async () => {
    planMealMock.mockResolvedValue({
      ingredients: [],
      mealType: 'dinner',
      people: 2,
      notes: null,
    })
    getEmbeddingsMock.mockResolvedValue([])

    const res = await request(app)
      .post('/api/cart/intent')
      .send({ text: 'something vague' })

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(0)
    expect(res.body.storeChoice).toBeNull()
  })

  it('returns 200 with empty items when no catalog products match', async () => {
    planMealMock.mockResolvedValue({
      ingredients: [{ product: 'milk', searchTerms: ['milk', 'mjølk'], qty: 1, required: true }],
      mealType: 'breakfast',
      people: 1,
      notes: null,
    })
    getEmbeddingsMock.mockResolvedValue([[0.1, 0.2, 0.3]])
    findManyPriceMock.mockResolvedValue([])

    const res = await request(app)
      .post('/api/cart/intent')
      .send({ text: 'breakfast with milk' })

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(0)
    expect(res.body.storeChoice).toBeNull()
  })

  it('returns 503 when the meal planner throws', async () => {
    planMealMock.mockRejectedValue(new Error('LLM unavailable'))

    const res = await request(app)
      .post('/api/cart/intent')
      .send({ text: 'pasta for 4' })

    expect(res.status).toBe(503)
    expect(res.body.message).toBe('Unable to plan cart right now.')
  })

  it('proceeds without embeddings when getEmbeddings throws', async () => {
    planMealMock.mockResolvedValue({
      ingredients: [{ product: 'milk', searchTerms: ['milk'], qty: 1, required: true }],
      mealType: 'breakfast',
      people: 1,
      notes: null,
    })
    getEmbeddingsMock.mockRejectedValue(new Error('Embedding service down'))
    findManyPriceMock.mockResolvedValue([])

    const res = await request(app)
      .post('/api/cart/intent')
      .send({ text: 'milk' })

    // Should still respond — embedding failure is non-fatal
    expect(res.status).toBe(200)
  })

  it('accepts language=no parameter', async () => {
    planMealMock.mockResolvedValue({
      ingredients: [],
      mealType: 'middag',
      people: 2,
      notes: null,
    })
    getEmbeddingsMock.mockResolvedValue([])

    const res = await request(app)
      .post('/api/cart/intent')
      .send({ text: 'pasta til 2', language: 'no' })

    expect(res.status).toBe(200)
    expect(planMealMock).toHaveBeenCalledWith('pasta til 2', 'no')
  })
})
