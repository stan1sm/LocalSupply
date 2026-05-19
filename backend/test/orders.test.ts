import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signBuyerToken, signSupplierToken } from '../src/lib/jwt.js'

const { findManyOrderMock, findUniqueOrderMock, updateOrderMock } = vi.hoisted(() => ({
  findManyOrderMock: vi.fn(),
  findUniqueOrderMock: vi.fn(),
  updateOrderMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    order: {
      findMany: findManyOrderMock,
      findUnique: findUniqueOrderMock,
      update: updateOrderMock,
    },
  }),
}))

vi.mock('../src/lib/email.js', () => ({
  sendBuyerOrderStatusEmail: vi.fn().mockResolvedValue(undefined),
  sendSupplierOrderEmail: vi.fn().mockResolvedValue(undefined),
  buildEmailVerifiedRedirectUrl: vi.fn(),
  sendUserVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

import app from '../src/app.js'

const BUYER_ID = 'buyer_abc'
const SUPPLIER_ID = 'sup_xyz'
const buyerToken = signBuyerToken(BUYER_ID)
const supplierToken = signSupplierToken(SUPPLIER_ID)

const sampleOrderItem = {
  id: 'item_1',
  productId: 'prod_1',
  quantity: 2,
  unitPrice: 32.9,
  product: { name: 'Organic Milk', unit: '1 l' },
}

const sampleOrder = {
  id: 'order_1',
  status: 'PENDING',
  subtotal: 65.8,
  deliveryFee: 49,
  total: 114.8,
  notes: null,
  woltTrackingUrl: null,
  woltStatus: null,
  createdAt: new Date().toISOString(),
  buyerId: BUYER_ID,
  supplierId: SUPPLIER_ID,
  supplier: { id: SUPPLIER_ID, businessName: 'Green Farm AS', address: 'Oslo' },
  buyer: { id: BUYER_ID, firstName: 'Ava', lastName: 'Johnson', email: 'ava@example.com' },
  items: [sampleOrderItem],
}

// ── GET /api/orders/buyer/:buyerId ───────────────────────────────────────────

describe('GET /api/orders/buyer/:buyerId', () => {
  beforeEach(() => { findManyOrderMock.mockReset() })

  it('returns orders for the authenticated buyer', async () => {
    findManyOrderMock.mockResolvedValue([sampleOrder])

    const res = await request(app)
      .get(`/api/orders/buyer/${BUYER_ID}`)
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('order_1')
    expect(res.body[0].supplier.businessName).toBe('Green Farm AS')
    expect(findManyOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { buyerId: BUYER_ID } }),
    )
  })

  it('returns an empty array when the buyer has no orders', async () => {
    findManyOrderMock.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/orders/buyer/${BUYER_ID}`)
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })

  it('returns 403 when the buyerId in the path does not match the token', async () => {
    const res = await request(app)
      .get('/api/orders/buyer/other_buyer')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(403)
    expect(res.body.message).toBe('Forbidden.')
    expect(findManyOrderMock).not.toHaveBeenCalled()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).get(`/api/orders/buyer/${BUYER_ID}`)
    expect(res.status).toBe(401)
    expect(findManyOrderMock).not.toHaveBeenCalled()
  })
})

// ── GET /api/orders/supplier/:supplierId ─────────────────────────────────────

describe('GET /api/orders/supplier/:supplierId', () => {
  beforeEach(() => { findManyOrderMock.mockReset() })

  it('returns orders for the authenticated supplier', async () => {
    findManyOrderMock.mockResolvedValue([sampleOrder])

    const res = await request(app)
      .get(`/api/orders/supplier/${SUPPLIER_ID}`)
      .set('Authorization', `Bearer ${supplierToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('order_1')
    expect(res.body[0].buyer.email).toBe('ava@example.com')
  })

  it('returns 403 when the supplierId in the path does not match the token', async () => {
    const res = await request(app)
      .get('/api/orders/supplier/other_supplier')
      .set('Authorization', `Bearer ${supplierToken}`)

    expect(res.status).toBe(403)
    expect(findManyOrderMock).not.toHaveBeenCalled()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).get(`/api/orders/supplier/${SUPPLIER_ID}`)
    expect(res.status).toBe(401)
  })
})

// ── PATCH /api/orders/:id/status ─────────────────────────────────────────────

describe('PATCH /api/orders/:id/status', () => {
  beforeEach(() => {
    findUniqueOrderMock.mockReset()
    updateOrderMock.mockReset()
  })

  it('advances a PENDING order to CONFIRMED', async () => {
    findUniqueOrderMock.mockResolvedValue({ ...sampleOrder, status: 'PENDING' })
    updateOrderMock.mockResolvedValue({ id: 'order_1', status: 'CONFIRMED' })

    const res = await request(app)
      .patch('/api/orders/order_1/status')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ status: 'CONFIRMED' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('CONFIRMED')
    expect(updateOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_1' },
        data: { status: 'CONFIRMED' },
      }),
    )
  })

  it('accepts lowercase status and uppercases it', async () => {
    findUniqueOrderMock.mockResolvedValue({ ...sampleOrder, status: 'PENDING' })
    updateOrderMock.mockResolvedValue({ id: 'order_1', status: 'CANCELLED' })

    const res = await request(app)
      .patch('/api/orders/order_1/status')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ status: 'cancelled' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('CANCELLED')
  })

  it('returns 400 for an unrecognised status value', async () => {
    const res = await request(app)
      .patch('/api/orders/order_1/status')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ status: 'FLYING' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid status value.')
    expect(findUniqueOrderMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the status transition is not allowed by the state machine', async () => {
    // DELIVERED has no allowed outgoing transitions
    findUniqueOrderMock.mockResolvedValue({ ...sampleOrder, status: 'DELIVERED' })

    const res = await request(app)
      .patch('/api/orders/order_1/status')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ status: 'CONFIRMED' })

    expect(res.status).toBe(409)
    expect(updateOrderMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the order belongs to a different supplier', async () => {
    findUniqueOrderMock.mockResolvedValue({ ...sampleOrder, supplierId: 'other_supplier' })

    const res = await request(app)
      .patch('/api/orders/order_1/status')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ status: 'CONFIRMED' })

    expect(res.status).toBe(404)
    expect(updateOrderMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the order does not exist', async () => {
    findUniqueOrderMock.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/orders/nonexistent/status')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ status: 'CONFIRMED' })

    expect(res.status).toBe(404)
  })

  it('returns 401 without supplier authentication', async () => {
    const res = await request(app)
      .patch('/api/orders/order_1/status')
      .send({ status: 'CONFIRMED' })
    expect(res.status).toBe(401)
  })
})

// ── POST /api/orders (validation) ────────────────────────────────────────────

describe('POST /api/orders (validation)', () => {
  it('returns 400 when items array is empty', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ items: [] })

    expect(res.status).toBe(400)
    expect(res.body.errors.items).toBe('Provide at least one order item.')
  })

  it('returns 400 when items are present but all have quantity 0', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ items: [{ productId: 'prod_1', quantity: 0 }] })

    expect(res.status).toBe(400)
    expect(res.body.errors.items).toBeDefined()
  })

  it('returns 401 without buyer authentication', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [{ productId: 'prod_1', quantity: 1 }] })
    expect(res.status).toBe(401)
  })
})
