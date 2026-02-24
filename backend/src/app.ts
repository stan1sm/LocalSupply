import cors, { type CorsOptions } from 'cors'
import express from 'express'

const app = express()

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

app.use(cors(corsOptions))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ status: 'ok' })
})

export default app
