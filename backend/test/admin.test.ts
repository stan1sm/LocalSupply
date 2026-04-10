import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app.js'

// Mock Prisma so tests don't need a real database
vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    supplier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Mock email so tests don't try to open SMTP connections
vi.mock('../src/lib/email.js', () => ({
  sendVerificationApproved: vi.fn(),
  sendVerificationRejected: vi.fn(),
}))

import { prisma } from '../src/lib/prisma.js'

const SECRET = 'test-admin-secret'

beforeEach(() => {
  process.env['ADMIN_SECRET'] = SECRET
  vi.clearAllMocks()
})

describe('Admin auth middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/admin/suppliers')
    expect(res.status).toBe(401)
  })

  it('returns 403 when secret is wrong', async () => {
    const res = await request(app).get('/admin/suppliers').set('Authorization', 'Bearer wrong')
    expect(res.status).toBe(403)
  })

  it('returns 503 when ADMIN_SECRET is not set', async () => {
    delete process.env['ADMIN_SECRET']
    const res = await request(app).get('/admin/suppliers').set('Authorization', `Bearer ${SECRET}`)
    expect(res.status).toBe(503)
  })
})

describe('GET /admin/suppliers', () => {
  it('returns supplier list', async () => {
    const mockSuppliers = [
      {
        id: 'sup1',
        businessName: 'Farm Co',
        contactName: 'Alice',
        email: 'alice@farm.co',
        phoneNumber: '555-0100',
        address: '1 Farm Rd',
        verificationStatus: 'PENDING',
        verificationRejectedReason: null,
        createdAt: new Date().toISOString(),
      },
    ]
    vi.mocked(prisma.supplier.findMany).mockResolvedValue(mockSuppliers as never)

    const res = await request(app).get('/admin/suppliers').set('Authorization', `Bearer ${SECRET}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].businessName).toBe('Farm Co')
  })
})

describe('POST /admin/suppliers/:id/approve', () => {
  it('approves a supplier and returns updated record', async () => {
    const mockSupplier = { id: 'sup1', businessName: 'Farm Co', email: 'alice@farm.co' }
    vi.mocked(prisma.supplier.findUnique).mockResolvedValue(mockSupplier as never)
    vi.mocked(prisma.supplier.update).mockResolvedValue({
      ...mockSupplier,
      verificationStatus: 'VERIFIED',
    } as never)

    const res = await request(app).post('/admin/suppliers/sup1/approve').set('Authorization', `Bearer ${SECRET}`)

    expect(res.status).toBe(200)
    expect(res.body.verificationStatus).toBe('VERIFIED')
  })

  it('returns 404 for unknown supplier', async () => {
    vi.mocked(prisma.supplier.findUnique).mockResolvedValue(null)
    const res = await request(app).post('/admin/suppliers/unknown/approve').set('Authorization', `Bearer ${SECRET}`)
    expect(res.status).toBe(404)
  })
})

describe('POST /admin/suppliers/:id/reject', () => {
  it('rejects a supplier with a reason', async () => {
    const mockSupplier = { id: 'sup1', businessName: 'Farm Co', email: 'alice@farm.co' }
    vi.mocked(prisma.supplier.findUnique).mockResolvedValue(mockSupplier as never)
    vi.mocked(prisma.supplier.update).mockResolvedValue({
      ...mockSupplier,
      verificationStatus: 'REJECTED',
      verificationRejectedReason: 'Incomplete docs',
    } as never)

    const res = await request(app)
      .post('/admin/suppliers/sup1/reject')
      .set('Authorization', `Bearer ${SECRET}`)
      .send({ reason: 'Incomplete docs' })

    expect(res.status).toBe(200)
    expect(res.body.verificationStatus).toBe('REJECTED')
    expect(res.body.verificationRejectedReason).toBe('Incomplete docs')
  })

  it('returns 400 when reason is missing', async () => {
    const res = await request(app)
      .post('/admin/suppliers/sup1/reject')
      .set('Authorization', `Bearer ${SECRET}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown supplier', async () => {
    vi.mocked(prisma.supplier.findUnique).mockResolvedValue(null)
    const res = await request(app)
      .post('/admin/suppliers/sup1/reject')
      .set('Authorization', `Bearer ${SECRET}`)
      .send({ reason: 'Bad actor' })

    expect(res.status).toBe(404)
  })
})
