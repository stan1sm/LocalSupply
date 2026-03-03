import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateEmailVerificationToken } from '../src/lib/verification.js'

const { findFirstUserMock, updateUserMock } = vi.hoisted(() => ({
  findFirstUserMock: vi.fn(),
  updateUserMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    user: {
      findFirst: findFirstUserMock,
      update: updateUserMock,
    },
  }),
}))

import app from '../src/app.js'

describe('GET /api/auth/verify-email', () => {
  beforeEach(() => {
    findFirstUserMock.mockReset()
    updateUserMock.mockReset()
  })

  it('verifies a valid token and redirects to the email verified page', async () => {
    const verification = generateEmailVerificationToken()
    findFirstUserMock.mockResolvedValue({
      id: 'user_123',
      email: 'ava@example.com',
    })
    updateUserMock.mockResolvedValue({})

    const response = await request(app).get(`/api/auth/verify-email?token=${verification.token}`)

    expect(response.status).toBe(303)
    expect(response.headers.location).toBe('http://localhost:3000/email-verified')
    expect(findFirstUserMock).toHaveBeenCalledWith({
      where: {
        emailVerificationTokenHash: verification.tokenHash,
        emailVerificationExpiresAt: {
          gt: expect.any(Date),
        },
      },
    })
    expect(updateUserMock).toHaveBeenCalledWith({
      where: { id: 'user_123' },
      data: {
        emailVerifiedAt: expect.any(Date),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    })
  })

  it('redirects expired or invalid tokens to the failure state', async () => {
    findFirstUserMock.mockResolvedValue(null)

    const response = await request(app).get('/api/auth/verify-email?token=bad-token')

    expect(response.status).toBe(303)
    expect(response.headers.location).toBe('http://localhost:3000/email-verified?status=invalid')
    expect(findFirstUserMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })
})
