import { Router, type Request, type Response } from 'express'
import { requireBuyerAuth } from '../middleware/requireBuyerAuth.js'

const router = Router()

const WOLT_BASE = (process.env.WOLT_API_BASE_URL ?? 'https://daas-staging.wolt.com').replace(/\/$/, '')

// GET /api/delivery/track/:deliveryId — proxies to the delivery service tracking endpoint
router.get('/track/:deliveryId', requireBuyerAuth, async (req: Request, res: Response) => {
  const deliveryId = String(req.params['deliveryId'] ?? '')
  if (!deliveryId) { res.status(400).json({ message: 'Missing delivery ID.' }); return }
  try {
    const r = await fetch(`${WOLT_BASE}/track/${encodeURIComponent(deliveryId)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) { res.status(r.status).json({ message: 'Tracking unavailable.' }); return }
    res.json(await r.json())
  } catch {
    res.status(503).json({ message: 'Tracking unavailable.' })
  }
})

const CHAIN_BRANDS: Record<string, { labels: string[]; color: string; displayName: string }> = {
  kiwi:     { labels: ['KIWI', 'Kiwi'],                                                      color: '#f9c000', displayName: 'KIWI' },
  rema1000: { labels: ['Rema 1000', 'REMA 1000'],                                            color: '#e8100d', displayName: 'Rema 1000' },
  coop:     { labels: ['Coop Extra', 'Coop Mega', 'Coop Obs', 'Coop Prix', 'Coop'],         color: '#00a0e1', displayName: 'Coop' },
  meny:     { labels: ['Meny'],                                                               color: '#d4001a', displayName: 'Meny' },
  spar:     { labels: ['Spar', 'SPAR'],                                                      color: '#007f3e', displayName: 'Spar' },
  joker:    { labels: ['Joker'],                                                              color: '#e55b00', displayName: 'Joker' },
  bunnpris: { labels: ['Bunnpris'],                                                           color: '#003d7a', displayName: 'Bunnpris' },
}

const MAX_DISTANCE_KM = 40
const BASE_FEE_NOK = 29
const FEE_PER_KM = 3
const BASE_ETA_MIN = 15
const ETA_PER_KM = 2

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function estimateDelivery(km: number): { feeNok: number; etaMinutes: number } | null {
  if (km > MAX_DISTANCE_KM) return null
  const feeNok = Math.min(BASE_FEE_NOK + FEE_PER_KM * km, 149)
  const etaMinutes = Math.min(Math.round(BASE_ETA_MIN + ETA_PER_KM * km), 90)
  return { feeNok: Math.round(feeNok * 100) / 100, etaMinutes }
}

interface OverpassElement {
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

function elLat(el: OverpassElement): number | undefined { return el.lat ?? el.center?.lat }
function elLon(el: OverpassElement): number | undefined { return el.lon ?? el.center?.lon }

export interface StoreLocatorEntry {
  chainKey: string
  displayName: string
  color: string
  name: string
  lat: number
  lon: number
  address: string
  distanceKm: number
  feeNok: number
  etaMinutes: number
}

// Build a label → chainKey lookup for fast matching
const LABEL_TO_CHAIN: Map<string, string> = new Map()
for (const [chainKey, { labels }] of Object.entries(CHAIN_BRANDS)) {
  for (const label of labels) {
    LABEL_TO_CHAIN.set(label, chainKey)
  }
}

async function findNearestStoresAllChains(
  userLat: number,
  userLon: number,
  radiusM: number,
): Promise<Record<string, StoreLocatorEntry>> {
  // Single Overpass query for all chains — avoids 7 parallel requests getting rate-limited
  const filters: string[] = []
  for (const { labels } of Object.values(CHAIN_BRANDS)) {
    for (const label of labels) {
      filters.push(`nwr["name"="${label}"](around:${radiusM},${userLat},${userLon});`)
      filters.push(`nwr["brand"="${label}"](around:${radiusM},${userLat},${userLon});`)
    }
  }
  const query = `[out:json][timeout:20];\n(\n${filters.join('\n')}\n);\nout center 100;`

  let data: OverpassResponse
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return {}
    data = (await res.json()) as OverpassResponse
  } catch {
    return {}
  }

  const elements = (data.elements ?? []).filter((e) => elLat(e) != null && elLon(e) != null)

  // Pick nearest element per chain
  const chainBest = new Map<string, { el: OverpassElement; dist: number }>()
  for (const el of elements) {
    const tags = el.tags ?? {}
    const elName = tags['name'] ?? ''
    const elBrand = tags['brand'] ?? ''
    const chainKey = LABEL_TO_CHAIN.get(elName) ?? LABEL_TO_CHAIN.get(elBrand)
    if (!chainKey) continue

    const dist = haversineKm(userLat, userLon, elLat(el)!, elLon(el)!)
    const current = chainBest.get(chainKey)
    if (!current || dist < current.dist) {
      chainBest.set(chainKey, { el, dist })
    }
  }

  const chains: Record<string, StoreLocatorEntry> = {}
  for (const [chainKey, { el, dist }] of chainBest) {
    const est = estimateDelivery(dist)
    if (!est) continue

    const { color, displayName } = CHAIN_BRANDS[chainKey]!
    const tags = el.tags ?? {}
    const streetParts = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
    const address =
      streetParts && tags['addr:city']
        ? `${streetParts}, ${tags['addr:city']}`
        : tags['name'] ?? displayName

    chains[chainKey] = {
      chainKey,
      displayName,
      color,
      name: tags['name'] ?? displayName,
      lat: elLat(el)!,
      lon: elLon(el)!,
      address,
      distanceKm: Math.round(dist * 10) / 10,
      feeNok: est.feeNok,
      etaMinutes: est.etaMinutes,
    }
  }

  return chains
}

// GET /api/delivery/store-locator?lat=X&lon=Y[&radius=15000]
router.get('/store-locator', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lon = parseFloat(req.query.lon as string)
  const radius = Math.min(Math.abs(parseInt((req.query.radius as string) ?? '15000', 10)) || 15000, 30000)

  if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Provide valid lat and lon query parameters.' })
    return
  }

  const chains = await findNearestStoresAllChains(lat, lon, radius)
  res.json({ chains })
})

export default router
