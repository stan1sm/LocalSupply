/**
 * @module routes/chat
 * Express router for buyer–supplier messaging. All routes are mounted under /api/chat.
 */

import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { verifyBuyerToken, verifySupplierToken } from '../lib/jwt.js'

/** Express router providing conversation and messaging endpoints for buyers and suppliers. */
const chatRouter = Router()

/**
 * Decoded JWT identity attached to a request after successful authentication.
 * @typedef {Object} AuthedLocals
 * @property {string} userId - The authenticated user's ID (buyerId or supplierId).
 * @property {'buyer' | 'supplier'} userType - Which token type was verified.
 */
type AuthedLocals = { userId: string; userType: 'buyer' | 'supplier' }

/**
 * Extracts and verifies a Bearer JWT from the Authorization header.
 * Tries buyer token first, then supplier token. Returns null when the header is
 * missing, malformed, or the token is invalid for both user types.
 * @param {string | undefined} authHeader - Value of the `Authorization` request header.
 * @returns {AuthedLocals | null} Decoded identity, or null on failure.
 */
function resolveAuth(authHeader: string | undefined): AuthedLocals | null {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return null
  const buyer = verifyBuyerToken(token)
  if (buyer) return { userId: buyer.userId, userType: 'buyer' }
  const supplier = verifySupplierToken(token)
  if (supplier) return { userId: supplier.supplierId, userType: 'supplier' }
  return null
}

/**
 * Creates a new conversation between the authenticated buyer and the specified
 * supplier, or returns the existing one if it already exists (upsert semantics).
 * Only buyers may call this endpoint.
 *
 * @route {POST} /api/chat/conversations
 * @access {authenticated} Buyer JWT required in `Authorization: Bearer <token>`.
 * @param req.body.supplierId {string} ID of the supplier to open a conversation with.
 * @returns {200} Full `Conversation` object including nested buyer and supplier fields.
 * @returns {400} When `supplierId` is missing.
 * @returns {401} When the token is absent or the caller is not a buyer.
 * @returns {404} When the specified supplier does not exist.
 * @returns {503} On unexpected database errors.
 */
// POST /api/chat/conversations — buyer creates or retrieves conversation with a supplier
chatRouter.post('/conversations', async (req, res) => {
  const auth = resolveAuth(req.headers.authorization)
  if (!auth || auth.userType !== 'buyer') {
    res.status(401).json({ message: 'Buyer authentication required.' })
    return
  }

  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : ''
  if (!supplierId) {
    res.status(400).json({ message: 'supplierId is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) {
      res.status(404).json({ message: 'Supplier not found.' })
      return
    }

    const conversation = await prisma.conversation.upsert({
      where: { buyerId_supplierId: { buyerId: auth.userId, supplierId } },
      create: { buyerId: auth.userId, supplierId },
      update: {},
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
        supplier: { select: { id: true, businessName: true, email: true } },
      },
    })

    res.status(200).json(conversation)
  } catch (error) {
    console.error('Failed to create/get conversation', error)
    res.status(503).json({ message: 'Unable to start conversation right now.' })
  }
})

/**
 * Returns all conversations that belong to the authenticated user, ordered by
 * most-recently updated first. Each entry includes the latest message preview
 * (content, senderType, createdAt) alongside the full buyer and supplier details.
 * Both buyers and suppliers may call this endpoint.
 *
 * @route {GET} /api/chat/conversations
 * @access {authenticated} Buyer or supplier JWT required in `Authorization: Bearer <token>`.
 * @returns {200} Array of `Conversation` objects with `messages` (last 1 message) included.
 * @returns {401} When no valid token is provided.
 * @returns {503} On unexpected database errors.
 */
// GET /api/chat/conversations — list all conversations for the authenticated user
chatRouter.get('/conversations', async (req, res) => {
  const auth = resolveAuth(req.headers.authorization)
  if (!auth) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  try {
    const prisma = getPrismaClient()

    const where = auth.userType === 'buyer'
      ? { buyerId: auth.userId }
      : { supplierId: auth.userId }

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
        supplier: { select: { id: true, businessName: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, senderType: true, createdAt: true },
        },
      },
    })

    res.status(200).json(conversations)
  } catch (error) {
    console.error('Failed to list conversations', error)
    res.status(503).json({ message: 'Unable to load conversations right now.' })
  }
})

/**
 * Retrieves a single conversation by its ID. The caller must be one of the two
 * participants (the buyer or the supplier linked to the conversation); all other
 * authenticated users receive a 403 Forbidden response.
 *
 * @route {GET} /api/chat/conversations/:id
 * @access {authenticated} Buyer or supplier JWT required in `Authorization: Bearer <token>`.
 * @param req.params.id {string} The conversation ID.
 * @returns {200} Full `Conversation` object with nested buyer and supplier fields.
 * @returns {400} When the conversation ID param is empty.
 * @returns {401} When no valid token is provided.
 * @returns {403} When the caller is not a participant of this conversation.
 * @returns {404} When no conversation with the given ID exists.
 * @returns {503} On unexpected database errors.
 */
