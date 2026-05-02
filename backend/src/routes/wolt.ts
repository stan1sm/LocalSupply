/**
 * @module routes/wolt
 * Express router for Wolt Drive delivery integration.
 * Handles real-time delivery fee estimation and inbound delivery-status
 * webhooks from Wolt. All routes are mounted under /api/wolt.
 */

import crypto from 'crypto'
import { Router } from 'express'
import { getDeliveryEstimate, parseAddressString, woltStatusToOrderStatus } from '../lib/woltDrive.js'
import { getPrismaClient } from '../lib/prisma.js'

/**
 * Express router providing Wolt Drive delivery endpoints.
 */
const woltRouter = Router()

/**
 * Verify an inbound Wolt webhook request using HMAC-SHA256.
 * In non-production environments the check is skipped when
 * WOLT_WEBHOOK_SECRET is not configured, to ease local development.
 *
 * @param rawBody        - The raw request body Buffer used to compute the HMAC.
 * @param signatureHeader - Value of the `x-wolt-signature` request header.
 * @returns `true` if the signature is valid (or verification is bypassed in dev), `false` otherwise.
 */
function verifyWoltSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.WOLT_WEBHOOK_SECRET
  if (!secret) {
    // In dev, allow unauthenticated webhooks if no secret is configured
    if (process.env.NODE_ENV !== 'production') return true
    console.warn('WOLT_WEBHOOK_SECRET not set — rejecting webhook in production')
    return false
  }
  if (!signatureHeader) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
}

/**
 * Fetch a real-time delivery fee and estimated time of arrival from the
 * Wolt Drive API for a given pickup/dropoff address pair. If no pickupAddress
 * is supplied in the request body, the value of the WOLT_DEFAULT_PICKUP_ADDRESS
 * environment variable is used as a fallback.
 *
 * @route {POST} /estimate
 * @access {public}
 * @param req.body.dropoffAddress - Destination address string (required).
 * @param req.body.pickupAddress  - Origin address string (optional; falls back to WOLT_DEFAULT_PICKUP_ADDRESS).
 */
woltRouter.post('/estimate', async (req, res) => {
  const body = req.body as Record<string, unknown>
  const dropoffAddress = typeof body.dropoffAddress === 'string' ? body.dropoffAddress.trim() : ''
  const pickupAddressRaw = typeof body.pickupAddress === 'string'
    ? body.pickupAddress.trim()
    : (process.env.WOLT_DEFAULT_PICKUP_ADDRESS ?? '')

  if (!dropoffAddress) {
    res.status(400).json({ ok: false, errorCode: 'INVALID_DROPOFF_ADDRESS', message: 'dropoffAddress is required.' })
    return
  }

  const pickup = parseAddressString(pickupAddressRaw || dropoffAddress)
  const dropoff = parseAddressString(dropoffAddress)

  const result = await getDeliveryEstimate({ pickup, dropoff })
  res.json(result)
})

/**
 * Receive delivery status update events pushed by Wolt Drive. The request
 * signature in the `x-wolt-signature` header is verified with HMAC-SHA256
 * before any processing occurs. The handler acknowledges immediately with
 * 200 OK to prevent Wolt timeouts, then asynchronously updates the
 * matching Order record's woltStatus and derived order status in the database.
 *
 * Note: the raw request body must be captured before express.json() runs
 * (see app.ts) so that the HMAC can be computed against the original bytes.
 *
 * @route {POST} /webhook
 * @access {public}
 * @param req.headers['x-wolt-signature'] - HMAC-SHA256 hex digest of the raw body.
 * @param req.body.id                     - Wolt delivery ID used to look up the Order record.
 * @param req.body.status                 - New Wolt delivery status string.
 */
woltRouter.post('/webhook', async (req, res) => {
  const signature = req.headers['x-wolt-signature'] as string | undefined
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body))

  if (!verifyWoltSignature(rawBody, signature)) {
    res.status(401).json({ ok: false, message: 'Invalid signature.' })
    return
  }

  // Acknowledge immediately so Wolt doesn't time out
  res.status(200).json({ ok: true })

  try {
    const body = JSON.parse(rawBody.toString()) as Record<string, unknown>
    const deliveryId = typeof body.id === 'string' ? body.id : null
    const status = typeof body.status === 'string' ? body.status : null

    if (!deliveryId || !status) return

    const prisma = getPrismaClient()
    const order = await prisma.order.findFirst({ where: { woltDeliveryId: deliveryId } })
    if (!order) return

    const orderStatus = woltStatusToOrderStatus(status)
    await prisma.order.update({
      where: { id: order.id },
      data: {
        woltStatus: status,
        ...(orderStatus ? { status: orderStatus } : {}),
      },
    })
  } catch (err) {
    console.error('Wolt webhook error', err)
  }
})

export default woltRouter
