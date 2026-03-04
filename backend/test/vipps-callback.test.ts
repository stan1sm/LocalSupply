import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { findUniqueUserMock, createUserMock, updateUserMock } = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  findUniqueUserMock: vi.fn(),
  updateUserMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    user: {
      create: createUserMock,
      findUnique: findUniqueUserMock,
      update: updateUserMock,
    },
  }),
}))

import app from '../src/app.js'
import { buildVippsOAuthCookie, createVippsOAuthState } from '../src/lib/vipps.js'

describe('GET /api/auth/vipps/callback', () => {
  const originalEnv = {
    BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
    FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL,
    VIPPS_CLIENT_ID: process.env.VIPPS_CLIENT_ID,
    VIPPS_CLIENT_SECRET: process.env.VIPPS_CLIENT_SECRET,
  }

  beforeEach(() => {
    findUniqueUserMock.mockReset()
    createUserMock.mockReset()
    updateUserMock.mockReset()

    process.env.BACKEND_BASE_URL = 'https://localsupply-api.vercel.app'
    process.env.FRONTEND_BASE_URL = 'https://localsupply.vercel.app'
    process.env.VIPPS_CLIENT_ID = 'vipps-client-id'
    process.env.VIPPS_CLIENT_SECRET = 'vipps-client-secret'
  })

  afterEach(() => {
    process.env.BACKEND_BASE_URL = originalEnv.BACKEND_BASE_URL
    process.env.FRONTEND_BASE_URL = originalEnv.FRONTEND_BASE_URL
    process.env.VIPPS_CLIENT_ID = originalEnv.VIPPS_CLIENT_ID
    process.env.VIPPS_CLIENT_SECRET = originalEnv.VIPPS_CLIENT_SECRET
    vi.unstubAllGlobals()
  })

  it('creates a verified user from Vipps user info and redirects to the marketplace dashboard', async () => {
    const oauth = createVippsOAuthState('login')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'vipps-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: 'vipps-sub-123',
          email: 'ava@example.com',
          given_name: 'Ava',
          family_name: 'Johnson',
          phone_number: '+15551234567',
        }),
      })

    vi.stubGlobal('fetch', fetchMock)
    findUniqueUserMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    createUserMock.mockResolvedValue({
      id: 'user_123',
      email: 'ava@example.com',
    })

    const response = await request(app)
      .get(`/api/auth/vipps/callback?code=vipps-code&state=${oauth.state}`)
      .set('Cookie', buildVippsOAuthCookie(oauth.cookieValue))

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('https://localsupply.vercel.app/marketplace/dashboard?authProvider=vipps')
    expect(createUserMock).toHaveBeenCalledWith({
      data: {
        email: 'ava@example.com',
        emailVerified: true,
        firstName: 'Ava',
        lastName: 'Johnson',
        passwordHash: null,
        vippsPhoneNumber: '+15551234567',
        vippsSub: 'vipps-sub-123',
      },
    })
  })
})
