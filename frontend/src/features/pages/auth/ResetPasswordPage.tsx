'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import { passwordPolicyError } from '../../../utils/inputSecurity'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const hasLiveMismatch = confirmPassword.length > 0 && password !== confirmPassword

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const policyError = passwordPolicyError(password)
    if (policyError) { setError(policyError); return }
    if (password !== confirmPassword) { setError("Passwords don't match."); return }
    if (!token) { setError('Invalid reset link. Please request a new one.'); return }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch(buildApiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const payload = await response.json().catch(() => ({})) as { message?: string }

      if (!response.ok) {
        setError(payload.message ?? 'Unable to reset password. The link may have expired.')
        return
      }

      setDone(true)
    } catch {
      setError('Unable to reach the service. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <h2 className="text-xl font-bold text-[#1b2a1f]">Invalid reset link</h2>
          <p className="mt-2 text-sm text-[#5b665f]">This link is missing a reset token. Please request a new password reset.</p>
          <Link className="mt-6 block text-center text-sm font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/forgot-password">
            Request new link
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        {done ? (
          <>
            <h2 className="text-xl font-bold text-[#1b2a1f]">Password updated</h2>
            <p className="mt-2 text-sm text-[#5b665f]">Your password has been reset. You can now sign in with your new password.</p>
            <button
              className="mt-6 w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f]"
              onClick={() => router.push('/login')}
              type="button"
            >
              Go to sign in
            </button>
          </>
        ) : (
          <>
            <div className="mb-6">
              <button
                className="flex items-center gap-1 rounded-full border-2 border-[#c7d2c2] bg-white px-3 py-1.5 text-xs font-medium text-[#1f2937] shadow-sm transition hover:border-[#2f9f4f] hover:text-[#1f7b3a]"
                onClick={() => router.push('/login')}
                type="button"
              >
                <span aria-hidden="true">←</span>
                <span>Back to sign in</span>
              </button>
            </div>

            <h2 className="text-xl font-bold text-[#1b2a1f]">Set a new password</h2>
            <p className="mt-1.5 text-sm text-[#5b665f]">Choose a strong password for your account.</p>

            <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
              <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
                New password
                <input
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                  maxLength={128}
                  onChange={(e) => { setPassword(e.target.value.slice(0, 128)); setError('') }}
                  placeholder="Create a strong password"
                  required
                  type="password"
                  value={password}
                />
                <p className="text-xs text-[#5b665f]">At least 8 characters with uppercase, lowercase, number, and special character.</p>
              </label>

              <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
                Confirm password
                <input
                  autoComplete="new-password"
                  aria-invalid={hasLiveMismatch}
                  className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                  maxLength={128}
                  onChange={(e) => { setConfirmPassword(e.target.value.slice(0, 128)); setError('') }}
                  placeholder="Repeat your password"
                  required
                  type="password"
                  value={confirmPassword}
                />
                {hasLiveMismatch ? <p className="text-xs text-[#c53030]">Passwords don't match.</p> : null}
              </label>

              {error ? <p aria-live="polite" className="text-xs text-[#c53030]">{error}</p> : null}

              <button
                className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
