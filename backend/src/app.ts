import path from 'path'
import cors, { type CorsOptions } from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import addressesRouter from './routes/addresses.js'
import adminRouter from './routes/admin.js'
import authRouter from './routes/auth.js'
import cartRouter from './routes/cart.js'
import ordersRouter from './routes/orders.js'
import productsRouter from './routes/products.js'
import suppliersRouter from './routes/suppliers.js'
import woltRouter from './routes/wolt.js'

const app = express()

// Serve uploaded product images
const uploadsDir = path.join(process.cwd(), 'uploads')
app.use('/uploads', express.static(uploadsDir))

const localDevOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173']
const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowVercelPreviews = (process.env.CORS_ALLOW_VERCEL_PREVIEWS ?? 'true').toLowerCase() !== 'false'
const allowedOrigins = new Set([...localDevOrigins, ...configuredOrigins])

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow non-browser clients (curl, server-to-server, health checks).
    if (!origin) {
      callback(null, true)
      return
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true)
      return
    }

    if (allowVercelPreviews) {
      try {
        const { hostname, protocol } = new URL(origin)
        if (protocol === 'https:' && hostname.endsWith('.vercel.app')) {
          callback(null, true)
          return
        }
      } catch {
        // Invalid Origin header; fall through to reject.
      }
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`))
  },
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

app.use(cors(corsOptions))

// Capture raw body for Wolt webhook signature verification before JSON parsing
app.use('/api/wolt/webhook', express.raw({ type: 'application/json' }))
app.use(express.json())
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/auth/resend-verification', authLimiter)
app.use('/api/suppliers/login', authLimiter)
app.use('/api/suppliers/register', authLimiter)
app.use('/api/admin/login', authLimiter)
app.use('/api/auth/forgot-password', authLimiter)
app.use('/api/auth/reset-password', authLimiter)
app.use('/api/products', searchLimiter)
app.use('/api/orders', orderLimiter)
app.use('/api/suppliers', uploadLimiter)
app.use('/api/addresses', addressesRouter)
app.use('/api/admin', adminRouter)
app.use('/api/auth', authRouter)
app.use('/api/cart', cartRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/products', productsRouter)
app.use('/api/suppliers', suppliersRouter)
app.use('/api/wolt', woltRouter)

app.get('/', (_req, res) => {
  res.json({ status: 'ok' })
})

export default app
