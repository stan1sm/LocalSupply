'use client'

import { useEffect, useState } from 'react'
import { allowsPersistedMarketplaceCart } from './cookieConsent'

/**
 * Subscribes to cookie-consent changes and returns whether the marketplace cart
 * may be synced to localStorage.
 */
export function useMarketplaceCartPersistenceAllowed(): boolean {
  const [allowed, setAllowed] = useState(() =>
    typeof window === 'undefined' ? true : allowsPersistedMarketplaceCart(),
  )

  useEffect(() => {
    function sync() {
      setAllowed(allowsPersistedMarketplaceCart())
    }
    sync()
    window.addEventListener('localsupply-cookie-consent-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('localsupply-cookie-consent-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return allowed
}