// GET /api/chat/conversations/:id — get single conversation (auth check)
chatRouter.get('/conversations/:id', async (req, res) => {
  const auth = resolveAuth(req.headers.authorization)
  if (!auth) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  const id = String(req.params.id ?? '').trim()
  if (!id) {
    res.status(400).json({ message: 'Conversation id is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
        supplier: { select: { id: true, businessName: true, email: true } },
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found.' })
      return
    }

    const isParticipant = auth.userType === 'buyer'
      ? conversation.buyerId === auth.userId
      : conversation.supplierId === auth.userId

    if (!isParticipant) {
      res.status(403).json({ message: 'Forbidden.' })
      return
    }

    res.status(200).json(conversation)
  } catch (error) {
    console.error('Failed to get conversation', error)
    res.status(503).json({ message: 'Unable to load conversation right now.' })
  }
})

/**
 * Sends a message within an existing conversation. Only participants (buyer or
 * supplier) may post. Message content is trimmed and capped at 4 000 characters.
 * The parent conversation's `updatedAt` timestamp is refreshed so inbox ordering
 * stays correct after every new message.
 *
 * @route {POST} /api/chat/conversations/:id/messages
 * @access {authenticated} Buyer or supplier JWT required in `Authorization: Bearer <token>`.
 * @param req.params.id {string} The conversation ID.
 * @param req.body.content {string} Message text (required, max 4 000 characters after trim).
 * @returns {201} Created `Message` object.
 * @returns {400} When `content` is missing or empty.
 * @returns {401} When no valid token is provided.
 * @returns {403} When the caller is not a participant of this conversation.
 * @returns {404} When the conversation does not exist.
 * @returns {503} On unexpected database errors.
 */
// POST /api/chat/conversations/:id/messages — send a message
chatRouter.post('/conversations/:id/messages', async (req, res) => {
  const auth = resolveAuth(req.headers.authorization)
  if (!auth) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  const id = String(req.params.id ?? '').trim()
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  const content = typeof body.content === 'string' ? body.content.trim() : ''

  if (!content) {
    res.status(400).json({ message: 'Message content is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const conversation = await prisma.conversation.findUnique({ where: { id } })

    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found.' })
      return
    }

    const isParticipant = auth.userType === 'buyer'
      ? conversation.buyerId === auth.userId
      : conversation.supplierId === auth.userId

    if (!isParticipant) {
      res.status(403).json({ message: 'Forbidden.' })
      return
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderType: auth.userType,
        senderId: auth.userId,
        content: content.slice(0, 4000),
      },
    })

    // Keep updatedAt fresh so inbox sorts correctly
    await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } })

    res.status(201).json(message)
  } catch (error) {
    console.error('Failed to send message', error)
    res.status(503).json({ message: 'Unable to send message right now.' })
  }
})

/**
 * Retrieves messages for a conversation, with optional long-poll filtering via the
 * `after` query parameter. Returns up to 200 messages in chronological order.
 * Only conversation participants may access messages.
 *
 * @route {GET} /api/chat/conversations/:id/messages
 * @access {authenticated} Buyer or supplier JWT required in `Authorization: Bearer <token>`.
 * @param req.params.id {string} The conversation ID.
 * @param req.query.after {string} [optional] ISO 8601 timestamp; when provided only
 *   messages created strictly after this date are returned (supports polling).
 * @returns {200} Array of up to 200 `Message` objects ordered by `createdAt` ascending.
 * @returns {401} When no valid token is provided.
 * @returns {403} When the caller is not a participant of this conversation.
 * @returns {404} When the conversation does not exist.
 * @returns {503} On unexpected database errors.
 */
// GET /api/chat/conversations/:id/messages — poll for messages, optional ?after=<ISO>
chatRouter.get('/conversations/:id/messages', async (req, res) => {
  const auth = resolveAuth(req.headers.authorization)
  if (!auth) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  const id = String(req.params.id ?? '').trim()
  const afterParam = typeof req.query.after === 'string' ? req.query.after : ''
  const after = afterParam ? new Date(afterParam) : null

  try {
    const prisma = getPrismaClient()

    const [conversation, messages] = await Promise.all([
      prisma.conversation.findUnique({ where: { id } }),
      prisma.message.findMany({
        where: {
          conversationId: id,
          ...(after && !Number.isNaN(after.getTime()) ? { createdAt: { gt: after } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    ])

    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found.' })
      return
    }

    const isParticipant = auth.userType === 'buyer'
      ? conversation.buyerId === auth.userId
      : conversation.supplierId === auth.userId

    if (!isParticipant) {
      res.status(403).json({ message: 'Forbidden.' })
      return
    }

    res.status(200).json(messages)
  } catch (error) {
    console.error('Failed to fetch messages', error)
    res.status(503).json({ message: 'Unable to load messages right now.' })
  }
})

export default chatRouter
