import { createHash, randomBytes } from 'node:crypto'

type VippsIntent = 'login' | 'register'

type VippsTokenResponse = {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
  id_token?: string
}

type VippsUserInfoResponse = {
  sub: string
  email?: string
  email_verified?: boolean
  given_name?: string
  family_name?: string
  name?: string
  phone_number?: string
}

type VippsUserProfile = {
  email: string
  emailVerified: boolean
  firstName: string
  lastName: string
  phoneNumber?: string
  sub: string
}

const VIPPS_OAUTH_COOKIE = 'vipps_oauth'
const VIPPS_DEFAULT_SCOPE = 'openid name email phoneNumber'
const VIPPS_DEFAULT_API_BASE_URL = 'https://apitest.vipps.no'
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60
const SYSTEM_NAME = process.env.VIPPS_SYSTEM_NAME?.trim() || 'LocalSupply'
const SYSTEM_VERSION = process.env.VIPPS_SYSTEM_VERSION?.trim() || '1.0.0'
const SYSTEM_PLUGIN_NAME = process.env.VIPPS_SYSTEM_PLUGIN_NAME?.trim() || 'LocalSupply Web'
const SYSTEM_PLUGIN_VERSION = process.env.VIPPS_SYSTEM_PLUGIN_VERSION?.trim() || '1.0.0'

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} must be configured for Vipps login.`)
  }

  return value
}

function getVippsBaseUrl() {
  return normalizeBaseUrl(process.env.VIPPS_API_BASE_URL ?? VIPPS_DEFAULT_API_BASE_URL)
}

function getVippsAuthorizeUrl() {
  return `${getVippsBaseUrl()}/access-management-1.0/access/oauth2/auth`
}

function getVippsTokenUrl() {
  return `${getVippsBaseUrl()}/access-management-1.0/access/oauth2/token`
}

function getVippsUserInfoUrl() {
  return `${getVippsBaseUrl()}/vipps-userinfo-api/userinfo/`
}

export function getVippsRedirectUri() {
  const explicitRedirectUri = process.env.VIPPS_REDIRECT_URI?.trim()

  if (explicitRedirectUri) {
    return explicitRedirectUri
  }

  const backendBaseUrl = normalizeBaseUrl(getRequiredEnv('BACKEND_BASE_URL'))
  return `${backendBaseUrl}/api/auth/vipps/callback`
}

function getBasicAuthHeader() {
  const clientId = getRequiredEnv('VIPPS_CLIENT_ID')
  const clientSecret = getRequiredEnv('VIPPS_CLIENT_SECRET')
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

function buildCodeChallenge(codeVerifier: string) {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function getScopes() {
  return (process.env.VIPPS_SCOPES ?? VIPPS_DEFAULT_SCOPE).trim()
}

function getMerchantSerialNumber() {
  return process.env.VIPPS_MERCHANT_SERIAL_NUMBER?.trim()
}

function getVippsHeaders(accessToken?: string) {
  const merchantSerialNumber = getMerchantSerialNumber()

  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(merchantSerialNumber ? { 'Merchant-Serial-Number': merchantSerialNumber } : {}),
    'Vipps-System-Name': SYSTEM_NAME,
    'Vipps-System-Version': SYSTEM_VERSION,
    'Vipps-System-Plugin-Name': SYSTEM_PLUGIN_NAME,
    'Vipps-System-Plugin-Version': SYSTEM_PLUGIN_VERSION,
  }
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

export function createVippsOAuthState(intent: VippsIntent) {
  const state = randomBytes(16).toString('hex')
  const nonce = randomBytes(16).toString('hex')
  const codeVerifier = randomBytes(32).toString('hex')
  const codeChallenge = buildCodeChallenge(codeVerifier)
  const cookieValue = toBase64Url(JSON.stringify({ state, nonce, codeVerifier, intent }))

  return {
    authorizeUrl: new URL(getVippsAuthorizeUrl()),
    codeChallenge,
    cookieValue,
    nonce,
    state,
  }
}

export function buildVippsAuthorizeUrl(intent: VippsIntent) {
  const clientId = getRequiredEnv('VIPPS_CLIENT_ID')
  const redirectUri = getVippsRedirectUri()
  const oauth = createVippsOAuthState(intent)
  const url = oauth.authorizeUrl

  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', getScopes())
  url.searchParams.set('state', oauth.state)
  url.searchParams.set('nonce', oauth.nonce)
  url.searchParams.set('code_challenge', oauth.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return {
    cookieValue: oauth.cookieValue,
    url: url.toString(),
  }
}

export function buildVippsOAuthCookie(cookieValue: string) {
  const secure = (process.env.NODE_ENV ?? 'development') !== 'development'
  const parts = [
    `${VIPPS_OAUTH_COOKIE}=${cookieValue}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${OAUTH_COOKIE_MAX_AGE_SECONDS}`,
  ]

  if (secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function buildExpiredVippsOAuthCookie() {
  return `${VIPPS_OAUTH_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
}

