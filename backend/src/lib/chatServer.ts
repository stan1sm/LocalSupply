/**
 * @module chatServer
 * Attaches a WebSocket server to an HTTP server for real-time buyer–supplier messaging.
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { verifyBuyerToken, verifySupplierToken } from './jwt.js'
import { getPrismaClient } from './prisma.js'

/**
 * Internal metadata stored for each connected WebSocket client.
 * @property {WebSocket} ws - The raw WebSocket connection.
 * @property {string} userId - The authenticated user's ID (buyer ID or supplier ID).
 * @property {'buyer' | 'supplier'} userType - Whether the client authenticated as a buyer or supplier.
 * @property {Set<string>} conversations - Set of conversation IDs the client has joined.
 */
type ClientMeta = {
  ws: WebSocket
  userId: string
  userType: 'buyer' | 'supplier'
  conversations: Set<string>
}

// conversationId → set of clientIds in that room
const rooms = new Map<string, Set<string>>()
// clientId → client meta
const clients = new Map<string, ClientMeta>()
let nextId = 0

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function broadcast(conversationId: string, payload: unknown) {
  const room = rooms.get(conversationId)
  if (!room) return
  for (const cid of room) {
    const c = clients.get(cid)
    if (c) send(c.ws, payload)
  }
}

/**
 * Attaches a WebSocket chat server to an existing HTTP server, handling auth, room joining, and message broadcasting.
 * @param {Server} server - The Node.js HTTP server instance to attach the WebSocket server to.
 * @returns {void}
 */
export function attachChatServer(server: Server) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    const clientId = String(++nextId)
    let meta: ClientMeta | null = null

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>

        // ── auth ────────────────────────────────────────────────────────
        if (msg.type === 'auth') {
          const token = typeof msg.token === 'string' ? msg.token : ''
          const buyerPayload = verifyBuyerToken(token)
          if (buyerPayload) {
            meta = { ws, userId: buyerPayload.userId, userType: 'buyer', conversations: new Set() }
          } else {
            const supplierPayload = verifySupplierToken(token)
            if (supplierPayload) {
              meta = { ws, userId: supplierPayload.supplierId, userType: 'supplier', conversations: new Set() }
            }
          }
          if (!meta) {
            send(ws, { type: 'error', message: 'Invalid token.' })
            return
          }
          clients.set(clientId, meta)
          send(ws, { type: 'authed', userType: meta.userType, userId: meta.userId })
          return
        }

        if (!meta) {
          send(ws, { type: 'error', message: 'Not authenticated.' })
          return
        }

        // ── join ─────────────────────────────────────────────────────────
        if (msg.type === 'join') {
          const conversationId = typeof msg.conversationId === 'string' ? msg.conversationId : ''
          if (!conversationId) return

          const prisma = getPrismaClient()
          const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } })
          if (!conversation) {
            send(ws, { type: 'error', message: 'Conversation not found.' })
            return
          }

          const allowed = meta.userType === 'buyer'
            ? conversation.buyerId === meta.userId
            : conversation.supplierId === meta.userId

          if (!allowed) {
            send(ws, { type: 'error', message: 'Not a participant in this conversation.' })
            return
          }

          meta.conversations.add(conversationId)
          if (!rooms.has(conversationId)) rooms.set(conversationId, new Set())
          rooms.get(conversationId)!.add(clientId)

          const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: 200,
          })
          send(ws, { type: 'history', conversationId, messages })
          return
        }

        // ── send ─────────────────────────────────────────────────────────
        if (msg.type === 'send') {
          const conversationId = typeof msg.conversationId === 'string' ? msg.conversationId : ''
          const content = typeof msg.content === 'string' ? msg.content.trim() : ''

          if (!conversationId || !content) return

          if (!meta.conversations.has(conversationId)) {
            send(ws, { type: 'error', message: 'Not joined this conversation.' })
            return
          }

          const prisma = getPrismaClient()
          const message = await prisma.message.create({
            data: {
              conversationId,
              senderType: meta.userType,
              senderId: meta.userId,
              content: content.slice(0, 4000),
            },
          })

          broadcast(conversationId, { type: 'message', message })
          return
        }
      } catch (err) {
        console.error('WS handler error', err)
      }
    })

    ws.on('close', () => {
      if (meta) {
        for (const convId of meta.conversations) {
          rooms.get(convId)?.delete(clientId)
        }
      }
      clients.delete(clientId)
    })
  })
}
