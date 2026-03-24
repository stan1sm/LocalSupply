import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signBuyerToken } from '../src/lib/jwt.js'

const {
  findManyAddressMock,
  countAddressMock,
  createAddressMock,
  findUniqueAddressMock,
  updateAddressMock,
  updateManyAddressMock,
  deleteAddressMock,
  findFirstAddressMock,
} = vi.hoisted(() => ({
  findManyAddressMock: vi.fn(),
  countAddressMock: vi.fn(),
  createAddressMock: vi.fn(),
  findUniqueAddressMock: vi.fn(),
  updateAddressMock: vi.fn(),
  updateManyAddressMock: vi.fn(),
  deleteAddressMock: vi.fn(),
  findFirstAddressMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    userAddress: {
      findMany: findManyAddressMock,
      count: countAddressMock,
      create: createAddressMock,
      findUnique: findUniqueAddressMock,
      update: updateAddressMock,
      updateMany: updateManyAddressMock,
      delete: deleteAddressMock,
      findFirst: findFirstAddressMock,
    },
  }),
}))

import app from '../src/app.js'

const USER_ID = 'user_abc'
const token = signBuyerToken(USER_ID)
const authHeader = `Bearer ${token}`

const sampleAddress = {
  id: 'addr_1',
  userId: USER_ID,
  label: 'Work',
  address: 'Storgata 1, 0155 Oslo',
  phone: '40012345',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('GET /api/auth/addresses', () => {
  beforeEach(() => { findManyAddressMock.mockReset() })

  it('returns addresses for authenticated user', async () => {
    findManyAddressMock.mockResolvedValue([sampleAddress])

    const res = await request(app)
      .get('/api/auth/addresses')
      .set('Authorization', authHeader)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].address).toBe('Storgata 1, 0155 Oslo')
    expect(findManyAddressMock).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/addresses')
    expect(res.status).toBe(401)
    expect(findManyAddressMock).not.toHaveBeenCalled()
  })

  it('rejects requests with an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/addresses')
      .set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
    expect(findManyAddressMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/addresses', () => {
  beforeEach(() => {
    countAddressMock.mockReset()
    createAddressMock.mockReset()
    updateManyAddressMock.mockReset()
  })

  it('creates an address for the authenticated user', async () => {
    countAddressMock.mockResolvedValue(1)
    createAddressMock.mockResolvedValue(sampleAddress)

    const res = await request(app)
      .post('/api/auth/addresses')
      .set('Authorization', authHeader)
      .send({ address: 'Storgata 1, 0155 Oslo', label: 'Work', phone: '40012345' })

    expect(res.status).toBe(201)
    expect(res.body.address).toBe('Storgata 1, 0155 Oslo')
    expect(createAddressMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, address: 'Storgata 1, 0155 Oslo' }),
    })
  })

  it('rejects missing address field', async () => {
    const res = await request(app)
      .post('/api/auth/addresses')
      .set('Authorization', authHeader)
      .send({ label: 'Home' })

    expect(res.status).toBe(400)
    expect(createAddressMock).not.toHaveBeenCalled()
  })

  it('rejects invalid Norwegian phone', async () => {
    const res = await request(app)
      .post('/api/auth/addresses')
      .set('Authorization', authHeader)
      .send({ address: 'Storgata 1, 0155 Oslo', phone: '123' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('Invalid phone number')
    expect(createAddressMock).not.toHaveBeenCalled()
  })

  it('accepts +47 international format', async () => {
    countAddressMock.mockResolvedValue(0)
    createAddressMock.mockResolvedValue({ ...sampleAddress, phone: '+4740012345' })

    const res = await request(app)
      .post('/api/auth/addresses')
      .set('Authorization', authHeader)
      .send({ address: 'Storgata 1, 0155 Oslo', phone: '+4740012345' })

    expect(res.status).toBe(201)
  })

  it('first address is always set as default', async () => {
    countAddressMock.mockResolvedValue(0)
    updateManyAddressMock.mockResolvedValue({ count: 0 })
    createAddressMock.mockResolvedValue({ ...sampleAddress, isDefault: true })

    await request(app)
      .post('/api/auth/addresses')
      .set('Authorization', authHeader)
      .send({ address: 'Karl Johans gate 1, 0154 Oslo' })

    expect(createAddressMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ isDefault: true }),
    })
  })

  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/auth/addresses')
      .send({ address: 'Storgata 1, 0155 Oslo' })

    expect(res.status).toBe(401)
    expect(createAddressMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/auth/addresses/:id', () => {
  beforeEach(() => {
    findUniqueAddressMock.mockReset()
    updateAddressMock.mockReset()
    updateManyAddressMock.mockReset()
  })

  it('sets an address as default', async () => {
    findUniqueAddressMock.mockResolvedValue({ ...sampleAddress, isDefault: false })
    updateManyAddressMock.mockResolvedValue({ count: 1 })
    updateAddressMock.mockResolvedValue({ ...sampleAddress, isDefault: true })

    const res = await request(app)
      .patch('/api/auth/addresses/addr_1')
      .set('Authorization', authHeader)
      .send({ isDefault: true })

    expect(res.status).toBe(200)
    expect(res.body.isDefault).toBe(true)
  })

  it('returns 404 if address belongs to another user', async () => {
    findUniqueAddressMock.mockResolvedValue({ ...sampleAddress, userId: 'other_user' })

    const res = await request(app)
      .patch('/api/auth/addresses/addr_1')
      .set('Authorization', authHeader)
      .send({ isDefault: true })

    expect(res.status).toBe(404)
    expect(updateAddressMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/auth/addresses/:id', () => {
  beforeEach(() => {
    findUniqueAddressMock.mockReset()
    deleteAddressMock.mockReset()
    findFirstAddressMock.mockReset()
    updateAddressMock.mockReset()
  })

  it('deletes an address and promotes next as default', async () => {
    findUniqueAddressMock.mockResolvedValue(sampleAddress)
    deleteAddressMock.mockResolvedValue(sampleAddress)
    const nextAddr = { ...sampleAddress, id: 'addr_2', isDefault: false }
    findFirstAddressMock.mockResolvedValue(nextAddr)
    updateAddressMock.mockResolvedValue({ ...nextAddr, isDefault: true })

    const res = await request(app)
      .delete('/api/auth/addresses/addr_1')
      .set('Authorization', authHeader)

    expect(res.status).toBe(204)
    expect(deleteAddressMock).toHaveBeenCalledWith({ where: { id: 'addr_1' } })
    expect(updateAddressMock).toHaveBeenCalledWith({
      where: { id: 'addr_2' },
      data: { isDefault: true },
    })
  })

  it('returns 404 for an address belonging to another user', async () => {
    findUniqueAddressMock.mockResolvedValue({ ...sampleAddress, userId: 'other_user' })

    const res = await request(app)
      .delete('/api/auth/addresses/addr_1')
      .set('Authorization', authHeader)

    expect(res.status).toBe(404)
    expect(deleteAddressMock).not.toHaveBeenCalled()
  })
})
