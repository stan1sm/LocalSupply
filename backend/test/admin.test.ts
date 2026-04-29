import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../src/lib/password.js'
import { signAdminToken } from '../src/lib/jwt.js'

const {
  findUniqueAdminMock,
  findFirstAdminMock,
  createAdminMock,
  findManySupplierMock,
  updateSupplierMock,
  deleteSupplierMock,
  findManyUserMock,
  deleteUserMock,
  findManyOrderMock,
} = vi.hoisted(() => ({
  findUniqueAdminMock: vi.fn(),
  findFirstAdminMock: vi.fn(),
  createAdminMock: vi.fn(),
  findManySupplierMock: vi.fn(),
  updateSupplierMock: vi.fn(),
  deleteSupplierMock: vi.fn(),
  findManyUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  findManyOrderMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    admin: {
      findUnique: findUniqueAdminMock,
      findFirst: findFirstAdminMock,
      create: createAdminMock,
    },
    supplier: {
      findMany: findManySupplierMock,
      update: updateSupplierMock,
      delete: deleteSupplierMock,
    },
    user: {
      findMany: findManyUserMock,
      delete: deleteUserMock,
    },
    order: {
      findMany: findManyOrderMock,
    },
  }),
}))

vi.mock('../src/lib/email.js', () => ({
  sendSupplierVerificationApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendSupplierVerificationRejectedEmail: vi.fn().mockResolvedValue(undefined),
  buildEmailVerifiedRedirectUrl: vi.fn().mockReturnValue('http://localhost:3000/email-verified'),
  sendUserVerificationEmail: vi.fn().mockResolvedValue({ mode: 'email' }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendBuyerOrderStatusEmail: vi.fn().mockResolvedValue(undefined),
  sendSupplierOrderEmail: vi.fn().mockResolvedValue(undefined),
}))

import app from '../src/app.js'

const ADMIN_PASSWORD = 'Admin!123'
const ADMIN_ID = 'admin_1'
const adminToken = signAdminToken(ADMIN_ID)

// ── POST /api/admin/login ─────────────────────────────────────────────────────

describe('POST /api/admin/login', () => {
  beforeEach(() => { findUniqueAdminMock.mockReset() })

  it('returns a token for valid credentials', async () => {
    findUniqueAdminMock.mockResolvedValue({
      id: ADMIN_ID,
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    })

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@example.com', password: ADMIN_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.admin.email).toBe('admin@example.com')
  })

  it('returns 400 when email or password is missing', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: '' })

    expect(res.status).toBe(400)
    expect(findUniqueAdminMock).not.toHaveBeenCalled()
  })

  it('returns 401 for a wrong password', async () => {
    findUniqueAdminMock.mockResolvedValue({
      id: ADMIN_ID,
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    })

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@example.com', password: 'WrongPassword!9' })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password.')
  })

  it('returns 401 when no admin account exists', async () => {
    findUniqueAdminMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'noone@example.com', password: ADMIN_PASSWORD })

    expect(res.status).toBe(401)
  })
})

// ── POST /api/admin/seed ──────────────────────────────────────────────────────

describe('POST /api/admin/seed', () => {
  beforeEach(() => {
    findFirstAdminMock.mockReset()
    createAdminMock.mockReset()
  })

  it('creates the first admin and returns 201', async () => {
    findFirstAdminMock.mockResolvedValue(null)
    createAdminMock.mockResolvedValue({ id: ADMIN_ID, email: 'admin@example.com', name: 'Admin' })

    const res = await request(app)
      .post('/api/admin/seed')
      .send({ email: 'admin@example.com', password: 'Admin!123', name: 'Admin' })

    expect(res.status).toBe(201)
    expect(res.body.admin.email).toBe('admin@example.com')
  })

  it('returns 409 when an admin already exists', async () => {
    findFirstAdminMock.mockResolvedValue({ id: ADMIN_ID, email: 'admin@example.com' })

    const res = await request(app)
      .post('/api/admin/seed')
      .send({ email: 'new@example.com', password: 'Admin!123' })

    expect(res.status).toBe(409)
    expect(createAdminMock).not.toHaveBeenCalled()
  })

  it('returns 400 when email or password is missing', async () => {
    const res = await request(app)
      .post('/api/admin/seed')
      .send({ email: '' })

    expect(res.status).toBe(400)
    expect(createAdminMock).not.toHaveBeenCalled()
  })
})

// ── GET /api/admin/suppliers ──────────────────────────────────────────────────

const sampleSupplier = {
  id: 'sup_1',
  businessName: 'Green Farm AS',
  contactName: 'Ola Nordmann',
  email: 'green@farm.no',
  address: 'Oslo',
  orgnr: null,
  isVerified: true,
  verificationStatus: 'VERIFIED',
  verificationRejectedReason: null,
  showInMarketplace: true,
  createdAt: new Date().toISOString(),
  _count: { products: 2, orders: 5 },
}

