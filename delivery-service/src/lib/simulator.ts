import { getPrismaClient } from './prisma.js'
import { signPayload } from './hmac.js'

// Scale factor for demo — 1 real minute represents this many simulated delivery minutes.
// Default: 1 (real-time). Set DELIVERY_TIME_SCALE=10 to make a 30-min delivery finish in 3 real minutes.
const TIME_SCALE = Number(process.env.DELIVERY_TIME_SCALE ?? 1)

function scaledMs(minutes: number): number {
  return (minutes / TIME_SCALE) * 60 * 1000
}

async function postWebhook(deliveryId: string, status: string): Promise<void> {
  const webhookUrl = process.env.LOCALSUPPLY_WEBHOOK_URL
  if (!webhookUrl) return

  const body = JSON.stringify({ id: deliveryId, status })
  const signature = signPayload(body)

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wolt-signature': signature },
      body,
    })
  } catch (err) {
    console.error('Webhook dispatch failed', err)
  }
}

async function advanceStatus(deliveryId: string, status: string): Promise<void> {
  const prisma = getPrismaClient()
  const data: Record<string, unknown> = { status }
  if (status === 'PICKED_UP') data.pickupAt = new Date()
  if (status === 'DELIVERED') data.deliveredAt = new Date()
  await prisma.delivery.update({ where: { id: deliveryId }, data })
  await postWebhook(deliveryId, status)
}

// Used locally (dev). On Vercel, the cron route handles advancement instead.
export function simulateDelivery(deliveryId: string, etaMinutes: number): void {
  // Courier picks up at ~30% of total ETA, delivers at 100%
  const pickupDelayMs = scaledMs(etaMinutes * 0.3)
  const deliverDelayMs = scaledMs(etaMinutes)

  setTimeout(async () => {
    try { await advanceStatus(deliveryId, 'PICKED_UP') } catch (e) { console.error(e) }
  }, pickupDelayMs)

  setTimeout(async () => {
    try { await advanceStatus(deliveryId, 'DELIVERED') } catch (e) { console.error(e) }
  }, deliverDelayMs)
}

// Called by the cron route every minute on Vercel.
export async function advancePendingDeliveries(): Promise<void> {
  const prisma = getPrismaClient()
  const now = new Date()

  // Find CREATED deliveries whose pickup time (30% of ETA) has passed
  const created = await prisma.delivery.findMany({ where: { status: 'CREATED' } })
  for (const d of created) {
    const pickupMs = scaledMs(d.etaMinutes * 0.3)
    if (now.getTime() - d.createdAt.getTime() >= pickupMs) {
      await advanceStatus(d.id, 'PICKED_UP').catch(console.error)
    }
  }

  // Find PICKED_UP deliveries whose remaining delivery time has passed
  const pickedUp = await prisma.delivery.findMany({ where: { status: 'PICKED_UP' } })
  for (const d of pickedUp) {
    if (!d.pickupAt) continue
    const remainingMs = scaledMs(d.etaMinutes * 0.7)
    if (now.getTime() - d.pickupAt.getTime() >= remainingMs) {
      await advanceStatus(d.id, 'DELIVERED').catch(console.error)
    }
  }
}
