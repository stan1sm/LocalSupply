import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { verifyBuyerToken, verifySupplierToken } from '../lib/jwt.js'

const chatRouter = Router()

type AuthedLocals = { userId: string; userType: 'buyer' | 'supplier' }

function resolveAuth(authHeader: string | undefined): AuthedLocals | null {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return null
  const buyer = verifyBuyerToken(token)
  if (buyer) return { userId: buyer.userId, userType: 'buyer' }
  const supplier = verifySupplierToken(token)
  if (supplier) return { userId: supplier.supplierId, userType: 'supplier' }
  return null
}

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

export default chatRouter
