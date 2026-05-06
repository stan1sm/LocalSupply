import { Router, type Request, type Response } from 'express'

const router = Router()

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

async function findNearestForChain(
  chainKey: string,
  labels: string[],
  color: string,
  displayName: string,
  userLat: number,
  userLon: number,
  radiusM: number,
): Promise<StoreLocatorEntry | null> {
  const filters = labels
    .flatMap((b) => [
      `nwr["name"="${b}"](around:${radiusM},${userLat},${userLon});`,
      `nwr["brand"="${b}"](around:${radiusM},${userLat},${userLon});`,
    ])
    .join('\n')
  const query = `[out:json][timeout:8];\n(\n${filters}\n);\nout center 10;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null

    const data = (await res.json()) as OverpassResponse
    const elements = (data.elements ?? []).filter((e) => elLat(e) != null && elLon(e) != null)
    if (elements.length === 0) return null

    const nearest = elements.reduce((best, el) =>
      haversineKm(userLat, userLon, elLat(el)!, elLon(el)!) < haversineKm(userLat, userLon, elLat(best)!, elLon(best)!)
        ? el
        : best,
    )

    const tags = nearest.tags ?? {}
    const streetParts = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
    const address =
      streetParts && tags['addr:city']
        ? `${streetParts}, ${tags['addr:city']}`
        : tags['name'] ?? displayName

    const distanceKm = haversineKm(userLat, userLon, elLat(nearest)!, elLon(nearest)!)
    const est = estimateDelivery(distanceKm)
    if (!est) return null

    return {
      chainKey,
      displayName,
      color,
      name: tags['name'] ?? displayName,
      lat: elLat(nearest)!,
      lon: elLon(nearest)!,
      address,
      distanceKm: Math.round(distanceKm * 10) / 10,
      feeNok: est.feeNok,
      etaMinutes: est.etaMinutes,
    }
  } catch {
    return null
  }
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

  const settled = await Promise.allSettled(
    Object.entries(CHAIN_BRANDS).map(([key, { labels, color, displayName }]) =>
      findNearestForChain(key, labels, color, displayName, lat, lon, radius),
    ),
  )

  const chains: Record<string, StoreLocatorEntry> = {}
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      chains[result.value.chainKey] = result.value
    }
  }

  res.json({ chains })
})

export default router
