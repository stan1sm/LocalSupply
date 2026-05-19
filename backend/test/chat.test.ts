import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signBuyerToken, signSupplierToken } from '../src/lib/jwt.js'

const {
  findUniqueSupplierMock,
  upsertConversationMock,
  findManyConversationMock,
  findUniqueConversationMock,
  updateConversationMock,
  createMessageMock,
  findManyMessageMock,
} = vi.hoisted(() => ({
  findUniqueSupplierMock: vi.fn(),
  upsertConversationMock: vi.fn(),
  findManyConversationMock: vi.fn(),
  findUniqueConversationMock: vi.fn(),
  updateConversationMock: vi.fn(),
  createMessageMock: vi.fn(),
  findManyMessageMock: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({
  getPrismaClient: () => ({
    supplier: { findUnique: findUniqueSupplierMock },
    conversation: {
      upsert: upsertConversationMock,
      findMany: findManyConversationMock,
      findUnique: findUniqueConversationMock,
      update: updateConversationMock,
    },
    message: {
      create: createMessageMock,
      findMany: findManyMessageMock,
    },
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

const BUYER_ID = 'buyer_1'
const SUPPLIER_ID = 'sup_1'
const buyerToken = signBuyerToken(BUYER_ID)
const supplierToken = signSupplierToken(SUPPLIER_ID)

const sampleConversation = {
  id: 'conv_1',
  buyerId: BUYER_ID,
  supplierId: SUPPLIER_ID,
  updatedAt: new Date().toISOString(),
  buyer: { id: BUYER_ID, firstName: 'Ava', lastName: 'Berg', email: 'ava@example.com' },
  supplier: { id: SUPPLIER_ID, businessName: 'Green Farm AS', email: 'farm@example.com' },
}

const sampleMessage = {
  id: 'msg_1',
  conversationId: 'conv_1',
  senderType: 'buyer',
  senderId: BUYER_ID,
  content: 'Hello!',
  createdAt: new Date().toISOString(),
}

// ── POST /api/chat/conversations ─────────────────────────────────────────────

describe('POST /api/chat/conversations', () => {
  beforeEach(() => {
    findUniqueSupplierMock.mockReset()
    upsertConversationMock.mockReset()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).post('/api/chat/conversations').send({ supplierId: SUPPLIER_ID })
    expect(res.status).toBe(401)
  })

  it('returns 401 when called with a supplier token', async () => {
    const res = await request(app)
      .post('/api/chat/conversations')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ supplierId: SUPPLIER_ID })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Buyer authentication required.')
  })

  it('returns 400 when supplierId is missing', async () => {
    const res = await request(app)
      .post('/api/chat/conversations')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('supplierId is required.')
  })

  it('returns 404 when supplier does not exist', async () => {
    findUniqueSupplierMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/chat/conversations')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: 'nonexistent' })

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Supplier not found.')
  })

  it('returns 200 and upserts conversation on success', async () => {
    findUniqueSupplierMock.mockResolvedValue({ id: SUPPLIER_ID })
    upsertConversationMock.mockResolvedValue(sampleConversation)

    const res = await request(app)
      .post('/api/chat/conversations')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ supplierId: SUPPLIER_ID })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('conv_1')
    expect(res.body.buyer.email).toBe('ava@example.com')
  })
})

// ── GET /api/chat/conversations ───────────────────────────────────────────────

describe('GET /api/chat/conversations', () => {
  beforeEach(() => { findManyConversationMock.mockReset() })

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/chat/conversations')
    expect(res.status).toBe(401)
  })

  it('returns buyer conversations with last message', async () => {
    const convWithMessage = { ...sampleConversation, messages: [{ content: 'Hi', senderType: 'buyer', createdAt: new Date().toISOString() }] }
    findManyConversationMock.mockResolvedValue([convWithMessage])

    const res = await request(app)
      .get('/api/chat/conversations')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('conv_1')
    expect(findManyConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { buyerId: BUYER_ID } }),
    )
  })

  it('returns supplier conversations filtered by supplierId', async () => {
    findManyConversationMock.mockResolvedValue([{ ...sampleConversation, messages: [] }])

    const res = await request(app)
      .get('/api/chat/conversations')
      .set('Authorization', `Bearer ${supplierToken}`)

    expect(res.status).toBe(200)
    expect(findManyConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { supplierId: SUPPLIER_ID } }),
    )
  })

  it('returns empty array when user has no conversations', async () => {
    findManyConversationMock.mockResolvedValue([])

    const res = await request(app)
      .get('/api/chat/conversations')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

// ── GET /api/chat/conversations/:id ──────────────────────────────────────────

describe('GET /api/chat/conversations/:id', () => {
  beforeEach(() => { findUniqueConversationMock.mockReset() })

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/chat/conversations/conv_1')
    expect(res.status).toBe(401)
  })

  it('returns 404 when conversation does not exist', async () => {
    findUniqueConversationMock.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/chat/conversations/nonexistent')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(404)
  })

  it('returns 403 when buyer is not a participant', async () => {
    findUniqueConversationMock.mockResolvedValue({ ...sampleConversation, buyerId: 'other_buyer' })

    const res = await request(app)
      .get('/api/chat/conversations/conv_1')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 403 when supplier is not a participant', async () => {
    findUniqueConversationMock.mockResolvedValue({ ...sampleConversation, supplierId: 'other_supplier' })

    const res = await request(app)
      .get('/api/chat/conversations/conv_1')
      .set('Authorization', `Bearer ${supplierToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 200 for the buyer participant', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)

    const res = await request(app)
      .get('/api/chat/conversations/conv_1')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('conv_1')
  })

  it('returns 200 for the supplier participant', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)

    const res = await request(app)
      .get('/api/chat/conversations/conv_1')
      .set('Authorization', `Bearer ${supplierToken}`)

    expect(res.status).toBe(200)
    expect(res.body.supplierId).toBe(SUPPLIER_ID)
  })
})

// ── POST /api/chat/conversations/:id/messages ─────────────────────────────────

describe('POST /api/chat/conversations/:id/messages', () => {
  beforeEach(() => {
    findUniqueConversationMock.mockReset()
    createMessageMock.mockReset()
    updateConversationMock.mockReset()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .send({ content: 'Hello' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when content is empty', async () => {
    const res = await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ content: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Message content is required.')
  })

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when conversation does not exist', async () => {
    findUniqueConversationMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ content: 'Hello' })

    expect(res.status).toBe(404)
  })

  it('returns 403 when buyer is not a participant', async () => {
    findUniqueConversationMock.mockResolvedValue({ ...sampleConversation, buyerId: 'other_buyer' })

    const res = await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ content: 'Hello' })

    expect(res.status).toBe(403)
  })

  it('returns 201 and creates a message as buyer', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)
    createMessageMock.mockResolvedValue(sampleMessage)
    updateConversationMock.mockResolvedValue(undefined)

    const res = await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ content: 'Hello!' })

    expect(res.status).toBe(201)
    expect(res.body.content).toBe('Hello!')
    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv_1',
          senderType: 'buyer',
          senderId: BUYER_ID,
          content: 'Hello!',
        }),
      }),
    )
  })

  it('returns 201 and creates a message as supplier', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)
    const supplierMsg = { ...sampleMessage, senderType: 'supplier', senderId: SUPPLIER_ID }
    createMessageMock.mockResolvedValue(supplierMsg)
    updateConversationMock.mockResolvedValue(undefined)

    const res = await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({ content: 'Thanks for reaching out!' })

    expect(res.status).toBe(201)
    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderType: 'supplier', senderId: SUPPLIER_ID }),
      }),
    )
  })

  it('refreshes conversation updatedAt after sending a message', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)
    createMessageMock.mockResolvedValue(sampleMessage)
    updateConversationMock.mockResolvedValue(undefined)

    await request(app)
      .post('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ content: 'Ping' })

    expect(updateConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conv_1' } }),
    )
  })
})

// ── GET /api/chat/conversations/:id/messages ──────────────────────────────────

describe('GET /api/chat/conversations/:id/messages', () => {
  beforeEach(() => {
    findUniqueConversationMock.mockReset()
    findManyMessageMock.mockReset()
  })

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/chat/conversations/conv_1/messages')
    expect(res.status).toBe(401)
  })

  it('returns 404 when conversation does not exist', async () => {
    findUniqueConversationMock.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(404)
  })

  it('returns 403 when caller is not a participant', async () => {
    findUniqueConversationMock.mockResolvedValue({ ...sampleConversation, buyerId: 'other_buyer' })

    const res = await request(app)
      .get('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 200 with messages for participant', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)
    findManyMessageMock.mockResolvedValue([sampleMessage])

    const res = await request(app)
      .get('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].content).toBe('Hello!')
  })

  it('filters by ?after= query param', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)
    findManyMessageMock.mockResolvedValue([])

    const after = new Date().toISOString()
    const res = await request(app)
      .get(`/api/chat/conversations/conv_1/messages?after=${encodeURIComponent(after)}`)
      .set('Authorization', `Bearer ${buyerToken}`)

    expect(res.status).toBe(200)
    expect(findManyMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: expect.objectContaining({ gt: expect.any(Date) }) }),
      }),
    )
  })

  it('returns 200 with empty array when conversation has no messages', async () => {
    findUniqueConversationMock.mockResolvedValue(sampleConversation)
    findManyMessageMock.mockResolvedValue([])

    const res = await request(app)
      .get('/api/chat/conversations/conv_1/messages')
      .set('Authorization', `Bearer ${supplierToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})
