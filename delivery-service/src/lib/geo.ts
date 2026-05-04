import crypto from 'crypto'

const GEONORGE_URL = 'https://ws.geonorge.no/adresser/v1/sok'

interface GeonorgeResponse {
  adresser?: Array<{
    representasjonspunkt?: { lat: number; lon: number }
  }>
}

// Simple in-process cache — keyed by normalised address string
const geocodeCache = new Map<string, { lat: number; lon: number } | null>()
const CACHE_MAX = 2000

function cacheKey(street: string, city: string): string {
  return `${street.toLowerCase().trim()}|${city.toLowerCase().trim()}`
}

export async function geocodeAddress(street: string, city: string): Promise<{ lat: number; lon: number } | null> {
  const key = cacheKey(street, city)
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null

  try {
    const q = encodeURIComponent(`${street}, ${city}`)
    const res = await fetch(`${GEONORGE_URL}?sok=${q}&treffPerSide=1&fuzzy=true`, {
      headers: { 'User-Agent': 'LocalSupply-Delivery/1.0' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      geocodeCache.set(key, null)
      return null
    }
    const data = (await res.json()) as GeonorgeResponse
    const point = data.adresser?.[0]?.representasjonspunkt ?? null
    const result = point ? { lat: point.lat, lon: point.lon } : null

    if (geocodeCache.size >= CACHE_MAX) {
      // Evict oldest entry
      const firstKey = geocodeCache.keys().next().value
      if (firstKey !== undefined) geocodeCache.delete(firstKey)
    }
    geocodeCache.set(key, result)
    return result
  } catch {
    return null
  }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isValidCoord(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    isFinite(lat) && isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  )
}

const MAX_DISTANCE_KM = 40
const BASE_FEE_NOK = 29
const FEE_PER_KM = 3
const BASE_ETA_MIN = 15
const ETA_PER_KM = 2

export function estimateDelivery(km: number): { feeOre: number; etaMinutes: number } | null {
  if (km > MAX_DISTANCE_KM) return null
  const feeNok = Math.min(BASE_FEE_NOK + FEE_PER_KM * km, 149)
  const etaMinutes = Math.min(Math.round(BASE_ETA_MIN + ETA_PER_KM * km), 90)
  return { feeOre: Math.round(feeNok) * 100, etaMinutes }
}
