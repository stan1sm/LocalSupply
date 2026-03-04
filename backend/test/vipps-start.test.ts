import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'

describe('GET /api/auth/vipps/start', () => {
  const originalEnv = {
    BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
    VIPPS_CLIENT_ID: process.env.VIPPS_CLIENT_ID,
  }

  beforeEach(() => {
    process.env.BACKEND_BASE_URL = 'https://localsupply-api.vercel.app'
    process.env.VIPPS_CLIENT_ID = 'vipps-client-id'
  })

  afterEach(() => {
    process.env.BACKEND_BASE_URL = originalEnv.BACKEND_BASE_URL
    process.env.VIPPS_CLIENT_ID = originalEnv.VIPPS_CLIENT_ID
  })

  it('redirects to Vipps authorize with oauth parameters and sets the oauth cookie', async () => {
    const response = await request(app).get('/api/auth/vipps/start?intent=login')

    expect(response.status).toBe(302)
    expect(response.headers.location).toContain('https://apitest.vipps.no/access-management-1.0/access/oauth2/auth')
    expect(response.headers.location).toContain('client_id=vipps-client-id')
    expect(response.headers.location).toContain('response_type=code')
    expect(response.headers.location).toContain('scope=openid+name+email+phoneNumber')
    expect(response.headers.location).toContain('redirect_uri=https%3A%2F%2Flocalsupply-api.vercel.app%2Fapi%2Fauth%2Fvipps%2Fcallback')
    expect(response.headers['set-cookie']?.[0]).toContain('vipps_oauth=')
  })
})
