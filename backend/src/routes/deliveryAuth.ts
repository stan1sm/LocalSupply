/**
 * @module routes/deliveryAuth
 * Express router for delivery person authentication via Vipps OAuth.
 * All routes are mounted under /api/delivery-auth.
 */
import { randomBytes } from 'crypto'
import { Router } from 'express'
import { signDeliveryToken } from '../lib/jwt.js'
import { getPrismaClient } from '../lib/prisma.js'
import { buildAuthorizationUrl, exchangeCode, getUserInfo } from '../lib/vippsLogin.js'

const deliveryAuthRouter = Router()

// Short-lived one-time session store for the Vipps OAuth callback.
const deliverySessionStore = new Map<string, { token: string; person: string; expiresAt: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of deliverySessionStore) {
    if (entry.expiresAt < now) deliverySessionStore.delete(key)
  }
}, 120_000).unref()

function getRequestBaseUrl(req: { protocol: string; get(name: string): string | undefined }) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = req.get('x-forwarded-host') ?? req.get('host')
  const protocol = forwardedProto || req.protocol
  if (!host) return undefined
  return `${protocol}://${host}`
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const eq = pair.indexOf('=')
      if (eq < 0) return [pair.trim(), '']
      return [pair.slice(0, eq).trim(), decodeURIComponent(pair.slice(eq + 1).trim())]
    }),
  )
}

/**
 * Initiate the Vipps Login OAuth 2.0 flow for delivery persons.
 *
 * @route {GET} /vipps
 * @access public
 */
deliveryAuthRouter.get('/vipps', (req, res) => {
  const state = randomBytes(16).toString('hex')
  const baseUrl = getRequestBaseUrl(req) ?? `https://${req.get('host')}`
  const redirectUri = process.env.DELIVERY_VIPPS_REDIRECT_URI ?? `${baseUrl}/api/delivery-auth/vipps/callback`
  const authUrl = buildAuthorizationUrl(state, redirectUri)

  const isSecure = req.get('x-forwarded-proto') === 'https' || req.protocol === 'https'
  const cookieFlags = `HttpOnly; SameSite=Lax; Max-Age=600; Path=/${isSecure ? '; Secure' : ''}`
  res.setHeader('Set-Cookie', `delivery_vipps_state=${state}; ${cookieFlags}`)
  res.redirect(authUrl)
})

/**
 * Handle the Vipps OAuth callback for delivery persons. Upserts DeliveryPerson by
 * vippsSub and issues a delivery JWT. New accounts start with isActive=false
 * (pending admin approval).
 *
 * @route {GET} /vipps/callback
 * @access public
 */
deliveryAuthRouter.get('/vipps/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000'
  const { code, state, error } = req.query as Record<string, string>

  if (error || !code || !state) {
    res.redirect(`${frontendUrl}/delivery/login?error=vipps_denied`)
    return
  }

  const cookies = parseCookies(req.headers.cookie)
  if (state !== cookies.delivery_vipps_state) {
    res.redirect(`${frontendUrl}/delivery/login?error=vipps_state`)
    return
  }

  res.setHeader('Set-Cookie', 'delivery_vipps_state=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/')

  try {
    const baseUrl = getRequestBaseUrl(req) ?? `https://${req.get('host')}`
    const redirectUri = process.env.DELIVERY_VIPPS_REDIRECT_URI ?? `${baseUrl}/api/delivery-auth/vipps/callback`
    const accessToken = await exchangeCode(code, redirectUri)
    const userInfo = await getUserInfo(accessToken)

    if (!userInfo.sub) throw new Error('No sub in Vipps userinfo')

    const prisma = getPrismaClient()
    const name = (userInfo.name ?? ([userInfo.given_name, userInfo.family_name].filter(Boolean).join(' '))) || 'Delivery Person'

    const person = await prisma.deliveryPerson.upsert({
      where: { vippsSub: userInfo.sub },
      update: {
        name,
        phone: userInfo.phone_number ?? null,
        email: userInfo.email ?? null,
      },
      create: {
        vippsSub: userInfo.sub,
        name,
        phone: userInfo.phone_number ?? null,
        email: userInfo.email ?? null,
        isActive: false,
      },
    })

    const token = signDeliveryToken(person.id)
    const personParam = JSON.stringify({
      id: person.id,
      name: person.name,
      email: person.email,
      isActive: person.isActive,
    })

    const sessionCode = randomBytes(16).toString('hex')
    deliverySessionStore.set(sessionCode, { token, person: personParam, expiresAt: Date.now() + 60_000 })

    res.redirect(`${frontendUrl}/auth/delivery-vipps-return?code=${sessionCode}`)
  } catch (err) {
    console.error('Delivery Vipps callback failed', err)
    res.redirect(`${frontendUrl}/delivery/login?error=vipps_failed`)
  }
})

/**
 * Exchange a one-time delivery session code for the delivery person JWT.
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
