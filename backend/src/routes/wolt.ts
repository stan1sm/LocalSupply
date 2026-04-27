import crypto from 'crypto'
import { Router } from 'express'
import { getDeliveryEstimate, parseAddressString, woltStatusToOrderStatus } from '../lib/woltDrive.js'
import { getPrismaClient } from '../lib/prisma.js'

const woltRouter = Router()

/**
 * Verifies the HMAC-SHA256 signature on a Wolt webhook request.
 * In non-production environments the check is skipped when `WOLT_WEBHOOK_SECRET` is unset.
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

// POST /api/wolt/estimate — real-time delivery fee + ETA from Wolt
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

// POST /api/wolt/webhook — delivery status updates pushed by Wolt
// Raw body is captured in app.ts before express.json() for HMAC verification
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
