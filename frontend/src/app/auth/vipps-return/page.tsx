/**
 * @module routes/auth/vipps-return
 * Next.js route entry — handles the Vipps OAuth return, stores the session token, and redirects to the marketplace.
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

function VippsReturnContent() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      router.replace(`/login?error=${error ?? 'vipps_failed'}`)
      return
    }

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'
    fetch(`${apiBase}/api/auth/vipps/session?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { token: string; user: string }) => {
        const user = JSON.parse(data.user) as {
          id: string
          firstName: string
          lastName: string
          email: string
        }
        window.localStorage.removeItem('localsupply-marketplace-cart')
        window.localStorage.setItem('localsupply-token', data.token)
        window.localStorage.setItem('localsupply-user', JSON.stringify(user))
        router.replace('/marketplace/dashboard')
      })
      .catch(() => router.replace('/login?error=vipps_failed'))
  }, [params, router])

  return <Spinner />
}

/** Next.js page component — wraps VippsReturnContent in a Suspense boundary to support useSearchParams. */
export default function VippsReturnPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <VippsReturnContent />
    </Suspense>
  )
}
