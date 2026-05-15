/**
 * @module DeliveryLoginPage
 * Login page for delivery persons — Vipps OAuth only.
 */

'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'

const VIPPS_ORANGE = '#FF5B24'

export default function DeliveryLoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const error = params.get('error')

  useEffect(() => {
    const token = window.localStorage.getItem('localsupply-delivery-token')
    if (token) router.replace('/delivery/dashboard')
  }, [router])

  function handleVippsLogin() {
    window.location.href = buildApiUrl('/api/delivery-auth/vipps')
  }

  const errorMessages: Record<string, string> = {
    vipps_denied: 'Vipps login was cancelled or denied.',
    vipps_state: 'Session expired. Please try again.',
    vipps_failed: 'Vipps login failed. Please try again.',
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        <div className="mb-6">
          <button
            className="flex items-center gap-1 rounded-full border-2 border-[#c7d2c2] bg-white px-3 py-1.5 text-xs font-medium text-[#1f2937] shadow-sm transition hover:border-[#2f9f4f] hover:text-[#1f7b3a]"
            onClick={() => router.push('/')}
            type="button"
          >
            <span aria-hidden="true">←</span>
            <span>Back to homepage</span>
          </button>
        </div>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef6f0]">
            <svg className="h-8 w-8 text-[#2f9f4f]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1b2a1f]">Delivery sign in</h1>
          <p className="mt-2 text-sm text-[#5b665f]">
            Sign in with Vipps to access your delivery dashboard.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessages[error] ?? 'An error occurred. Please try again.'}
          </div>
        ) : null}

        <button
          className="flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          onClick={handleVippsLogin}
          style={{ backgroundColor: VIPPS_ORANGE }}
          type="button"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.293 7.293a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 1 1 1.414-1.414L10.5 13.586l4.293-4.293a1 1 0 0 1 1.414 0z" />
          </svg>
          Continue with Vipps
        </button>

        <p className="mt-6 text-center text-xs text-[#9ca3af]">
          New accounts require admin approval before you can start delivering.
        </p>
      </div>
    </main>
  )
}
