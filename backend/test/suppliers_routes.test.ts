import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../src/lib/password.js'
import { signSupplierToken } from '../src/lib/jwt.js'

const {
  findManySupplierMock,
  findUniqueSupplierMock,
  findManyProductMock,
  createSupplierMock,
  updateSupplierMock,
  deleteSupplierMock,
  findUniqueUserMock,
} = vi.hoisted(() => ({
  findManySupplierMock: vi.fn(),
  findUniqueSupplierMock: vi.fn(),
  findManyProductMock: vi.fn(),
  createSupplierMock: vi.fn(),
  updateSupplierMock: vi.fn(),
  deleteSupplierMock: vi.fn(),
  findUniqueUserMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    supplier: {
      findMany: findManySupplierMock,
      findUnique: findUniqueSupplierMock,
      create: createSupplierMock,
      update: updateSupplierMock,
      delete: deleteSupplierMock,
    },
    product: { findMany: findManyProductMock },
    user: { findUnique: findUniqueUserMock },
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

const SUPPLIER_ID = 'sup_1'
const SUPPLIER_PASSWORD = 'Valid!Pass9'
const supplierToken = signSupplierToken(SUPPLIER_ID)

const sampleSupplier = {
  id: SUPPLIER_ID,
  businessName: 'Green Farm AS',
  contactName: 'Ola Nordmann',
  email: 'green@farm.no',
  address: 'Oslo',
  orgnr: null,
  isVerified: true,
  verificationStatus: 'VERIFIED',
  showInMarketplace: true,
  tagline: 'Fresh produce',
  storeType: 'Farm',
  badgeText: 'Local farm',
  brandColor: '#2f9f4f',
  openingHours: null,
  logoUrl: null,
  heroImageUrl: null,
  description: null,
  serviceRadiusKm: null,
  serviceAreas: null,
  openingHoursNote: null,
  websiteUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  preferredContactMethod: null,
  orderNotesHint: null,
  acceptDirectOrders: true,
  minimumOrderAmount: null,
  phoneNumber: '90000000',
  passwordHash: 'hash',
  createdAt: new Date().toISOString(),
  _count: { products: 5 },
}

const sampleProduct = {
  id: 'prod_1',
  supplierId: SUPPLIER_ID,
  name: 'Organic Eggs',
  description: null,
  unit: 'dozen',
  price: 45.0,
  stockQty: 20,
  imageUrl: null,
  isActive: true,
  createdAt: new Date().toISOString(),
}

// ── GET /api/suppliers ────────────────────────────────────────────────────────

describe('GET /api/suppliers', () => {
  beforeEach(() => { findManySupplierMock.mockReset() })

  it('returns verified marketplace-visible suppliers', async () => {
    findManySupplierMock.mockResolvedValue([sampleSupplier])

    const res = await request(app).get('/api/suppliers')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].businessName).toBe('Green Farm AS')
    expect(res.body[0].productCount).toBe(5)
    expect(res.body[0].passwordHash).toBeUndefined()
    expect(findManySupplierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ showInMarketplace: true, isVerified: true }),
      }),
    )
  })

  it('returns empty array when no suppliers are listed', async () => {
    findManySupplierMock.mockResolvedValue([])

    const res = await request(app).get('/api/suppliers')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

// ── GET /api/suppliers/:id ────────────────────────────────────────────────────

describe('GET /api/suppliers/:id', () => {
  beforeEach(() => { findUniqueSupplierMock.mockReset() })

  it('returns the full supplier profile', async () => {
    findUniqueSupplierMock.mockResolvedValue(sampleSupplier)

    const res = await request(app).get(`/api/suppliers/${SUPPLIER_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(SUPPLIER_ID)
    expect(res.body.tagline).toBe('Fresh produce')
    expect(res.body.productCount).toBe(5)
    expect(res.body.passwordHash).toBeUndefined()
  })

  it('returns 404 when supplier does not exist', async () => {
    findUniqueSupplierMock.mockResolvedValue(null)

    const res = await request(app).get('/api/suppliers/nonexistent')

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Supplier not found.')
  })
})

// ── GET /api/suppliers/:id/products ──────────────────────────────────────────

describe('GET /api/suppliers/:id/products', () => {
  beforeEach(() => { findManyProductMock.mockReset() })

  it('returns products for the supplier', async () => {
    findManyProductMock.mockResolvedValue([sampleProduct])

    const res = await request(app).get(`/api/suppliers/${SUPPLIER_ID}/products`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('Organic Eggs')
    expect(res.body[0].supplierId).toBeUndefined()
  })

  it('returns empty array when supplier has no products', async () => {
    findManyProductMock.mockResolvedValue([])

    const res = await request(app).get(`/api/suppliers/${SUPPLIER_ID}/products`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

// ── POST /api/suppliers/register ─────────────────────────────────────────────

describe('POST /api/suppliers/register', () => {
  beforeEach(() => {
    createSupplierMock.mockReset()
    findUniqueUserMock.mockReset()
    findUniqueSupplierMock.mockReset()
  })

  const validPayload = {
    businessName: 'New Farm AS',
    contactName: 'Kari Nordmann',
    phoneNumber: '+4790000001',
    email: 'new@farm.no',
    password: 'Valid!Pass9',
    confirmPassword: 'Valid!Pass9',
    address: 'Bergen, Norway',
  }

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/suppliers/register')
      .send({ email: 'test@test.com' })

    expect(res.status).toBe(400)
    expect(createSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 409 when email is already a buyer account', async () => {
    findUniqueUserMock.mockResolvedValue({ id: 'user_1', email: 'new@farm.no' })

    const res = await request(app)
      .post('/api/suppliers/register')
      .send(validPayload)

    expect(res.status).toBe(409)
    expect(createSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 409 on duplicate email (P2002)', async () => {
    findUniqueUserMock.mockResolvedValue(null)
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002', meta: { target: ['email'] } })
    createSupplierMock.mockRejectedValue(p2002)

    const res = await request(app)
      .post('/api/suppliers/register')
      .send(validPayload)

    expect(res.status).toBe(409)
  })

  it('returns 201 and a token on success', async () => {
    findUniqueUserMock.mockResolvedValue(null)
    createSupplierMock.mockResolvedValue({
      ...sampleSupplier,
      businessName: 'New Farm AS',
      email: 'new@farm.no',
      isVerified: false,
      verificationStatus: 'UNVERIFIED',
    })

    const res = await request(app)
      .post('/api/suppliers/register')
      .send(validPayload)

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.supplier.email).toBe('new@farm.no')
  })
})

// ── POST /api/suppliers/login ─────────────────────────────────────────────────

describe('POST /api/suppliers/login', () => {
  beforeEach(() => { findUniqueSupplierMock.mockReset() })

  it('returns 400 when email or password is missing', async () => {
    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: '' })

    expect(res.status).toBe(400)
    expect(findUniqueSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 401 when supplier is not found', async () => {
    findUniqueSupplierMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: 'nobody@farm.no', password: SUPPLIER_PASSWORD })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password.')
  })

  it('returns 401 for wrong password', async () => {
    findUniqueSupplierMock.mockResolvedValue({
      ...sampleSupplier,
      passwordHash: await hashPassword(SUPPLIER_PASSWORD),
    })

    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: 'green@farm.no', password: 'WrongPassword!9' })

    expect(res.status).toBe(401)
  })

  it('returns 200 and a token for valid credentials', async () => {
    findUniqueSupplierMock.mockResolvedValue({
      ...sampleSupplier,
      passwordHash: await hashPassword(SUPPLIER_PASSWORD),
    })

    const res = await request(app)
      .post('/api/suppliers/login')
      .send({ email: 'green@farm.no', password: SUPPLIER_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.supplier.businessName).toBe('Green Farm AS')
  })
})

// ── PUT /api/suppliers/:id/profile ────────────────────────────────────────────

describe('PUT /api/suppliers/:id/profile', () => {
  beforeEach(() => { updateSupplierMock.mockReset() })

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .put(`/api/suppliers/${SUPPLIER_ID}/profile`)
      .send({ tagline: 'New tagline' })

    expect(res.status).toBe(401)
    expect(updateSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 403 when authenticated as a different supplier', async () => {
    const otherToken = signSupplierToken('other_sup')

    const res = await request(app)
      .put(`/api/suppliers/${SUPPLIER_ID}/profile`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ tagline: 'Hijacked' })

    expect(res.status).toBe(403)
    expect(updateSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 200 and updates profile fields', async () => {
    updateSupplierMock.mockResolvedValue({
      ...sampleSupplier,
      tagline: 'Best farm in Bergen',
      showInMarketplace: false,
    })

    const res = await request(app)
      .put(`/api/suppliers/${SUPPLIER_ID}/profile`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ tagline: 'Best farm in Bergen', showInMarketplace: false })

    expect(res.status).toBe(200)
    expect(res.body.tagline).toBe('Best farm in Bergen')
    expect(res.body.showInMarketplace).toBe(false)
    expect(updateSupplierMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUPPLIER_ID } }),
    )
  })

  it('truncates tagline to 160 characters', async () => {
    const longTagline = 'a'.repeat(200)
    updateSupplierMock.mockResolvedValue({ ...sampleSupplier, tagline: longTagline.slice(0, 160) })

    await request(app)
      .put(`/api/suppliers/${SUPPLIER_ID}/profile`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ tagline: longTagline })

    expect(updateSupplierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tagline: longTagline.slice(0, 160) }),
      }),
    )
  })

  it('ignores undefined optional fields (does not overwrite with null)', async () => {
    updateSupplierMock.mockResolvedValue(sampleSupplier)

    await request(app)
      .put(`/api/suppliers/${SUPPLIER_ID}/profile`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ tagline: 'Updated' })

    const callData = updateSupplierMock.mock.calls[0]?.[0]?.data ?? {}
    expect(callData.showInMarketplace).toBeUndefined()
    expect(callData.acceptDirectOrders).toBeUndefined()
  })
})

// ── DELETE /api/suppliers/account ─────────────────────────────────────────────

describe('DELETE /api/suppliers/account', () => {
  beforeEach(() => { deleteSupplierMock.mockReset() })

  it('returns 401 without authentication', async () => {
    const res = await request(app).delete('/api/suppliers/account')
    expect(res.status).toBe(401)
    expect(deleteSupplierMock).not.toHaveBeenCalled()
  })

  it('returns 204 and deletes the supplier account', async () => {
    deleteSupplierMock.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/suppliers/account')
      .set('Authorization', `Bearer ${supplierToken}`)

    expect(res.status).toBe(204)
    expect(deleteSupplierMock).toHaveBeenCalledWith({ where: { id: SUPPLIER_ID } })
  })
})
