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
