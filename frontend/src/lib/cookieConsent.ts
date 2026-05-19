/**
 * Browser storage key for the marketplace cart (same key as cart / marketplace pages).
 */
export const MARKETPLACE_CART_STORAGE_KEY = 'localsupply-marketplace-cart'

/** localStorage key for the user's cookie / storage consent decision. */
export const COOKIE_CONSENT_STORAGE_KEY = 'localsupply-cookie-consent'

const CONSENT_VERSION = 1 as const

export type CookieConsentChoice = 'all' | 'essential'

export type CookieConsentRecord = {
  v: typeof CONSENT_VERSION
  choice: CookieConsentChoice
  decidedAt: number
}

function parseRecord(raw: string | null): CookieConsentRecord | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return null
    const v = (o as { v?: unknown }).v
    const choice = (o as { choice?: unknown }).choice
    const decidedAt = (o as { decidedAt?: unknown }).decidedAt
    if (v !== CONSENT_VERSION) return null
    if (choice !== 'all' && choice !== 'essential') return null
    if (typeof decidedAt !== 'number' || !Number.isFinite(decidedAt)) return null
    return { v: CONSENT_VERSION, choice, decidedAt }
  } catch {
    return null
  }
}

/** Returns the saved consent record, or null if the user has not decided yet. */
export function getCookieConsent(): CookieConsentRecord | null {
  if (typeof window === 'undefined') return null
  try {
    return parseRecord(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Persists the user's choice and notifies other listeners (e.g. other tabs). */
export function setCookieConsent(choice: CookieConsentChoice): void {
  if (typeof window === 'undefined') return
  const record: CookieConsentRecord = {
    v: CONSENT_VERSION,
    choice,
    decidedAt: Date.now(),
  }
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record))
    if (choice === 'essential') {
      try {
        window.localStorage.removeItem(MARKETPLACE_CART_STORAGE_KEY)
      } catch {
        /* ignore */
      }
    }
    window.dispatchEvent(new Event('localsupply-cookie-consent-changed'))
  } catch {
    /* ignore quota / private mode */
  }
}

/** True when the user explicitly accepted all cookies / storage described in the policy. */
export function hasAcceptedFullCookieConsent(): boolean {
  return getCookieConsent()?.choice === 'all'
}

/**
 * When false, the marketplace cart must not be read from or written to localStorage
 * (user chose "Necessary only"). When consent has not been set yet, returns true so
 * existing behaviour is unchanged until the user decides.
 */
export function allowsPersistedMarketplaceCart(): boolean {
  const c = getCookieConsent()
  if (!c) return true
  return c.choice === 'all'
}
