/**
 * @module api
 * Provides the resolved API base URL and a helper for building absolute API endpoint URLs.
 */

function normalizeBaseUrl(value: string | undefined) {
  return (value ?? '').trim().replace(/\/+$/, '')
}

const devFallbackBaseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : undefined

/**
 * The resolved base URL for all backend API requests.
 *
 * Derived from the `NEXT_PUBLIC_API_BASE_URL` environment variable, with a
 * fallback to `http://localhost:3001` in development. Trailing slashes are
 * stripped so the value can be safely concatenated with a leading-slash path.
 *
 * @type {string}
 */
export const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? devFallbackBaseUrl)

/**
 * Builds an absolute API URL by joining `API_BASE_URL` with the given path.
 *
 * A leading slash is added to `path` if it is not already present, so both
 * `buildApiUrl('api/users')` and `buildApiUrl('/api/users')` produce the
 * same result.
 *
 * @param {string} path - The path segment to append (e.g. `'/api/orders'`).
 * @returns {string} The fully-qualified URL string.
 */
export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}
