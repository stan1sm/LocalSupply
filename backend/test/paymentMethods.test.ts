import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signBuyerToken } from '../src/lib/jwt.js'

const {
  findManyPaymentMock,
  countPaymentMock,
  createPaymentMock,
  findUniquePaymentMock,
  updatePaymentMock,
  updateManyPaymentMock,
  deletePaymentMock,
  findFirstPaymentMock,
} = vi.hoisted(() => ({
  findManyPaymentMock: vi.fn(),
  countPaymentMock: vi.fn(),
  createPaymentMock: vi.fn(),
  findUniquePaymentMock: vi.fn(),
  updatePaymentMock: vi.fn(),
  updateManyPaymentMock: vi.fn(),
  deletePaymentMock: vi.fn(),
  findFirstPaymentMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    userPaymentMethod: {
      findMany: findManyPaymentMock,
      count: countPaymentMock,
      create: createPaymentMock,
      findUnique: findUniquePaymentMock,
      update: updatePaymentMock,
      updateMany: updateManyPaymentMock,
      delete: deletePaymentMock,
      findFirst: findFirstPaymentMock,
    },
  }),
}))

import app from '../src/app.js'

const USER_ID = 'user_xyz'
const token = signBuyerToken(USER_ID)
const authHeader = `Bearer ${token}`

const sampleCard = {
  id: 'pm_1',
  userId: USER_ID,
  cardholderName: 'Ola Nordmann',
  maskedNumber: '•••• •••• •••• 4242',
  lastFour: '4242',
  expiry: '12/26',
  cardType: 'Visa',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('GET /api/auth/payment-methods', () => {
  beforeEach(() => { findManyPaymentMock.mockReset() })

  it('returns payment methods for authenticated user', async () => {
    findManyPaymentMock.mockResolvedValue([sampleCard])

    const res = await request(app)
      .get('/api/auth/payment-methods')
      .set('Authorization', authHeader)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].lastFour).toBe('4242')
    expect(findManyPaymentMock).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/auth/payment-methods')
    expect(res.status).toBe(401)
    expect(findManyPaymentMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/payment-methods', () => {
  beforeEach(() => {
    countPaymentMock.mockReset()
    createPaymentMock.mockReset()
    updateManyPaymentMock.mockReset()
  })

  it('saves a card for the authenticated user', async () => {
    countPaymentMock.mockResolvedValue(1)
    createPaymentMock.mockResolvedValue(sampleCard)

    const res = await request(app)
      .post('/api/auth/payment-methods')
      .set('Authorization', authHeader)
      .send({ cardholderName: 'Ola Nordmann', lastFour: '4242', expiry: '12/26', cardType: 'Visa' })

    expect(res.status).toBe(201)
    expect(res.body.lastFour).toBe('4242')
    expect(createPaymentMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, lastFour: '4242' }),
    })
  })

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/payment-methods')
      .set('Authorization', authHeader)
      .send({ cardholderName: 'Ola Nordmann' })

    expect(res.status).toBe(400)
    expect(createPaymentMock).not.toHaveBeenCalled()
  })

  it('first card is always set as default', async () => {
    countPaymentMock.mockResolvedValue(0)
    updateManyPaymentMock.mockResolvedValue({ count: 0 })
    createPaymentMock.mockResolvedValue({ ...sampleCard, isDefault: true })

    await request(app)
      .post('/api/auth/payment-methods')
      .set('Authorization', authHeader)
      .send({ cardholderName: 'Ola Nordmann', lastFour: '1234', expiry: '01/27' })

    expect(createPaymentMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ isDefault: true }),
    })
  })

  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/auth/payment-methods')
      .send({ cardholderName: 'Ola Nordmann', lastFour: '4242', expiry: '12/26' })

    expect(res.status).toBe(401)
    expect(createPaymentMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/auth/payment-methods/:id', () => {
  beforeEach(() => {
    findUniquePaymentMock.mockReset()
    updatePaymentMock.mockReset()
    updateManyPaymentMock.mockReset()
  })

  it('sets a card as default', async () => {
    findUniquePaymentMock.mockResolvedValue({ ...sampleCard, isDefault: false })
    updateManyPaymentMock.mockResolvedValue({ count: 1 })
    updatePaymentMock.mockResolvedValue({ ...sampleCard, isDefault: true })

    const res = await request(app)
      .patch('/api/auth/payment-methods/pm_1')
      .set('Authorization', authHeader)
      .send({ isDefault: true })

    expect(res.status).toBe(200)
    expect(res.body.isDefault).toBe(true)
  })

  it('returns 404 for a card belonging to another user', async () => {
    findUniquePaymentMock.mockResolvedValue({ ...sampleCard, userId: 'other_user' })

    const res = await request(app)
      .patch('/api/auth/payment-methods/pm_1')
      .set('Authorization', authHeader)
      .send({ isDefault: true })

    expect(res.status).toBe(404)
    expect(updatePaymentMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/auth/payment-methods/:id', () => {
  beforeEach(() => {
    findUniquePaymentMock.mockReset()
    deletePaymentMock.mockReset()
    findFirstPaymentMock.mockReset()
    updatePaymentMock.mockReset()
  })

  it('deletes a card and promotes next as default', async () => {
    findUniquePaymentMock.mockResolvedValue(sampleCard)
    deletePaymentMock.mockResolvedValue(sampleCard)
    const nextCard = { ...sampleCard, id: 'pm_2', isDefault: false }
    findFirstPaymentMock.mockResolvedValue(nextCard)
    updatePaymentMock.mockResolvedValue({ ...nextCard, isDefault: true })

    const res = await request(app)
      .delete('/api/auth/payment-methods/pm_1')
      .set('Authorization', authHeader)

    expect(res.status).toBe(204)
    expect(deletePaymentMock).toHaveBeenCalledWith({ where: { id: 'pm_1' } })
    expect(updatePaymentMock).toHaveBeenCalledWith({
      where: { id: 'pm_2' },
      data: { isDefault: true },
    })
  })

  it('returns 404 for a card belonging to another user', async () => {
    findUniquePaymentMock.mockResolvedValue({ ...sampleCard, userId: 'other_user' })

    const res = await request(app)
      .delete('/api/auth/payment-methods/pm_1')
      .set('Authorization', authHeader)

    expect(res.status).toBe(404)
    expect(deletePaymentMock).not.toHaveBeenCalled()
  })
})
