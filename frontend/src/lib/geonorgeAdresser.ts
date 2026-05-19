/**
 * @module geonorgeAdresser
 * Norwegian address lookup via Geonorge Adresser API (Kartverket).
 * Uses backend proxy (/api/addresses/sok) when API_BASE_URL is set to avoid CORS.
 * @see https://ws.geonorge.no/adresser/v1/
 */

import { API_BASE_URL, buildApiUrl } from './api'

/**
 * A single Norwegian address record returned after lookup and normalisation.
 *
 * @property {string} adressetekst - Full formatted address text (e.g. "Storgata 1").
 * @property {string} postnummer - Four-digit postal code (e.g. "0155").
 * @property {string} poststed - Postal area name in title-case (e.g. "Oslo").
 * @property {string} adressenavn - Street or road name without the house number.
 * @property {number} nummer - House number.
 * @property {string | null} bokstav - Optional letter suffix for the house number (e.g. "A"), or `null`.
 */
export type GeonorgeAdresse = {
  adressetekst: string
  postnummer: string
  poststed: string
  adressenavn: string
  nummer: number
  bokstav: string | null
}

type AdresseRow = {
  adressetekst: string
  postnummer: string
  poststed: string
  adressenavn: string
  nummer: number
  bokstav: string | null
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatPoststed(raw: string): string {
  return toTitleCase(raw.trim())
}

function mapRow(a: AdresseRow): GeonorgeAdresse {
  return {
    adressetekst: a.adressetekst,
    postnummer: a.postnummer,
    poststed: formatPoststed(a.poststed),
    adressenavn: a.adressenavn,
    nummer: a.nummer,
    bokstav: a.bokstav,
  }
}

/**
 * Searches for Norwegian addresses matching the given query string.
 *
 * When `API_BASE_URL` is configured the request is routed through the backend
 * proxy (`/api/addresses/sok`) to avoid CORS restrictions. Otherwise the
 * Geonorge API is called directly from the browser.
 *
 * Returns an empty array when the query is blank, when the network request
 * fails, or when the response contains no results. The request is aborted
 * automatically after 8 seconds.
 *
 * @param {string} query - The free-text search string (street name, number, or postcode).
 * @param {number} [limit=10] - Maximum number of address suggestions to return.
 * @returns {Promise<GeonorgeAdresse[]>} Resolves to an array of matching address records.
 */
/**
 * Geocodes a free-text Norwegian address to a WGS-84 coordinate pair.
 * Returns null when the address cannot be resolved or the request fails.
 *
 * @param {string} address - The address string to geocode.
 * @returns {Promise<{lat: number, lon: number} | null>}
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const trimmed = address.trim()
  if (!trimmed) return null

  const useBackend = Boolean(API_BASE_URL)
  const url = useBackend
    ? `${buildApiUrl('/api/addresses/sok')}?${new URLSearchParams({ q: trimmed, limit: '1' }).toString()}`
    : `https://ws.geonorge.no/adresser/v1/sok?${new URLSearchParams({ sok: trimmed, treffPerSide: '1', side: '0' }).toString()}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as { adresser?: { representasjonspunkt?: { lat?: number; lon?: number } }[] }
    const pt = data.adresser?.[0]?.representasjonspunkt
    if (pt?.lat == null || pt?.lon == null) return null
    return { lat: pt.lat, lon: pt.lon }
  } catch {
    return null
  }
}

export async function searchAddresses(query: string, limit = 10): Promise<GeonorgeAdresse[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const useBackend = Boolean(API_BASE_URL)
  const url = useBackend
    ? `${buildApiUrl('/api/addresses/sok')}?${new URLSearchParams({ q: trimmed, limit: String(limit) }).toString()}`
    : `https://ws.geonorge.no/adresser/v1/sok?${new URLSearchParams({
        sok: trimmed,
        treffPerSide: String(limit),
        side: '0',
      }).toString()}`

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return []

  const data = (await res.json()) as { adresser?: AdresseRow[] }
  const list = data.adresser ?? []
  return list.map(mapRow)
}
