import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const trackingRouter = Router()

// GET /track/:deliveryId
trackingRouter.get('/:deliveryId', async (req, res) => {
  try {
    const prisma = getPrismaClient()
    const delivery = await prisma.delivery.findUnique({ where: { id: req.params.deliveryId } })

    if (!delivery) {
      res.status(404).send('<h1>Delivery not found</h1>')
      return
    }

    if (req.headers.accept?.includes('application/json')) {
      res.json({ id: delivery.id, status: delivery.status, etaMinutes: delivery.etaMinutes, distanceKm: delivery.distanceKm, updatedAt: delivery.updatedAt })
      return
    }

    const statusLabels: Record<string, string> = {
      CREATED: 'Order received — finding a courier',
      PICKED_UP: 'Courier picked up your order — on the way',
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled',
    }
    const label = statusLabels[delivery.status] ?? delivery.status
    const updatedAt = new Date(delivery.updatedAt).toLocaleString('nb-NO')
    const distanceInfo = delivery.distanceKm != null
      ? `${delivery.distanceKm.toFixed(1)} km · ~${delivery.etaMinutes} min`
      : `~${delivery.etaMinutes} min`

    res.setHeader('Content-Type', 'text/html')
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LocalSupply Delivery Tracking</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 24px; color: #111; }
    .badge { display: inline-block; background: #e8f5ec; color: #1a5e30; border-radius: 999px; padding: 6px 16px; font-size: 14px; font-weight: 600; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #555; font-size: 14px; margin: 0; }
    .steps { margin-top: 32px; display: flex; flex-direction: column; gap: 12px; }
    .step { display: flex; gap: 12px; align-items: center; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: #ddd; flex-shrink: 0; }
    .dot.done { background: #2f9f4f; }
    .dot.active { background: #2f9f4f; box-shadow: 0 0 0 4px #c3e6cb; }
  </style>
  <meta http-equiv="refresh" content="60" />
</head>
<body>
  <div class="badge">🛵 LocalSupply Delivery</div>
  <h1>${esc(label)}</h1>
  <p style="margin-top:4px;font-size:13px;color:#2f9f4f;font-weight:600">${esc(distanceInfo)}</p>
  <p>Last updated: ${esc(updatedAt)}</p>
  <div class="steps">
    <div class="step">
      <div class="dot done"></div>
      <span>Order received</span>
    </div>
    <div class="step">
      <div class="dot ${delivery.status === 'PICKED_UP' ? 'active' : delivery.status === 'DELIVERED' ? 'done' : ''}"></div>
      <span>Courier picked up order</span>
    </div>
    <div class="step">
      <div class="dot ${delivery.status === 'DELIVERED' ? 'done' : ''}"></div>
      <span>Delivered</span>
    </div>
  </div>
</body>
</html>`)
  } catch (err) {
    console.error('Tracking page failed', err)
    res.status(503).send('<h1>Tracking unavailable</h1>')
  }
})
