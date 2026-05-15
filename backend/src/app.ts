/**
 * @module app
 * Configures and exports the Express application with CORS, rate limiting, and all API routers.
 */
import cors, { type CorsOptions } from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import addressesRouter from './routes/addresses.js'
import adminRouter from './routes/admin.js'
import authRouter from './routes/auth.js'
import cartRouter from './routes/cart.js'
import chatRouter from './routes/chat.js'
import deliveryRouter from './routes/delivery.js'
import deliveryAuthRouter from './routes/deliveryAuth.js'
import deliveryPersonRouter from './routes/deliveryPerson.js'
import ordersRouter from './routes/orders.js'
import productsRouter from './routes/products.js'
import suppliersRouter from './routes/suppliers.js'
import woltRouter from './routes/wolt.js'

const app = express()

const localDevOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173']
const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowVercelPreviews = (process.env.CORS_ALLOW_VERCEL_PREVIEWS ?? 'false').toLowerCase() !== 'false'
const allowedOrigins = new Set([...localDevOrigins, ...configuredOrigins])

/**
 * CORS configuration that allows local dev origins, explicitly configured origins via the
 * `CORS_ORIGINS` environment variable, and optionally all `*.vercel.app` preview deployments.
 *
 * Non-browser clients (curl, server-to-server) are always permitted by passing `null` as the origin.
 */
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

    // Also allow www. variants of any configured origin
    try {
      const url = new URL(origin)
      if (url.hostname.startsWith('www.')) {
        const stripped = `${url.protocol}//${url.hostname.slice(4)}${url.port ? `:${url.port}` : ''}`
        if (allowedOrigins.has(stripped)) {
          callback(null, true)
          return
        }
      }
    } catch {
      // Invalid Origin header; fall through to reject.
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

/**
 * Rate limiter applied to authentication endpoints (login, register, password reset).
 * Allows up to 20 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

/**
 * Rate limiter applied to product search/browse endpoints.
 * Allows up to 120 requests per 15-minute window per IP.
 */
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

/**
 * Rate limiter applied to order placement and management endpoints.
 * Allows up to 30 requests per 15-minute window per IP.
 */
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

/**
 * Rate limiter applied to supplier routes that include file upload operations.
 * Allows up to 40 requests per 15-minute window per IP.
 */
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
app.use('/api/auth/vipps', authLimiter)
app.use('/api/delivery-auth/vipps', authLimiter)
app.use('/api/products', searchLimiter)
app.use('/api/orders', orderLimiter)
app.use('/api/suppliers', uploadLimiter)
app.use('/api/chat', chatRouter)
app.use('/api/delivery', deliveryRouter)
app.use('/api/delivery-auth', deliveryAuthRouter)
app.use('/api/delivery-person', deliveryPersonRouter)
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

/**
 * The fully configured Express application instance.
 *
 * Mount order: static files → CORS → raw body (Wolt webhook) → JSON parser →
 * rate limiters → feature routers → root health-check.
 */
export default app
