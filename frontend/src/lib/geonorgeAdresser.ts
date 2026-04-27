/**
 * Norwegian address lookup via Geonorge Adresser API (Kartverket).
 * Uses backend proxy (/api/addresses/sok) when API_BASE_URL is set to avoid CORS.
 * @see https://ws.geonorge.no/adresser/v1/
 */

import { API_BASE_URL, buildApiUrl } from './api'

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

/** Converts a string to title case (first letter of each word capitalized). */
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Normalizes a postal place name from the API (typically ALL CAPS) to title case. */
function formatPoststed(raw: string): string {
  return toTitleCase(raw.trim())
}

/** Maps a raw API address row to the typed `GeonorgeAdresse` shape, normalizing the postal place name. */
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
 * Searches for Norwegian addresses matching `query`.
 * Routes through the backend proxy when `API_BASE_URL` is set; otherwise calls Geonorge directly.
 */
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
