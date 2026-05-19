/**
 * @module routes/auth/delivery-vipps-return
 * Exchanges a one-time delivery Vipps session code for a JWT, stores it, and redirects to the delivery dashboard.
 */

'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const Spinner = () => (
  <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6]">
    <div className="text-center">
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#FF5B24]" />
      <p className="text-sm font-medium text-[#374740]">Completing Vipps sign in…</p>
    </div>
  </main>
)

function DeliveryVippsReturnContent() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      router.replace(`/delivery/login?error=${error ?? 'vipps_failed'}`)
      return
    }

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'
    fetch(`${apiBase}/api/delivery-auth/vipps/session?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { token: string; person: { id: string; name: string; email: string | null; isActive: boolean } }) => {
        window.localStorage.setItem('localsupply-delivery-token', data.token)
        window.localStorage.setItem('localsupply-delivery-person', JSON.stringify(data.person))
        router.replace('/delivery/dashboard')
      })
      .catch(() => router.replace('/delivery/login?error=vipps_failed'))
  }, [params, router])

  return <Spinner />
}

export default function DeliveryVippsReturnPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DeliveryVippsReturnContent />
    </Suspense>
  )
}
