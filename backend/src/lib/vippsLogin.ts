/**
 * @module vippsLogin
 * Implements the Vipps OAuth 2.0 login flow: builds authorization URLs, exchanges authorization codes for access tokens, and fetches user profile information.
 */

const VIPPS_BASE_URL = (process.env.VIPPS_BASE_URL ?? 'https://apitest.vipps.no').trim()
const CLIENT_ID = (process.env.VIPPS_CLIENT_ID ?? '').trim()
const CLIENT_SECRET = (process.env.VIPPS_CLIENT_SECRET ?? '').trim()

const AUTH_ENDPOINT = `${VIPPS_BASE_URL}/access-management-1.0/access/oauth2/auth`
const TOKEN_ENDPOINT = `${VIPPS_BASE_URL}/access-management-1.0/access/oauth2/token`
const USERINFO_ENDPOINT = `${VIPPS_BASE_URL}/vipps-userinfo-api/userinfo`

/**
 * User profile data returned by the Vipps userinfo endpoint.
 * @typedef {Object} VippsUserInfo
 * @property {string} sub - The unique subject identifier for the Vipps user.
 * @property {string} [name] - The user's full name.
 * @property {string} [given_name] - The user's given (first) name.
 * @property {string} [family_name] - The user's family (last) name.
 * @property {string} [email] - The user's email address.
 * @property {boolean} [email_verified] - Whether the user's email address has been verified by Vipps.
 * @property {string} [phone_number] - The user's phone number.
 */
export type VippsUserInfo = {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  email?: string
  email_verified?: boolean
  phone_number?: string
}

/**
 * Constructs the Vipps OAuth 2.0 authorization URL with the required query parameters.
 * @param {string} state - An opaque CSRF-protection value to be included in the authorization request.
 * @param {string} redirectUri - The URI Vipps will redirect to after the user authorizes the request.
 * @returns {string} The fully constructed authorization URL to redirect the user to.
 */
export function buildAuthorizationUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid name email phoneNumber',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

/**
 * Exchanges a Vipps authorization code for an OAuth 2.0 access token.
 * @param {string} code - The authorization code received from the Vipps redirect.
 * @param {string} redirectUri - The redirect URI that was used in the original authorization request.
 * @returns {Promise<string>} The access token string returned by the Vipps token endpoint.
 * @throws {Error} If the token endpoint responds with a non-OK HTTP status.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  console.log(`[vipps] exchangeCode: client_id set=${Boolean(CLIENT_ID)}, client_secret set=${Boolean(CLIENT_SECRET)}, base_url=${VIPPS_BASE_URL}, redirect_uri=${redirectUri}`)
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Vipps token exchange failed: ${response.status} ${text}`)
  }

  const data = (await response.json()) as { access_token: string }
  return data.access_token
}

/**
 * Fetches the authenticated user's profile from the Vipps userinfo endpoint.
 * @param {string} accessToken - A valid Vipps OAuth 2.0 access token.
 * @returns {Promise<VippsUserInfo>} The user's profile data as returned by Vipps.
 * @throws {Error} If the userinfo endpoint responds with a non-OK HTTP status.
 */
export async function getUserInfo(accessToken: string): Promise<VippsUserInfo> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Vipps userinfo failed: ${response.status} ${text}`)
  }

  return response.json() as Promise<VippsUserInfo>
}
