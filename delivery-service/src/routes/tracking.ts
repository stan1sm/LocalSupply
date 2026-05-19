import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const trackingRouter = Router()

const APP_URL = (process.env.LOCALSUPPLY_APP_URL ?? '').replace(/\/$/, '')

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
      res.json({
        id: delivery.id,
        status: delivery.status,
        etaMinutes: delivery.etaMinutes,
        distanceKm: delivery.distanceKm,
        updatedAt: delivery.updatedAt,
        pickupAddress: `${delivery.pickupStreet}, ${delivery.pickupCity}`,
        dropoffAddress: `${delivery.dropoffStreet}, ${delivery.dropoffCity}`,
      })
      return
    }

    const isCancelled = delivery.status === 'CANCELLED'
    const isDelivered = delivery.status === 'DELIVERED'
    const isPickedUp = delivery.status === 'PICKED_UP'

    const statusConfig: Record<string, { label: string; sub: string; icon: string }> = {
      CREATED:    { label: 'Finding a courier',       sub: 'Your order has been received and is being prepared', icon: '📦' },
      PICKED_UP:  { label: 'On the way',               sub: 'A courier has picked up your order',                icon: '🛵' },
      DELIVERED:  { label: 'Delivered',                sub: 'Your order has been delivered',                     icon: '✅' },
      CANCELLED:  { label: 'Delivery cancelled',       sub: 'This delivery was cancelled',                       icon: '✕'  },
    }
    const s = statusConfig[delivery.status] ?? { label: delivery.status, sub: '', icon: '📦' }

    const distanceInfo = delivery.distanceKm != null
      ? `${delivery.distanceKm.toFixed(1)} km · ~${delivery.etaMinutes} min`
      : `~${delivery.etaMinutes} min`

    const updatedAt = new Date(delivery.updatedAt).toLocaleString('nb-NO', { hour: '2-digit', minute: '2-digit' })

    const step = (done: boolean, active: boolean, label: string, time: Date | null) => {
      const cls = done ? 'done' : active ? 'active' : ''
      const timeStr = time ? new Date(time).toLocaleString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : ''
      return `
        <div class="step ${cls}">
          <div class="step-icon">
            <div class="step-dot">
              ${done ? '<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
            </div>
            <div class="step-line"></div>
          </div>
          <div class="step-content">
            <span class="step-label">${esc(label)}</span>
            ${timeStr ? `<span class="step-time">${esc(timeStr)}</span>` : ''}
          </div>
        </div>`
    }

    const ordersHref = APP_URL ? `${APP_URL}/orders` : '#'

    res.setHeader('Content-Type', 'text/html')
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LocalSupply · Delivery Tracking</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { background: #f7f9f7; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100svh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 16px 40px;
      color: #111;
    }

    .topbar {
      width: 100%;
      max-width: 480px;
      display: flex;
      align-items: center;
      padding: 20px 0 0;
      gap: 10px;
    }
    .back-link {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #555;
      text-decoration: none;
      padding: 6px 10px 6px 6px;
      border-radius: 8px;
      transition: background 0.15s;
      margin-left: -6px;
    }
    .back-link:hover { background: #e8f5ec; color: #1a5e30; }
    .logo {
      margin-left: auto;
      font-size: 13px;
      font-weight: 700;
      color: #2f9f4f;
      letter-spacing: -0.2px;
    }

    .card {
      width: 100%;
      max-width: 480px;
      background: #fff;
      border-radius: 16px;
      border: 1px solid #e4ede6;
      padding: 28px 24px;
      margin-top: 20px;
    }

    .status-icon { font-size: 32px; margin-bottom: 12px; line-height: 1; }
    .status-label { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; color: #0d1f14; }
    .status-sub { margin-top: 4px; font-size: 14px; color: #666; }

    .meta {
      display: flex;
      gap: 16px;
      margin-top: 16px;
      padding: 12px 14px;
      background: #f4faf5;
      border-radius: 10px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-key { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600; }
    .meta-val { font-size: 14px; font-weight: 600; color: #1a5e30; }

    .divider { height: 1px; background: #eef2ee; margin: 24px 0; }

    .steps { display: flex; flex-direction: column; }
    .step { display: flex; gap: 14px; align-items: stretch; }
    .step-icon { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
    .step-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid #d8e8dc;
      background: #fff;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .step.done .step-dot { background: #2f9f4f; border-color: #2f9f4f; }
    .step.active .step-dot { background: #2f9f4f; border-color: #2f9f4f; box-shadow: 0 0 0 5px #d4eddb; }
    .step-line { flex: 1; width: 2px; background: #e4ede6; margin: 4px auto; min-height: 20px; }
    .step.done .step-line { background: #2f9f4f; }
    .step:last-child .step-line { display: none; }
    .step-content {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      flex: 1;
      padding-bottom: 20px;
    }
    .step:last-child .step-content { padding-bottom: 0; }
    .step-label { font-size: 14px; font-weight: 500; color: #888; padding-top: 1px; }
    .step.done .step-label, .step.active .step-label { color: #111; font-weight: 600; }
    .step-time { font-size: 12px; color: #aaa; }
    .step.done .step-time { color: #2f9f4f; }

    .footer { width: 100%; max-width: 480px; margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
    .btn-orders {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #2f9f4f;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 20px;
      border-radius: 12px;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn-orders:hover { background: #26883f; }
    .refresh-note { text-align: center; font-size: 12px; color: #aaa; }
  </style>
  <meta http-equiv="refresh" content="30" />
</head>
<body>
  <div class="topbar">
    <a class="back-link" href="${esc(ordersHref)}">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="#555" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Orders
    </a>
    <span class="logo">LOCALSUPPLY</span>
  </div>

  <div class="card">
    <div class="status-icon">${s.icon}</div>
    <div class="status-label">${esc(s.label)}</div>
    <div class="status-sub">${esc(s.sub)}</div>

    <div class="meta">
      <div class="meta-item">
        <span class="meta-key">Estimated</span>
        <span class="meta-val">${esc(distanceInfo)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">Updated</span>
        <span class="meta-val">${esc(updatedAt)}</span>
      </div>
    </div>

    ${!isCancelled ? `
    <div class="divider"></div>
    <div class="steps">
      ${step(true, false, 'Order received', delivery.createdAt)}
      ${step(isPickedUp || isDelivered, isPickedUp, 'Courier picked up order', delivery.pickupAt)}
      ${step(isDelivered, false, 'Delivered', delivery.deliveredAt)}
    </div>` : ''}
  </div>

  <div class="footer">
    <a class="btn-orders" href="${esc(ordersHref)}">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h10" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>
      Back to your orders
    </a>
    <span class="refresh-note">Page refreshes automatically every 30 seconds</span>
  </div>
</body>
</html>`)
  } catch (err) {
    console.error('Tracking page failed', err)
    res.status(503).send('<h1>Tracking unavailable</h1>')
  }
})
