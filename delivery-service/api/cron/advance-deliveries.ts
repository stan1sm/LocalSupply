import type { VercelRequest, VercelResponse } from '@vercel/node'
import { advancePendingDeliveries } from '../../src/lib/simulator.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    await advancePendingDeliveries()
    res.json({ ok: true })
  } catch (err) {
    console.error('advance-deliveries cron error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
}
