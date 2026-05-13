import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signBuyerToken } from '../src/lib/jwt.js'

const {
  findUniqueUserMock,
  findUniqueSupplierMock,
  upsertSupplierMock,
  findManyProductMock,
  findFirstProductMock,
  createProductMock,
  createOrderMock,
  updateManyProductMock,
  updateOrderMock,
  findManyPriceMock,
  getDeliveryEstimateMock,
} = vi.hoisted(() => ({
  findUniqueUserMock: vi.fn(),
  findUniqueSupplierMock: vi.fn(),
  upsertSupplierMock: vi.fn(),
  findManyProductMock: vi.fn(),
  findFirstProductMock: vi.fn(),
  createProductMock: vi.fn(),
  createOrderMock: vi.fn(),
  updateManyProductMock: vi.fn(),
  updateOrderMock: vi.fn(),
  findManyPriceMock: vi.fn(),
  getDeliveryEstimateMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => {
    const client = {
      user: { findUnique: findUniqueUserMock },
      supplier: {
        findUnique: findUniqueSupplierMock,
        upsert: upsertSupplierMock,
      },
      product: {
        findMany: findManyProductMock,
        findFirst: findFirstProductMock,
        create: createProductMock,
        updateMany: updateManyProductMock,
      },
      order: {
        create: createOrderMock,
        update: updateOrderMock,
      },
      catalogProductPrice: { findMany: findManyPriceMock },
      $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(client),
    }
    return client
  },
}))

vi.mock('../src/lib/email.js', () => ({
  sendSupplierOrderEmail: vi.fn().mockResolvedValue(undefined),
  sendBuyerOrderStatusEmail: vi.fn().mockResolvedValue(undefined),
  buildEmailVerifiedRedirectUrl: vi.fn(),
  sendUserVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/lib/woltDrive.js', () => ({
  createDelivery: vi.fn().mockResolvedValue({ ok: false, message: 'Wolt disabled in tests' }),
  getDeliveryEstimate: getDeliveryEstimateMock,
  parseAddressString: vi.fn((addr: string) => ({ street: addr, city: 'Oslo' })),
}))

vi.mock('../src/lib/storeLocator.js', () => ({
  findNearestStoreAddress: vi.fn().mockResolvedValue(null),
}))

import app from '../src/app.js'

const BUYER_ID = 'buyer_1'
const SUPPLIER_ID = 'sup_1'
const buyerToken = signBuyerToken(BUYER_ID)

const sampleBuyer = {
  id: BUYER_ID,
  firstName: 'Ava',
  lastName: 'Berg',
  email: 'ava@example.com',
}

const sampleSupplier = {
  id: SUPPLIER_ID,
  businessName: 'Green Farm AS',
  email: 'farm@example.com',
  address: 'Oslo',
  phoneNumber: '90000000',
  passwordHash: 'hash',
}

const sampleProduct = {
  id: 'prod_1',
  supplierId: SUPPLIER_ID,
  name: 'Organic Eggs',
  unit: 'dozen',
  price: 45.0,
  stockQty: 100,
  description: null,
  imageUrl: null,
  isActive: true,
  createdAt: new Date().toISOString(),
}

const sampleOrder = {
  id: 'order_1',
  status: 'PENDING',
  subtotal: 45.0,
  deliveryFee: 0,
  total: 45.0,
  notes: null,
  woltTrackingUrl: null,
  woltStatus: null,
  woltDeliveryId: null,
  createdAt: new Date().toISOString(),
  buyer: sampleBuyer,
  supplier: sampleSupplier,
  items: [
    {
      id: 'item_1',
      productId: 'prod_1',
      quantity: 1,
      unitPrice: 45.0,
      product: sampleProduct,
    },
  ],
}

