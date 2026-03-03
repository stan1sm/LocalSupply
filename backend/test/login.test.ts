import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../src/lib/password.js'

const { findUniqueUserMock } = vi.hoisted(() => ({
  findUniqueUserMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: findUniqueUserMock,
    },
  }),
}))

import app from '../src/app.js'

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset()
  })

  it('signs in a user with valid credentials', async () => {
    findUniqueUserMock.mockResolvedValue({
      id: 'user_123',
      firstName: 'Ava',
      lastName: 'Johnson',
      email: 'ava@example.com',
      passwordHash: await hashPassword('Abcd!123'),
    })

    const response = await request(app).post('/api/auth/login').send({
      email: 'ava@example.com',
      password: 'Abcd!123',
    })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Signed in successfully.')
    expect(response.body.user.email).toBe('ava@example.com')
    expect(findUniqueUserMock).toHaveBeenCalledWith({
      where: { email: 'ava@example.com' },
    })
  })

  it('rejects invalid credentials with a generic message', async () => {
    findUniqueUserMock.mockResolvedValue({
      id: 'user_123',
      firstName: 'Ava',
      lastName: 'Johnson',
      email: 'ava@example.com',
      passwordHash: await hashPassword('Abcd!123'),
    })

    const response = await request(app).post('/api/auth/login').send({
      email: 'ava@example.com',
      password: 'Abcd!124',
    })

    expect(response.status).toBe(401)
    expect(response.body.message).toBe('Invalid email or password.')
  })

  it('rejects malformed login payloads before hitting the database', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'not-an-email',
      password: 'short',
    })

    expect(response.status).toBe(400)
    expect(response.body.errors.email).toBe('Enter a valid email address.')
    expect(response.body.errors.password).toBe('Password must be at least 8 characters.')
    expect(findUniqueUserMock).not.toHaveBeenCalled()
  })
})
