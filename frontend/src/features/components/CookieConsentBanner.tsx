'use client'

/**
 * @module CookieConsentBanner
 * Site-wide banner asking for consent to use cookies and browser storage (see Cookie Policy).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCookieConsent, setCookieConsent } from '../../lib/cookieConsent'

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function sync() {
      setVisible(!getCookieConsent())
    }
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('localsupply-cookie-consent-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('localsupply-cookie-consent-changed', sync)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-4"
      role="dialog"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#dce5d7] bg-white/98 p-4 shadow-[0_-8px_40px_rgba(18,38,24,0.12)] backdrop-blur sm:p-5">
        <h2 className="text-sm font-bold text-[#111827]" id="cookie-consent-title">
          Cookies and storage
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#4b5563]">
          We use cookies and local storage to run the site (for example to keep you signed in and to remember your cart).
          See our{' '}
          <Link className="font-semibold text-[#2f9f4f] underline hover:text-[#25813f]" href="/cookie-policy">
            Cookie Policy
          </Link>{' '}
          for details. You can accept all of this storage, or only what is strictly necessary to use the service.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            className="order-3 rounded-xl border border-[#d4ddcf] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] transition hover:border-[#9bb49f] hover:bg-[#f9fafb] sm:order-1"
            onClick={() => {
              setCookieConsent('essential')
              setVisible(false)
            }}
            type="button"
          >
            Necessary only
          </button>
          <button
            className="order-2 rounded-xl bg-[#2f9f4f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#25813f] sm:order-2"
            onClick={() => {
              setCookieConsent('all')
              setVisible(false)
            }}
            type="button"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}
