import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createUserMock } = vi.hoisted(() => ({
  createUserMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    user: {
      create: createUserMock,
    },
  }),
}))

import app from '../src/app.js'

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    createUserMock.mockReset()
  })

  it('creates a user and stores a hashed password', async () => {
    createUserMock.mockResolvedValue({
      id: 'user_123',
      firstName: 'Ava',
      lastName: 'Johnson',
      email: 'ava@example.com',
      passwordHash: 'scrypt$abc$def',
      createdAt: new Date('2026-02-24T00:00:00.000Z'),
    })

    const response = await request(app).post('/api/auth/register').send({
      firstName: 'Ava',
      lastName: 'Johnson',
      email: 'ava@example.com',
      password: 'Abcd!123',
      confirmPassword: 'Abcd!123',
      termsAccepted: true,
    })

    expect(response.status).toBe(201)
    expect(response.body.user.email).toBe('ava@example.com')

    expect(createUserMock).toHaveBeenCalledTimes(1)
    const createArgs = createUserMock.mock.calls[0]?.[0]
    expect(createArgs.data.passwordHash).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/)
    expect(createArgs.data.passwordHash).not.toBe('Abcd!123')
  })

  it('rejects duplicate emails', async () => {
    createUserMock.mockRejectedValue({ code: 'P2002' })

    const response = await request(app).post('/api/auth/register').send({
      firstName: 'Ava',
      lastName: 'Johnson',
      email: 'ava@example.com',
      password: 'Abcd!123',
      confirmPassword: 'Abcd!123',
      termsAccepted: true,
    })

    expect(response.status).toBe(409)
    expect(response.body.errors.email).toBe('An account with this email already exists.')
  })

  it('rejects weak passwords before hitting the database', async () => {
    const response = await request(app).post('/api/auth/register').send({
      firstName: 'Ava',
      lastName: 'Johnson',
      email: 'ava@example.com',
      password: 'abcd1234',
      confirmPassword: 'abcd1234',
      termsAccepted: true,
    })

    expect(response.status).toBe(400)
    expect(response.body.errors.password).toBe('Password must include an uppercase letter.')
    expect(createUserMock).not.toHaveBeenCalled()
  })
})
