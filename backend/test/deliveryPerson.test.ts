import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signDeliveryToken } from '../src/lib/jwt.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

const {
  findUniqueDeliveryPersonMock,
  findUniqueOrderMock,
  findManyOrderMock,
  updateOrderMock,
} = vi.hoisted(() => ({
  findUniqueDeliveryPersonMock: vi.fn(),
  findUniqueOrderMock: vi.fn(),
  findManyOrderMock: vi.fn(),
  updateOrderMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    deliveryPerson: {
      findUnique: findUniqueDeliveryPersonMock,
    },
    order: {
      findUnique: findUniqueOrderMock,
      findMany: findManyOrderMock,
      update: updateOrderMock,
    },
  }),
}))

import app from '../src/app.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PERSON_ID = 'dp_test_1'
const OTHER_PERSON_ID = 'dp_test_2'
const ORDER_ID = 'order_test_1'

const activePerson = { id: PERSON_ID, name: 'Test Driver', isActive: true }
const inactivePerson = { id: PERSON_ID, name: 'Pending Driver', isActive: false }

const activeToken = signDeliveryToken(PERSON_ID)
const otherToken = signDeliveryToken(OTHER_PERSON_ID)

const ORDER_INCLUDE_RESULT = {
  supplier: { id: 'sup_1', businessName: 'Farm AS', address: 'Oslo 1' },
  buyer: { firstName: 'Ola', lastName: 'Nordmann', email: 'ola@example.com' },
  deliveryAddress: { address: 'Drammensveien 1', phone: null },
  items: [
    {
      id: 'item_1',
      quantity: 2,
      unitPrice: '25.00',
      product: { name: 'Milk', unit: '1 l' },
    },
  ],
}

const confirmedOrder = {
  id: ORDER_ID,
  status: 'CONFIRMED',
  total: '50.00',
  createdAt: new Date().toISOString(),
  deliveryPersonId: null,
  ...ORDER_INCLUDE_RESULT,
}

// ── POST /api/delivery-person/orders/:id/claim ────────────────────────────────

describe('POST /api/delivery-person/orders/:id/claim', () => {
  beforeEach(() => {
    findUniqueDeliveryPersonMock.mockReset()
    findUniqueOrderMock.mockReset()
    updateOrderMock.mockReset()
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).post(`/api/delivery-person/orders/${ORDER_ID}/claim`)
    expect(res.status).toBe(401)
  })

  it('returns 403 when delivery person is not approved', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(inactivePerson)

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/claim`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/pending admin approval/i)
  })

  it('returns 404 when order does not exist', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findUniqueOrderMock.mockResolvedValue(null)

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/claim`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/not found/i)
  })

  it('returns 409 when order is not CONFIRMED', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findUniqueOrderMock.mockResolvedValue({ ...confirmedOrder, status: 'PENDING' })

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/claim`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/not available/i)
  })

  it('returns 409 when order already has a delivery person', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findUniqueOrderMock.mockResolvedValue({ ...confirmedOrder, deliveryPersonId: OTHER_PERSON_ID })

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/claim`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/already been claimed/i)
  })

  it('claims the order successfully and returns the updated order', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findUniqueOrderMock.mockResolvedValue(confirmedOrder)

    const claimedOrder = {
      ...confirmedOrder,
      status: 'IN_TRANSIT',
      woltStatus: 'PICKED_UP',
      deliveryPersonId: PERSON_ID,
    }
    updateOrderMock.mockResolvedValue(claimedOrder)

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/claim`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ORDER_ID)
    expect(res.body.status).toBe('IN_TRANSIT')
    expect(res.body.deliveryPersonId).toBe(PERSON_ID)
    expect(updateOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID },
        data: expect.objectContaining({
          deliveryPersonId: PERSON_ID,
          status: 'IN_TRANSIT',
          woltStatus: 'PICKED_UP',
        }),
      }),
    )
  })
})

// ── POST /api/delivery-person/orders/:id/complete ────────────────────────────

describe('POST /api/delivery-person/orders/:id/complete', () => {
  beforeEach(() => {
    findUniqueDeliveryPersonMock.mockReset()
    findUniqueOrderMock.mockReset()
    updateOrderMock.mockReset()
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).post(`/api/delivery-person/orders/${ORDER_ID}/complete`)
    expect(res.status).toBe(401)
  })

  it('returns 403 when delivery person is not approved', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(inactivePerson)

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/complete`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 404 when order does not exist', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findUniqueOrderMock.mockResolvedValue(null)

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/complete`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(404)
  })

  it('returns 403 when order is assigned to a different delivery person', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue({ id: OTHER_PERSON_ID, isActive: true })
    findUniqueOrderMock.mockResolvedValue({
      ...confirmedOrder,
      status: 'IN_TRANSIT',
      deliveryPersonId: PERSON_ID,
    })

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/complete`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/not assigned to you/i)
  })

  it('returns 409 when order is not IN_TRANSIT', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findUniqueOrderMock.mockResolvedValue({
      ...confirmedOrder,
      status: 'DELIVERED',
      deliveryPersonId: PERSON_ID,
    })

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/complete`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/not in transit/i)
  })

  it('marks the order as delivered successfully', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findUniqueOrderMock.mockResolvedValue({
      ...confirmedOrder,
      status: 'IN_TRANSIT',
      deliveryPersonId: PERSON_ID,
    })

    const deliveredOrder = {
      ...confirmedOrder,
      status: 'DELIVERED',
      woltStatus: 'DELIVERED',
      deliveryPersonId: PERSON_ID,
    }
    updateOrderMock.mockResolvedValue(deliveredOrder)

    const res = await request(app)
      .post(`/api/delivery-person/orders/${ORDER_ID}/complete`)
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DELIVERED')
    expect(updateOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID },
        data: expect.objectContaining({ status: 'DELIVERED', woltStatus: 'DELIVERED' }),
      }),
    )
  })
})

// ── GET /api/delivery-person/available-orders ─────────────────────────────────

describe('GET /api/delivery-person/available-orders', () => {
  beforeEach(() => {
    findUniqueDeliveryPersonMock.mockReset()
    findManyOrderMock.mockReset()
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/delivery-person/available-orders')
    expect(res.status).toBe(401)
  })

  it('returns 403 when delivery person is not approved', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(inactivePerson)

    const res = await request(app)
      .get('/api/delivery-person/available-orders')
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(403)
  })

  it('returns available orders for an approved driver', async () => {
    findUniqueDeliveryPersonMock.mockResolvedValue(activePerson)
    findManyOrderMock.mockResolvedValue([confirmedOrder])

    const res = await request(app)
      .get('/api/delivery-person/available-orders')
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe(ORDER_ID)
    expect(findManyOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED', deliveryPersonId: null },
      }),
    )
  })
})

// ── GET /api/delivery-person/my-orders ───────────────────────────────────────

describe('GET /api/delivery-person/my-orders', () => {
  beforeEach(() => {
    findManyOrderMock.mockReset()
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/delivery-person/my-orders')
    expect(res.status).toBe(401)
  })

  it('returns orders assigned to the delivery person', async () => {
    findManyOrderMock.mockResolvedValue([
      { ...confirmedOrder, status: 'IN_TRANSIT', deliveryPersonId: PERSON_ID },
    ])

    const res = await request(app)
      .get('/api/delivery-person/my-orders')
      .set('Authorization', `Bearer ${activeToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(findManyOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deliveryPersonId: PERSON_ID } }),
    )
  })
})
