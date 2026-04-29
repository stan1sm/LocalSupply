import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findManySupplierMock, findUniqueSupplierMock, findManyProductMock } = vi.hoisted(() => ({
  findManySupplierMock: vi.fn(),
  findUniqueSupplierMock: vi.fn(),
  findManyProductMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    supplier: {
      findMany: findManySupplierMock,
      findUnique: findUniqueSupplierMock,
    },
    product: {
      findMany: findManyProductMock,
    },
  }),
}))

import app from '../src/app.js'

const sampleSupplier = {
  id: 'sup_1',
  businessName: 'Green Farm AS',
  contactName: 'Ola Nordmann',
  address: 'Storgata 1, 0155 Oslo',
  email: 'green@farm.no',
  isVerified: true,
  showInMarketplace: true,
  createdAt: new Date().toISOString(),
  tagline: 'Fresh from the farm',
  storeType: 'Farm',
  badgeText: null,
  brandColor: null,
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
  _count: { products: 3 },
}

// ── GET /api/suppliers ───────────────────────────────────────────────────────

describe('GET /api/suppliers', () => {
  beforeEach(() => { findManySupplierMock.mockReset() })

  it('returns verified, marketplace-visible suppliers', async () => {
    findManySupplierMock.mockResolvedValue([sampleSupplier])

    const res = await request(app).get('/api/suppliers')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].businessName).toBe('Green Farm AS')
    expect(res.body[0].productCount).toBe(3)
    expect(findManySupplierMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { showInMarketplace: true, isVerified: true },
      }),
    )
  })

  it('returns an empty array when no matching suppliers exist', async () => {
    findManySupplierMock.mockResolvedValue([])

    const res = await request(app).get('/api/suppliers')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

// ── GET /api/suppliers/:supplierId ───────────────────────────────────────────

describe('GET /api/suppliers/:supplierId', () => {
  beforeEach(() => { findUniqueSupplierMock.mockReset() })

  it('returns supplier details for a known id', async () => {
    findUniqueSupplierMock.mockResolvedValue(sampleSupplier)

    const res = await request(app).get('/api/suppliers/sup_1')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('sup_1')
    expect(res.body.businessName).toBe('Green Farm AS')
    expect(res.body.productCount).toBe(3)
  })

  it('returns 404 when no supplier matches the id', async () => {
    findUniqueSupplierMock.mockResolvedValue(null)

    const res = await request(app).get('/api/suppliers/nonexistent')

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Supplier not found.')
  })
})

// ── GET /api/suppliers/:supplierId/products ──────────────────────────────────

describe('GET /api/suppliers/:supplierId/products', () => {
  beforeEach(() => { findManyProductMock.mockReset() })

  it('returns the products listed by a supplier', async () => {
    findManyProductMock.mockResolvedValue([
      {
        id: 'prod_1',
        name: 'Farm Eggs',
        description: 'Free-range eggs',
        unit: 'dozen',
        price: 65.0,
        stockQty: 50,
        imageUrl: null,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ])

    const res = await request(app).get('/api/suppliers/sup_1/products')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('Farm Eggs')
    expect(res.body[0].price).toBe(65.0)
    expect(findManyProductMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { supplierId: 'sup_1' } }),
    )
  })

  it('returns an empty array when the supplier has no products', async () => {
    findManyProductMock.mockResolvedValue([])

    const res = await request(app).get('/api/suppliers/sup_1/products')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

// ── GET /api/suppliers/verify/:orgnr ────────────────────────────────────────

describe('GET /api/suppliers/verify/:orgnr', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('returns 400 when orgnr is not exactly 9 digits', async () => {
    const res = await request(app).get('/api/suppliers/verify/12345')

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.message).toContain('9 digits')
  })

  it('returns 404 when Brønnøysund reports the company is not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false }))

    const res = await request(app).get('/api/suppliers/verify/123456789')

    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
  })

  it('returns company info for a valid active organisation number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          navn: 'Green Farm AS',
          konkurs: false,
          underAvvikling: false,
          underTvangsavviklingEllerTvangsopplosning: false,
          registrertIForetaksregisteret: true,
          forretningsadresse: {
            adresse: ['Storgata 1'],
            postnummer: '0155',
            poststed: 'Oslo',
          },
        }),
      }),
    )

    const res = await request(app).get('/api/suppliers/verify/123456789')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.name).toBe('Green Farm AS')
    expect(res.body.isActive).toBe(true)
    expect(res.body.address).toBe('Storgata 1, 0155 Oslo')
  })

  it('flags a company that is in bankruptcy as inactive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          navn: 'Bankrupt Co AS',
          konkurs: true,
          underAvvikling: false,
          underTvangsavviklingEllerTvangsopplosning: false,
          registrertIForetaksregisteret: true,
          forretningsadresse: null,
        }),
      }),
    )

    const res = await request(app).get('/api/suppliers/verify/987654321')

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
    expect(res.body.inBankruptcy).toBe(true)
  })
})
