'use client'

import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'

const ADMIN_STORAGE_KEY = 'localsupply-admin'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    async function submit() {
      try {
        const res = await fetch(buildApiUrl('/api/admin/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const data = (await res.json().catch(() => ({}))) as { token?: string; admin?: { id: string; email: string; name: string }; message?: string }

        if (!res.ok) {
          setError(data.message ?? 'Invalid credentials.')
          return
        }

        if (data.admin && data.token) {
          window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(data.admin))
          window.localStorage.setItem('localsupply-admin-token', data.token)
          router.push('/admin/dashboard')
        }
      } catch {
        setError('Unable to sign in right now.')
      } finally {
        setLoading(false)
      }
    }

    void submit()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[#1f2937]">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#1f2937] text-[10px] font-bold text-white">LS</span>
            LocalSupply Admin
          </span>
          <h1 className="mt-3 text-xl font-bold text-[#111827]">Admin sign in</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Restricted access — authorised personnel only.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-sm font-medium text-[#374151]">
            Email
            <input
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm text-[#1f2937] outline-none transition focus:border-[#1f2937] focus:ring-2 focus:ring-[#1f2937]/10"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#374151]">
            Password
            <input
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm text-[#1f2937] outline-none transition focus:border-[#1f2937] focus:ring-2 focus:ring-[#1f2937]/10"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            className="w-full rounded-lg bg-[#1f2937] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#111827] disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
