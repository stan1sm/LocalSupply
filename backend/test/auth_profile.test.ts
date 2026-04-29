import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signBuyerToken } from '../src/lib/jwt.js'
import { hashPassword } from '../src/lib/password.js'
import { generatePasswordResetToken } from '../src/lib/verification.js'

const {
  findUniqueUserMock,
  updateUserMock,
  deleteUserMock,
} = vi.hoisted(() => ({
  findUniqueUserMock: vi.fn(),
  updateUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: findUniqueUserMock,
      update: updateUserMock,
      delete: deleteUserMock,
    },
  }),
}))

vi.mock('../src/lib/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendUserVerificationEmail: vi.fn().mockResolvedValue({ mode: 'email' }),
  buildEmailVerifiedRedirectUrl: vi.fn((status = 'success') =>
    `http://localhost:3000/email-verified${status !== 'success' ? `?status=${status}` : ''}`
  ),
  sendBuyerOrderStatusEmail: vi.fn().mockResolvedValue(undefined),
  sendSupplierOrderEmail: vi.fn().mockResolvedValue(undefined),
  sendSupplierVerificationApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendSupplierVerificationRejectedEmail: vi.fn().mockResolvedValue(undefined),
}))

import app from '../src/app.js'

const BUYER_ID = 'user_abc'
const buyerToken = signBuyerToken(BUYER_ID)
const authHeader = `Bearer ${buyerToken}`

const sampleUser = {
  id: BUYER_ID,
  firstName: 'Ava',
  lastName: 'Johnson',
  email: 'ava@example.com',
  emailVerified: true,
  accountType: 'INDIVIDUAL',
  passwordHash: null as string | null,
  passwordResetTokenHash: null as string | null,
  passwordResetTokenExpiresAt: null as Date | null,
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  beforeEach(() => { findUniqueUserMock.mockReset() })

  it('returns the authenticated user profile', async () => {
    findUniqueUserMock.mockResolvedValue(sampleUser)

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authHeader)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('ava@example.com')
    expect(res.body.firstName).toBe('Ava')
    expect(res.body.accountType).toBe('INDIVIDUAL')
    expect(res.body.passwordHash).toBeUndefined()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(findUniqueUserMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the user no longer exists in the database', async () => {
    findUniqueUserMock.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authHeader)

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('User not found.')
  })
})

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────

describe('PATCH /api/auth/profile', () => {
  beforeEach(() => { updateUserMock.mockReset() })

  it('updates first and last name', async () => {
    updateUserMock.mockResolvedValue({ ...sampleUser, firstName: 'Bianca', lastName: 'Smith' })

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', authHeader)
      .send({ firstName: 'Bianca', lastName: 'Smith' })

    expect(res.status).toBe(200)
    expect(res.body.firstName).toBe('Bianca')
    expect(res.body.lastName).toBe('Smith')
    expect(updateUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: BUYER_ID } }),
    )
  })

  it('returns 400 when firstName is an empty string', async () => {
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', authHeader)
      .send({ firstName: '' })

    expect(res.status).toBe(400)
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('returns 400 when lastName is an empty string', async () => {
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', authHeader)
      .send({ lastName: '' })

    expect(res.status).toBe(400)
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).patch('/api/auth/profile').send({ firstName: 'X' })
    expect(res.status).toBe(401)
  })
})

// ── PATCH /api/auth/password ──────────────────────────────────────────────────

describe('PATCH /api/auth/password', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset()
    updateUserMock.mockReset()
  })

  it('changes the password when currentPassword is correct', async () => {
    findUniqueUserMock.mockResolvedValue({
      ...sampleUser,
      passwordHash: await hashPassword('OldPass!123'),
    })
    updateUserMock.mockResolvedValue(sampleUser)

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', authHeader)
      .send({ currentPassword: 'OldPass!123', newPassword: 'NewPass!123' })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Password updated.')
    expect(updateUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: BUYER_ID } }),
    )
  })

  it('returns 401 when currentPassword is wrong', async () => {
    findUniqueUserMock.mockResolvedValue({
      ...sampleUser,
      passwordHash: await hashPassword('OldPass!123'),
    })

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', authHeader)
      .send({ currentPassword: 'WrongPass!9', newPassword: 'NewPass!123' })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Current password is incorrect.')
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('returns 400 when newPassword is too short', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', authHeader)
      .send({ currentPassword: 'OldPass!123', newPassword: 'short' })

    expect(res.status).toBe(400)
    expect(findUniqueUserMock).not.toHaveBeenCalled()
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', authHeader)
      .send({})

    expect(res.status).toBe(400)
    expect(findUniqueUserMock).not.toHaveBeenCalled()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: 'x', newPassword: 'y' })

    expect(res.status).toBe(401)
  })
})

// ── POST /api/auth/forgot-password ───────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset()
    updateUserMock.mockReset()
  })

  it('always returns 200 regardless of whether the email exists', async () => {
    findUniqueUserMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' })

    expect(res.status).toBe(200)
    expect(res.body.message).toContain('password reset link')
  })

  it('returns 200 and sends an email for a verified account', async () => {
    findUniqueUserMock.mockResolvedValue({ ...sampleUser, emailVerified: true })
    updateUserMock.mockResolvedValue(sampleUser)

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ava@example.com' })

    expect(res.status).toBe(200)
  })

  it('returns 200 even when email field is absent', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({})

    expect(res.status).toBe(200)
  })
})

// ── POST /api/auth/reset-password ────────────────────────────────────────────

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset()
    updateUserMock.mockReset()
  })

  it('resets the password for a valid unexpired token', async () => {
    const { token, tokenHash } = generatePasswordResetToken()
    findUniqueUserMock.mockResolvedValue({
      ...sampleUser,
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: new Date(Date.now() + 3_600_000),
    })
    updateUserMock.mockResolvedValue(sampleUser)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPass!123' })

    expect(res.status).toBe(200)
    expect(res.body.message).toContain('Password updated')
    expect(updateUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordResetTokenHash: null,
          passwordResetTokenExpiresAt: null,
        }),
      }),
    )
  })

  it('returns 400 for an invalid token format', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'bad-token', password: 'NewPass!123' })

    expect(res.status).toBe(400)
    expect(findUniqueUserMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the token has expired', async () => {
    const { token } = generatePasswordResetToken()
    findUniqueUserMock.mockResolvedValue({
      ...sampleUser,
      passwordResetTokenHash: 'some-hash',
      passwordResetTokenExpiresAt: new Date(Date.now() - 3_600_000),
    })

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPass!123' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid or expired reset link.')
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the password is too short', async () => {
    const { token } = generatePasswordResetToken()

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'short' })

    expect(res.status).toBe(400)
    expect(findUniqueUserMock).not.toHaveBeenCalled()
  })

  it('returns 400 when no user matches the token', async () => {
    const { token } = generatePasswordResetToken()
    findUniqueUserMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPass!123' })

    expect(res.status).toBe(400)
    expect(updateUserMock).not.toHaveBeenCalled()
  })
})

// ── DELETE /api/auth/account ──────────────────────────────────────────────────

describe('DELETE /api/auth/account', () => {
  beforeEach(() => { deleteUserMock.mockReset() })

  it('deletes the authenticated buyer account', async () => {
    deleteUserMock.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', authHeader)

    expect(res.status).toBe(204)
    expect(deleteUserMock).toHaveBeenCalledWith({ where: { id: BUYER_ID } })
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).delete('/api/auth/account')
    expect(res.status).toBe(401)
    expect(deleteUserMock).not.toHaveBeenCalled()
  })
})
