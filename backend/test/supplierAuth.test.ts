import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../src/lib/password.js'
import { signAdminToken, signBuyerToken, signSupplierToken } from '../src/lib/jwt.js'

const {
  findUniqueUserMock,
  findUniqueSupplierMock,
  findManySupplierMock,
  createSupplierMock,
} = vi.hoisted(() => ({
  findUniqueUserMock: vi.fn(),
  findUniqueSupplierMock: vi.fn(),
  findManySupplierMock: vi.fn(),
  createSupplierMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    user: { findUnique: findUniqueUserMock },
    supplier: {
      findUnique: findUniqueSupplierMock,
      findMany: findManySupplierMock,
      create: createSupplierMock,
    },
  }),
}))

import app from '../src/app.js'

const VALID_SUPPLIER_REG = {
  businessName: 'Green Farm AS',
  contactName: 'Ola Nordmann',
  phoneNumber: '+4740012345',
  email: 'green@farm.no',
  password: 'Abcd!123',
  confirmPassword: 'Abcd!123',
  address: 'Storgata 1, 0155 Oslo',
}

const createdSupplier = {
  id: 'sup_123',
  businessName: 'Green Farm AS',
  contactName: 'Ola Nordmann',
  email: 'green@farm.no',
  address: 'Storgata 1, 0155 Oslo',
  orgnr: null,
  isVerified: false,
  verificationStatus: 'UNVERIFIED',
}

describe('POST /api/suppliers/register', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset()
    findUniqueSupplierMock.mockReset()
    createSupplierMock.mockReset()
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('creates a supplier account and returns a token', async () => {
    findUniqueUserMock.mockResolvedValue(null)
    createSupplierMock.mockResolvedValue(createdSupplier)

    const res = await request(app).post('/api/suppliers/register').send(VALID_SUPPLIER_REG)

    expect(res.status).toBe(201)
    expect(res.body.message).toBe('Supplier account created.')
    expect(res.body.token).toBeDefined()
    expect(res.body.supplier.email).toBe('green@farm.no')
    expect(createSupplierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'green@farm.no',
          businessName: 'Green Farm AS',
        }),
      }),
    )
  })

  it('rejects with 400 and validation errors for an invalid payload', async () => {
    const res = await request(app)
      .post('/api/suppliers/register')
      .send({ businessName: '', phoneNumber: 'bad', email: 'not-an-email', password: 'weak' })

    expect(res.status).toBe(400)
    expect(res.body.errors).toBeDefined()
    expect(createSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the email is already registered as a buyer', async () => {
    findUniqueUserMock.mockResolvedValue({ id: 'user_123', email: 'green@farm.no' })

    const res = await request(app).post('/api/suppliers/register').send(VALID_SUPPLIER_REG)

    expect(res.status).toBe(409)
    expect(res.body.errors.email).toBeDefined()
    expect(createSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 409 (P2002) when a supplier with that email already exists', async () => {
    findUniqueUserMock.mockResolvedValue(null)
    createSupplierMock.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } })

    const res = await request(app).post('/api/suppliers/register').send(VALID_SUPPLIER_REG)

    expect(res.status).toBe(409)
    expect(res.body.errors.email).toBeDefined()
  })

  it('returns 409 (P2002) when a supplier with that orgnr already exists', async () => {
    findUniqueUserMock.mockResolvedValue(null)
    createSupplierMock.mockRejectedValue({ code: 'P2002', meta: { target: ['orgnr'] } })

    const res = await request(app)
      .post('/api/suppliers/register')
      .send({ ...VALID_SUPPLIER_REG, orgnr: '123456789' })

    expect(res.status).toBe(409)
    expect(res.body.errors.orgnr).toBeDefined()
  })
})

describe('POST /api/suppliers/login', () => {
  beforeEach(() => {
    findUniqueSupplierMock.mockReset()
  })

  it('signs in a supplier with valid credentials', async () => {
    findUniqueSupplierMock.mockResolvedValue({
      id: 'sup_123',
      businessName: 'Green Farm AS',
      contactName: 'Ola Nordmann',
      email: 'green@farm.no',
      address: 'Storgata 1, Oslo',
      isVerified: true,
      passwordHash: await hashPassword('Abcd!123'),
    })

    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: 'green@farm.no', password: 'Abcd!123' })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Signed in successfully.')
    expect(res.body.token).toBeDefined()
    expect(res.body.supplier.email).toBe('green@farm.no')
  })

  it('rejects an incorrect password', async () => {
    findUniqueSupplierMock.mockResolvedValue({
      id: 'sup_123',
      businessName: 'Green Farm AS',
      contactName: 'Ola Nordmann',
      email: 'green@farm.no',
      address: 'Storgata 1, Oslo',
      isVerified: true,
      passwordHash: await hashPassword('Abcd!123'),
    })

    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: 'green@farm.no', password: 'WrongPassword!9' })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password.')
  })

  it('rejects when no supplier exists for the email', async () => {
    findUniqueSupplierMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: 'nobody@example.com', password: 'Abcd!123' })

    expect(res.status).toBe(401)
  })

  it('rejects malformed payloads before hitting the database', async () => {
    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: 'not-an-email', password: 'short' })

    expect(res.status).toBe(400)
    expect(findUniqueSupplierMock).not.toHaveBeenCalled()
  })
})

// ── Middleware coverage via real routes ──────────────────────────────────────

describe('requireSupplierAuth middleware', () => {
  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/orders/supplier/sup_123')
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Unauthorized.')
  })

  it('rejects requests with an invalid token', async () => {
    const res = await request(app)
      .get('/api/orders/supplier/sup_123')
      .set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
  })

  it('rejects when a buyer token is used instead of a supplier token', async () => {
    const buyerToken = signBuyerToken('user_abc')
    const res = await request(app)
      .get('/api/orders/supplier/sup_123')
      .set('Authorization', `Bearer ${buyerToken}`)
    expect(res.status).toBe(401)
  })

  it('passes a valid supplier token through to the route handler', async () => {
    const supplierToken = signSupplierToken('sup_abc')
    // Route handler will try DB and fail (no mock here), returning 403 or 5xx — not 401
    const res = await request(app)
      .get('/api/orders/supplier/sup_abc')
      .set('Authorization', `Bearer ${supplierToken}`)
    expect(res.status).not.toBe(401)
  })
})

describe('requireAdminAuth middleware', () => {
  beforeEach(() => { findManySupplierMock.mockReset() })

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/admin/suppliers')
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Unauthorized.')
  })

  it('rejects requests with a garbage token', async () => {
    const res = await request(app)
      .get('/api/admin/suppliers')
      .set('Authorization', 'Bearer garbage-token')
    expect(res.status).toBe(401)
  })

  it('rejects when a supplier token is used instead of an admin token', async () => {
    const supplierToken = signSupplierToken('sup_xyz')
    const res = await request(app)
      .get('/api/admin/suppliers')
      .set('Authorization', `Bearer ${supplierToken}`)
    expect(res.status).toBe(401)
  })

  it('allows a valid admin token through to the route handler', async () => {
    findManySupplierMock.mockResolvedValue([])
    const adminToken = signAdminToken('admin_abc')
    const res = await request(app)
      .get('/api/admin/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})
