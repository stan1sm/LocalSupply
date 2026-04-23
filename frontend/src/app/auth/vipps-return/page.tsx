'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function VippsReturnPage() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const token = params.get('token')
    const userRaw = params.get('user')
    const error = params.get('error')

    if (error || !token || !userRaw) {
      const reason = error ?? 'vipps_failed'
      router.replace(`/login?error=${reason}`)
      return
    }

    try {
      const user = JSON.parse(decodeURIComponent(userRaw)) as {
        id: string
        firstName: string
        lastName: string
        email: string
      }
      window.localStorage.setItem('localsupply-token', token)
      window.localStorage.setItem('localsupply-user', JSON.stringify(user))
      router.replace('/marketplace/dashboard')
    } catch {
      router.replace('/login?error=vipps_failed')
    }
  }, [params, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#FF5B24]" />
        <p className="text-sm font-medium text-[#374740]">Completing Vipps sign in…</p>
      </div>
    </main>
  )
}
