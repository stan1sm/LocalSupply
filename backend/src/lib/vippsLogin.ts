const VIPPS_BASE_URL = process.env.VIPPS_BASE_URL ?? 'https://apitest.vipps.no'
const CLIENT_ID = process.env.VIPPS_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.VIPPS_CLIENT_SECRET ?? ''

const AUTH_ENDPOINT = `${VIPPS_BASE_URL}/access-management-1.0/access/oauth2/auth`
const TOKEN_ENDPOINT = `${VIPPS_BASE_URL}/access-management-1.0/access/oauth2/token`
const USERINFO_ENDPOINT = `${VIPPS_BASE_URL}/vipps-userinfo-api/userinfo`

export type VippsUserInfo = {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  email?: string
  email_verified?: boolean
  phone_number?: string
}

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

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
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