// ── POST /api/orders ──────────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset()
    findUniqueSupplierMock.mockReset()
    upsertSupplierMock.mockReset()
    findManyProductMock.mockReset()
    createOrderMock.mockReset()
    updateManyProductMock.mockReset()
    updateOrderMock.mockReset()
    findManyPriceMock.mockReset()
    getDeliveryEstimateMock.mockReset()
    getDeliveryEstimateMock.mockResolvedValue({ ok: false, message: 'Wolt disabled in tests' })
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: 'prod_1', quantity: 1 }] })
    expect(res.status).toBe(401)
  })

  it('returns 400 when items array is empty', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID, items: [] })

    expect(res.status).toBe(400)
    expect(res.body.errors.items).toBe('Provide at least one order item.')
  })

  it('returns 400 when items have quantity 0', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: 'prod_1', quantity: 0 }] })

    expect(res.status).toBe(400)
  })

  it('returns 400 when items have neither productId nor catalogProductId', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID, items: [{ quantity: 2 }] })

    expect(res.status).toBe(400)
  })

  it('returns 404 when buyer does not exist', async () => {
    findUniqueUserMock.mockResolvedValue(null)
    findUniqueSupplierMock.mockResolvedValue(sampleSupplier)

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: 'prod_1', quantity: 1 }] })

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Buyer not found.')
  })

  it('returns 400 when no valid products found for the supplier', async () => {
    findUniqueUserMock.mockResolvedValue(sampleBuyer)
    findUniqueSupplierMock.mockResolvedValue(sampleSupplier)
    findManyProductMock.mockResolvedValue([]) // product not in this supplier

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: 'prod_other', quantity: 1 }] })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('No valid products found for this supplier.')
  })

  it('returns 201 and creates the order with supplier product', async () => {
    findUniqueUserMock.mockResolvedValue(sampleBuyer)
    findUniqueSupplierMock.mockResolvedValue(sampleSupplier)
    findManyProductMock.mockResolvedValue([sampleProduct])
    createOrderMock.mockResolvedValue(sampleOrder)
    updateManyProductMock.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID, items: [{ productId: 'prod_1', quantity: 1 }] })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('order_1')
    expect(res.body.status).toBe('PENDING')
    expect(res.body.items).toHaveLength(1)
    expect(res.body.supplier.businessName).toBe('Green Farm AS')
  })

  it('uses marketplace supplier when no supplierId is given', async () => {
    findUniqueUserMock.mockResolvedValue(sampleBuyer)
    findUniqueSupplierMock.mockResolvedValue(null)
    upsertSupplierMock.mockResolvedValue({ ...sampleSupplier, businessName: 'Marketplace Store' })
    findManyProductMock.mockResolvedValue([sampleProduct])
    createOrderMock.mockResolvedValue({
      ...sampleOrder,
      supplier: { ...sampleSupplier, businessName: 'Marketplace Store' },
    })
    updateManyProductMock.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ items: [{ productId: 'prod_1', quantity: 1 }] })

    expect(res.status).toBe(201)
    expect(upsertSupplierMock).toHaveBeenCalled()
  })

  it('computes deliveryFee server-side from Wolt estimate when deliveryAddress is provided', async () => {
    findUniqueUserMock.mockResolvedValue(sampleBuyer)
    findUniqueSupplierMock.mockResolvedValue(sampleSupplier)
    findManyProductMock.mockResolvedValue([sampleProduct])
    getDeliveryEstimateMock.mockResolvedValue({ ok: true, fee: 49, etaMinutes: 30, currency: 'NOK' })
    const orderWithFee = { ...sampleOrder, deliveryFee: 49, total: 94 }
    createOrderMock.mockResolvedValue(orderWithFee)
    updateManyProductMock.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID, deliveryAddress: 'Karl Johans gate 1, Oslo', items: [{ productId: 'prod_1', quantity: 1 }] })

    expect(res.status).toBe(201)
    expect(getDeliveryEstimateMock).toHaveBeenCalled()
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryFee: 49 }),
      }),
    )
  })
})
