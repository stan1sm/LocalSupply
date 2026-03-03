import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findUniqueUserMock, updateUserMock, sendUserVerificationEmailMock } = vi.hoisted(() => ({
  findUniqueUserMock: vi.fn(),
  updateUserMock: vi.fn(),
  sendUserVerificationEmailMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: findUniqueUserMock,
      update: updateUserMock,
    },
  }),
}))

vi.mock('../src/lib/email.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/email.js')>('../src/lib/email.js')
  return {
    ...actual,
    sendUserVerificationEmail: sendUserVerificationEmailMock,
  }
})

import app from '../src/app.js'

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset()
    updateUserMock.mockReset()
    sendUserVerificationEmailMock.mockReset()
  })

  it('resends a verification email for unverified users', async () => {
    findUniqueUserMock.mockResolvedValue({
      id: 'user_123',
      firstName: 'Ava',
      email: 'ava@example.com',
      emailVerified: false,
    })
    updateUserMock.mockResolvedValue({
      id: 'user_123',
      firstName: 'Ava',
      email: 'ava@example.com',
    })
    sendUserVerificationEmailMock.mockResolvedValue({ mode: 'email' })

    const response = await request(app).post('/api/auth/resend-verification').send({
      email: 'ava@example.com',
    })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('If an unverified account exists for this email, a verification email has been sent.')
    expect(updateUserMock).toHaveBeenCalledWith({
      where: { id: 'user_123' },
      data: {
        emailVerificationTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    })
    expect(sendUserVerificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ava@example.com',
        firstName: 'Ava',
        verificationToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
  })

  it('returns a fallback verification preview url when delivery falls back', async () => {
    findUniqueUserMock.mockResolvedValue({
      id: 'user_123',
      firstName: 'Ava',
      email: 'ava@example.com',
      emailVerified: false,
    })
    updateUserMock.mockResolvedValue({
      id: 'user_123',
      firstName: 'Ava',
      email: 'ava@example.com',
    })
    sendUserVerificationEmailMock.mockResolvedValue({
      mode: 'fallback',
      verificationUrl: 'https://localsupply-api.vercel.app/api/auth/verify-email?token=preview',
    })

    const response = await request(app).post('/api/auth/resend-verification').send({
      email: 'ava@example.com',
    })

    expect(response.status).toBe(200)
    expect(response.body.deliveryMode).toBe('fallback')
    expect(response.body.verificationPreviewUrl).toBe('https://localsupply-api.vercel.app/api/auth/verify-email?token=preview')
  })
})
