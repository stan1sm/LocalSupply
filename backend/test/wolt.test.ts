import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirstOrderMock, updateOrderMock } = vi.hoisted(() => ({
  findFirstOrderMock: vi.fn(),
  updateOrderMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    order: {
      findFirst: findFirstOrderMock,
      update: updateOrderMock,
    },
  }),
}))

vi.mock('../src/lib/woltDrive.js', () => ({
  getDeliveryEstimate: vi.fn().mockResolvedValue({
    ok: true,
    fee: 49,
    currency: 'NOK',
    etaMinutes: 30,
  }),
  parseAddressString: vi.fn().mockImplementation((address: string) => ({
    street: address,
    city: 'Oslo',
    country: 'NO',
  })),
  woltStatusToOrderStatus: vi.fn().mockReturnValue('IN_TRANSIT'),
  WOLT_CONFIGURED: false,
}))

import app from '../src/app.js'

// ── POST /api/wolt/estimate ───────────────────────────────────────────────────

describe('POST /api/wolt/estimate', () => {
  it('returns a delivery estimate for a valid dropoff address', async () => {
    const res = await request(app)
      .post('/api/wolt/estimate')
      .send({ dropoffAddress: 'Storgata 1, 0155 Oslo' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.fee).toBe(49)
    expect(res.body.etaMinutes).toBe(30)
  })

  it('accepts a custom pickupAddress', async () => {
    const res = await request(app)
      .post('/api/wolt/estimate')
      .send({
        dropoffAddress: 'Karl Johans gate 1, 0154 Oslo',
        pickupAddress: 'Torggata 10, 0181 Oslo',
      })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 when dropoffAddress is missing', async () => {
    const res = await request(app)
      .post('/api/wolt/estimate')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('INVALID_DROPOFF_ADDRESS')
  })

  it('returns 400 when dropoffAddress is empty', async () => {
    const res = await request(app)
      .post('/api/wolt/estimate')
      .send({ dropoffAddress: '' })

    expect(res.status).toBe(400)
  })
})

// ── POST /api/wolt/webhook ────────────────────────────────────────────────────

describe('POST /api/wolt/webhook', () => {
  beforeEach(() => {
    findFirstOrderMock.mockReset()
    updateOrderMock.mockReset()
  })

  it('acknowledges a webhook immediately with 200', async () => {
    findFirstOrderMock.mockResolvedValue({ id: 'order_1', status: 'CONFIRMED' })
    updateOrderMock.mockResolvedValue({ id: 'order_1', status: 'IN_TRANSIT' })

    const payload = JSON.stringify({ id: 'delivery_xyz', status: 'at_pickup' })

    const res = await request(app)
      .post('/api/wolt/webhook')
      .set('Content-Type', 'application/json')
      .send(payload)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 200 even when the delivery id matches no order', async () => {
    findFirstOrderMock.mockResolvedValue(null)

    const payload = JSON.stringify({ id: 'delivery_unknown', status: 'delivered' })

    const res = await request(app)
      .post('/api/wolt/webhook')
      .set('Content-Type', 'application/json')
      .send(payload)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 200 when the payload has no delivery id or status', async () => {
    const payload = JSON.stringify({})

    const res = await request(app)
      .post('/api/wolt/webhook')
      .set('Content-Type', 'application/json')
      .send(payload)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
