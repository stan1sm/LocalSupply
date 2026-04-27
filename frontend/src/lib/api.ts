/** Trims whitespace and strips a trailing slash from a base URL. */
function normalizeBaseUrl(value: string | undefined) {
  return (value ?? '').trim().replace(/\/+$/, '')
}

const devFallbackBaseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : undefined

export const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? devFallbackBaseUrl)

/** Builds an absolute API URL by joining `API_BASE_URL` with the given path (leading slash is added if missing). */
export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}