describe('GET /api/admin/suppliers', () => {
  beforeEach(() => { findManySupplierMock.mockReset() })

  it('returns all suppliers with product and order counts', async () => {
    findManySupplierMock.mockResolvedValue([sampleSupplier])

    const res = await request(app)
      .get('/api/admin/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].businessName).toBe('Green Farm AS')
    expect(res.body[0].productCount).toBe(2)
    expect(res.body[0].orderCount).toBe(5)
  })

  it('returns 401 without admin auth', async () => {
    const res = await request(app).get('/api/admin/suppliers')
    expect(res.status).toBe(401)
    expect(findManySupplierMock).not.toHaveBeenCalled()
  })
})

// ── PATCH /api/admin/suppliers/:id ───────────────────────────────────────────

describe('PATCH /api/admin/suppliers/:id', () => {
  beforeEach(() => { updateSupplierMock.mockReset() })

  it('marks a supplier as VERIFIED', async () => {
    updateSupplierMock.mockResolvedValue({
      ...sampleSupplier,
      verificationStatus: 'VERIFIED',
      isVerified: true,
    })

    const res = await request(app)
      .patch('/api/admin/suppliers/sup_1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verificationStatus: 'VERIFIED' })

    expect(res.status).toBe(200)
    expect(res.body.isVerified).toBe(true)
    expect(res.body.verificationStatus).toBe('VERIFIED')
    expect(updateSupplierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sup_1' },
        data: expect.objectContaining({ isVerified: true, verificationStatus: 'VERIFIED' }),
      }),
    )
  })

  it('marks a supplier as REJECTED', async () => {
    updateSupplierMock.mockResolvedValue({
      ...sampleSupplier,
      verificationStatus: 'REJECTED',
      isVerified: false,
      verificationRejectedReason: 'Documents missing',
    })

    const res = await request(app)
      .patch('/api/admin/suppliers/sup_1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verificationStatus: 'REJECTED', verificationRejectedReason: 'Documents missing' })

    expect(res.status).toBe(200)
    expect(res.body.isVerified).toBe(false)
  })

  it('updates showInMarketplace', async () => {
    updateSupplierMock.mockResolvedValue({
      ...sampleSupplier,
      showInMarketplace: false,
    })

    const res = await request(app)
      .patch('/api/admin/suppliers/sup_1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ showInMarketplace: false })

    expect(res.status).toBe(200)
    expect(res.body.showInMarketplace).toBe(false)
  })

  it('returns 401 without admin auth', async () => {
    const res = await request(app)
      .patch('/api/admin/suppliers/sup_1')
      .send({ verificationStatus: 'VERIFIED' })

    expect(res.status).toBe(401)
    expect(updateSupplierMock).not.toHaveBeenCalled()
  })
})

// ── DELETE /api/admin/suppliers/:id ──────────────────────────────────────────

describe('DELETE /api/admin/suppliers/:id', () => {
  beforeEach(() => { deleteSupplierMock.mockReset() })

  it('deletes a supplier and returns ok', async () => {
    deleteSupplierMock.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/admin/suppliers/sup_1')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(deleteSupplierMock).toHaveBeenCalledWith({ where: { id: 'sup_1' } })
  })

  it('returns 401 without admin auth', async () => {
    const res = await request(app).delete('/api/admin/suppliers/sup_1')
    expect(res.status).toBe(401)
  })
})

// ── GET /api/admin/users ──────────────────────────────────────────────────────

const sampleUser = {
  id: 'user_1',
  firstName: 'Ava',
  lastName: 'Johnson',
  email: 'ava@example.com',
  emailVerified: true,
  createdAt: new Date().toISOString(),
  _count: { orders: 3 },
}

describe('GET /api/admin/users', () => {
  beforeEach(() => { findManyUserMock.mockReset() })

  it('returns all users with order counts', async () => {
    findManyUserMock.mockResolvedValue([sampleUser])

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].email).toBe('ava@example.com')
    expect(res.body[0].orderCount).toBe(3)
    expect(res.body[0].passwordHash).toBeUndefined()
  })

  it('returns 401 without admin auth', async () => {
    const res = await request(app).get('/api/admin/users')
    expect(res.status).toBe(401)
  })
})

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────

describe('DELETE /api/admin/users/:id', () => {
  beforeEach(() => { deleteUserMock.mockReset() })

  it('deletes a user and returns ok', async () => {
    deleteUserMock.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/admin/users/user_1')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(deleteUserMock).toHaveBeenCalledWith({ where: { id: 'user_1' } })
  })

  it('returns 401 without admin auth', async () => {
    const res = await request(app).delete('/api/admin/users/user_1')
    expect(res.status).toBe(401)
  })
})

// ── GET /api/admin/orders ─────────────────────────────────────────────────────

const sampleOrder = {
  id: 'order_1',
  status: 'PENDING',
  total: 150,
  createdAt: new Date().toISOString(),
  woltStatus: null,
  buyer: { firstName: 'Ava', lastName: 'Johnson', email: 'ava@example.com' },
  supplier: { businessName: 'Green Farm AS' },
  _count: { items: 2 },
}

describe('GET /api/admin/orders', () => {
  beforeEach(() => { findManyOrderMock.mockReset() })

  it('returns all orders with buyer and supplier info', async () => {
    findManyOrderMock.mockResolvedValue([sampleOrder])

    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('order_1')
    expect(res.body[0].supplierName).toBe('Green Farm AS')
    expect(res.body[0].itemCount).toBe(2)
    expect(res.body[0].buyer.email).toBe('ava@example.com')
  })

  it('returns 401 without admin auth', async () => {
    const res = await request(app).get('/api/admin/orders')
    expect(res.status).toBe(401)
  })
})
