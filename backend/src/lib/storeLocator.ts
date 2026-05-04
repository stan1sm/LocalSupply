/**
 * Finds the nearest physical store of a given chain to a delivery address,
 * using Geonorge for geocoding and OpenStreetMap Overpass for store locations.
 */

const GEONORGE_BASE = 'https://ws.geonorge.no/adresser/v1'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const SEARCH_RADIUS_M = 15000

/** Maps LocalSupply store codes to OSM brand/name tags. */
const STORE_BRANDS: Record<string, string[]> = {
  meny:     ['Meny'],
  coop:     ['Coop Extra', 'Coop Mega', 'Coop Obs', 'Coop Prix', 'Coop'],
  spar:     ['Spar', 'SPAR'],
  joker:    ['Joker'],
  kiwi:     ['KIWI', 'Kiwi'],
  rema1000: ['Rema 1000', 'REMA 1000'],
  bunnpris: ['Bunnpris'],
}

type LatLon = { lat: number; lon: number }
type StoreAddress = { street: string; city: string }

/** Geocodes a free-text Norwegian address to lat/lon via Geonorge. */
async function geocodeAddress(address: string): Promise<LatLon | null> {
  try {
    const params = new URLSearchParams({ sok: address, treffPerSide: '1', side: '0' })
    const res = await fetch(`${GEONORGE_BASE}/sok?${params}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = (await res.json()) as { adresser?: { representasjonspunkt?: { lat?: number; lon?: number } }[] }
    const pt = data.adresser?.[0]?.representasjonspunkt
    if (!pt?.lat || !pt?.lon) return null
    return { lat: pt.lat, lon: pt.lon }
  } catch {
    return null
  }
}

/** Builds an Overpass QL query for any of the given brand names near a point. */
function buildOverpassQuery(brands: string[], lat: number, lon: number): string {
  const nameFilters = brands
    .map((b) => `node["name"="${b}"](around:${SEARCH_RADIUS_M},${lat},${lon});`)
    .join('\n  ')
  const brandFilters = brands
    .map((b) => `node["brand"="${b}"](around:${SEARCH_RADIUS_M},${lat},${lon});`)
    .join('\n  ')
  return `[out:json][timeout:8];\n(\n  ${nameFilters}\n  ${brandFilters}\n);\nout 5;`
}

type OverpassNode = {
  lat: number
  lon: number
  tags?: Record<string, string>
}

/** Haversine distance in metres between two points. */
function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Extracts a human-readable street + city from an OSM node's tags. */
function extractAddress(node: OverpassNode): StoreAddress | null {
  const t = node.tags ?? {}
  const street = t['addr:street']
  const housenumber = t['addr:housenumber']
  const city = t['addr:city'] ?? t['addr:place']
  if (!street || !city) return null
  return {
    street: housenumber ? `${street} ${housenumber}` : street,
    city,
  }
}

/**
 * Returns the address of the nearest store of the given chain to a delivery address.
 * Returns null if the chain is unknown, geocoding fails, or no stores are found nearby.
 */
export async function findNearestStoreAddress(
  storeCode: string,
  deliveryAddress: string,
): Promise<StoreAddress | null> {
  const brands = STORE_BRANDS[storeCode.toLowerCase()]
  if (!brands) return null

  const userCoords = await geocodeAddress(deliveryAddress)
  if (!userCoords) return null

  try {
    const query = buildOverpassQuery(brands, userCoords.lat, userCoords.lon)
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null

    const data = (await res.json()) as { elements?: OverpassNode[] }
    const nodes = data.elements ?? []
    if (nodes.length === 0) return null

    // Pick the closest node that has address tags
    const sorted = nodes
      .map((n) => ({ node: n, dist: distanceM(userCoords.lat, userCoords.lon, n.lat, n.lon) }))
      .sort((a, b) => a.dist - b.dist)

    for (const { node } of sorted) {
      const addr = extractAddress(node)
      if (addr) return addr
    }
    return null
  } catch {
    return null
  }
}
