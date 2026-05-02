/**
 * @module routes/addresses
 * Express router for Norwegian address autocomplete via the Geonorge API.
 * All routes are mounted under /api/addresses.
 */

import { Router, type Request, type Response } from 'express'

/**
 * Express router providing address search endpoints.
 */
const addressesRouter = Router()
const GEONORGE_BASE = 'https://ws.geonorge.no/adresser/v1'

/**
 * Search for Norwegian addresses using the Geonorge address API.
 * Proxies the request to the Geonorge /sok endpoint and returns the
 * matching address list. The result count is clamped between 1 and 20.
 *
 * @route {GET} /sok
 * @access {public}
 * @param req.query.q   - The address search string (required).
 * @param req.query.limit - Maximum number of results to return (1–20, default 10).
 */
addressesRouter.get('/sok', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 20)

  if (!q) {
    res.status(400).json({ message: 'Missing query parameter: q' })
    return
  }

  try {
    const params = new URLSearchParams({
      sok: q,
      treffPerSide: String(limit),
      side: '0',
    })
    const url = `${GEONORGE_BASE}/sok?${params.toString()}`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })

    if (!response.ok) {
      res.status(502).json({ message: 'Address service unavailable' })
      return
    }

    const data = (await response.json()) as { adresser?: unknown[] }
    const adresser = data.adresser ?? []
    res.status(200).json({ adresser })
  } catch {
    res.status(502).json({ message: 'Address service unavailable' })
  }
})

/** @exports addressesRouter */
export default addressesRouter
