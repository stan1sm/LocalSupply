/**
 * @module routes/deliveryAuth
 * Express router for delivery person authentication via Vipps OAuth.
 * All routes are mounted under /api/delivery-auth.
 *
 * The OAuth flow reuses the buyer's registered Vipps redirect URI
 * (/api/auth/vipps/callback). The delivery flow is identified by prefixing
 * the CSRF state value with "d:" so the shared callback can branch correctly.
 */
import { randomBytes } from 'crypto'
import { Router } from 'express'
import { buildAuthorizationUrl } from '../lib/vippsLogin.js'
import { deliverySessionStore } from '../lib/vippsSessionStore.js'

const deliveryAuthRouter = Router()

function getRequestBaseUrl(req: { protocol: string; get(name: string): string | undefined }) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = req.get('x-forwarded-host') ?? req.get('host')
  const protocol = forwardedProto || req.protocol
  if (!host) return undefined
  return `${protocol}://${host}`
}

/**
 * Initiate the Vipps Login OAuth 2.0 flow for delivery persons.
 * State is prefixed with "d:" so /api/auth/vipps/callback can identify the flow.
 * Uses the same registered redirect URI as the buyer flow.
 *
 * @route {GET} /vipps
 * @access public
 */
deliveryAuthRouter.get('/vipps', (req, res) => {
  const state = `d:${randomBytes(16).toString('hex')}`
  const baseUrl = getRequestBaseUrl(req) ?? `https://${req.get('host')}`
  const redirectUri = process.env.VIPPS_REDIRECT_URI ?? `${baseUrl}/api/auth/vipps/callback`
  const authUrl = buildAuthorizationUrl(state, redirectUri)

  const isSecure = req.get('x-forwarded-proto') === 'https' || req.protocol === 'https'
  const cookieFlags = `HttpOnly; SameSite=Lax; Max-Age=600; Path=/${isSecure ? '; Secure' : ''}`
  res.setHeader('Set-Cookie', `vipps_state=${state}; ${cookieFlags}`)
  res.redirect(authUrl)
})

/**
 * Exchange a one-time delivery session code for the delivery person JWT.
 * The code is written to the shared deliverySessionStore by /api/auth/vipps/callback.
 *
 * @route {GET} /vipps/session
 * @access public
 */
deliveryAuthRouter.get('/vipps/session', (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : ''
  if (!code) {
    res.status(400).json({ message: 'Missing code.' })
    return
  }
  const entry = deliverySessionStore.get(code)
  if (!entry || entry.expiresAt < Date.now()) {
    deliverySessionStore.delete(code)
    res.status(401).json({ message: 'Invalid or expired session code.' })
    return
  }
  deliverySessionStore.delete(code)
  res.json({ token: entry.token, person: JSON.parse(entry.person) })
})

export default deliveryAuthRouter
