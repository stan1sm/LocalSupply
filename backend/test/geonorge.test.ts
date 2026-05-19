import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import app from '../src/app.js'

describe('GET /api/addresses/sok', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/api/addresses/sok')
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('Missing query parameter')
  })

  it('returns 400 when q is an empty string', async () => {
    const res = await request(app).get('/api/addresses/sok?q=')
    expect(res.status).toBe(400)
  })

  it('returns address results from Geonorge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ adresser: [{ adressetekst: 'Storgata 1, 0155 Oslo' }] }),
    }))

    const res = await request(app).get('/api/addresses/sok?q=Storgata')

    expect(res.status).toBe(200)
    expect(res.body.adresser).toHaveLength(1)
    expect(res.body.adresser[0].adressetekst).toBe('Storgata 1, 0155 Oslo')
  })

  it('returns empty adresser array when Geonorge returns no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }))

    const res = await request(app).get('/api/addresses/sok?q=Nonexistent')

    expect(res.status).toBe(200)
    expect(res.body.adresser).toEqual([])
  })

  it('returns 502 when Geonorge responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    const res = await request(app).get('/api/addresses/sok?q=Storgata')

    expect(res.status).toBe(502)
    expect(res.body.message).toContain('unavailable')
  })

  it('returns 502 on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const res = await request(app).get('/api/addresses/sok?q=Storgata')

    expect(res.status).toBe(502)
  })

  it('clamps the limit to 20', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return Promise.resolve({ ok: true, json: async () => ({ adresser: [] }) })
    }))

    await request(app).get('/api/addresses/sok?q=Oslo&limit=999')

    expect(capturedUrl).toContain('treffPerSide=20')
  })
})