function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>()

  if (!cookieHeader) {
    return cookies
  }

  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (!name) continue
    cookies.set(name, valueParts.join('='))
  }

  return cookies
}

export function readVippsOAuthCookie(cookieHeader: string | undefined) {
  const cookies = parseCookies(cookieHeader)
  const rawCookieValue = cookies.get(VIPPS_OAUTH_COOKIE)

  if (!rawCookieValue) {
    return null
  }

  try {
    const parsed = JSON.parse(fromBase64Url(rawCookieValue)) as {
      codeVerifier: string
      intent: VippsIntent
      nonce: string
      state: string
    }

    if (!parsed.state || !parsed.codeVerifier || !parsed.intent) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function buildVippsErrorRedirect(intent: VippsIntent, code: string) {
  const frontendBaseUrl = normalizeBaseUrl(getRequiredEnv('FRONTEND_BASE_URL'))
  const path = intent === 'register' ? '/register' : '/login'
  const url = new URL(path, frontendBaseUrl)
  url.searchParams.set('vippsError', code)
  return url.toString()
}

export function buildVippsSuccessRedirect() {
  const frontendBaseUrl = normalizeBaseUrl(getRequiredEnv('FRONTEND_BASE_URL'))
  const url = new URL('/marketplace/dashboard', frontendBaseUrl)
  url.searchParams.set('authProvider', 'vipps')
  return url.toString()
}

export async function exchangeVippsAuthorizationCode(code: string, codeVerifier: string) {
  const response = await fetch(getVippsTokenUrl(), {
    method: 'POST',
    headers: {
      ...getVippsHeaders(),
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: getVippsRedirectUri(),
    }),
  })

  if (!response.ok) {
    throw new Error(`Vipps token exchange failed with status ${response.status}.`)
  }

  return (await response.json()) as VippsTokenResponse
}

function splitFullName(fullName: string | undefined): { firstName: string; lastName: string } {
  if (!fullName) {
    return { firstName: 'Vipps', lastName: 'User' }
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstPart = parts[0] ?? 'Vipps'
  if (parts.length === 0) {
    return { firstName: 'Vipps', lastName: 'User' }
  }

  if (parts.length === 1) {
    return { firstName: firstPart, lastName: 'User' }
  }

  return {
    firstName: firstPart,
    lastName: parts.slice(1).join(' '),
  }
}

export async function fetchVippsUserProfile(accessToken: string): Promise<VippsUserProfile> {
  const response = await fetch(getVippsUserInfoUrl(), {
    headers: getVippsHeaders(accessToken),
  })

  if (!response.ok) {
    throw new Error(`Vipps userinfo request failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as VippsUserInfoResponse

  if (!payload.sub) {
    throw new Error('Vipps userinfo response did not contain a subject identifier.')
  }

  if (!payload.email) {
    throw new Error('Vipps userinfo response did not contain an email address.')
  }

  const derivedName: { firstName: string; lastName: string } = splitFullName(payload.name)
  const email = payload.email.toLowerCase()
  const firstName: string = payload.given_name?.trim() ? payload.given_name.trim() : derivedName.firstName
  const lastName: string = payload.family_name?.trim() ? payload.family_name.trim() : derivedName.lastName
  const phoneNumber = payload.phone_number?.trim()

  return {
    email,
    emailVerified: true,
    firstName,
    lastName,
    ...(phoneNumber ? { phoneNumber } : {}),
    sub: payload.sub,
  }
}
