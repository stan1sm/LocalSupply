import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import estimateRouter from './routes/estimate.js'
import { deliveryRouter } from './routes/delivery.js'
import { trackingRouter } from './routes/tracking.js'
import { advancePendingDeliveries } from './lib/simulator.js'

const app = express()

// Restrict CORS to known LocalSupply origins
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
  methods: ['GET', 'POST'],
}))

app.use(express.json())

// Global rate limit: 60 req/min per IP
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }))

// Tighter limit on estimate and order endpoints
const merchantLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })

// API key auth for merchant endpoints (called only by LocalSupply backend)
const DELIVERY_API_KEY = process.env.WOLT_API_KEY ?? ''
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization ?? ''
  if (!DELIVERY_API_KEY || auth === `Bearer ${DELIVERY_API_KEY}`) {
    next()
    return
  }
  res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid API key.' })
}

app.get('/', (_req, res) => {
  res.json({ service: 'LocalSupply Delivery', status: 'ok' })
})

app.use('/merchants/:merchantId/delivery-fee', merchantLimiter, requireApiKey, estimateRouter)
app.use('/merchants/:merchantId/delivery-order', merchantLimiter, requireApiKey, deliveryRouter)

// Tracking page is public (buyers visit it directly) but globally rate-limited above
app.use('/track', trackingRouter)

// Cron endpoint — called by cron-job.org every minute
const CRON_SECRET = process.env.CRON_SECRET ?? ''
app.get('/api/cron/advance-deliveries', async (req: Request, res: Response) => {
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    await advancePendingDeliveries()
    res.json({ ok: true })
  } catch (err) {
    console.error('advance-deliveries cron error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

export default app
