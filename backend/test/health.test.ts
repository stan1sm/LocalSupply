import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: { supplier: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('../src/lib/email.js', () => ({
  sendVerificationApproved: vi.fn(),
  sendVerificationRejected: vi.fn(),
}))

import app from '../src/app.js'

describe('GET /', () => {
  it('returns service health status', async () => {
    const response = await request(app).get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})
