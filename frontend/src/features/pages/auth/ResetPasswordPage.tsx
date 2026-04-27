'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import { getPasswordRequirementStatus, passwordPolicyError } from '../../../utils/inputSecurity'

const inputClass =
  'w-full rounded-lg border border-[#d6ddd2] bg-[#f9fbf8] px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20'
const labelClass = 'block space-y-1 text-xs font-medium text-[#2e3b31]'
const errorClass = 'text-[10px] text-[#c53030]'

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
  const passwordRequirements = getPasswordRequirementStatus(password)

  /** Validates the new password and token, then POSTs to reset-password; on success switches to the confirmation view. */
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
      const payload = (await response.json().catch(() => ({}))) as { message?: string }
      if (!response.ok) { setError(payload.message ?? 'Unable to reset password. The link may have expired.'); return }
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
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff5f5]">
            <svg className="h-6 w-6 text-[#c53030]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#1b2a1f]">Invalid reset link</h2>
          <p className="mt-2 text-sm text-[#5b665f]">This link is missing a reset token. Please request a new password reset.</p>
          <Link
            className="mt-6 block text-center text-sm font-semibold text-[#2f9f4f] hover:text-[#25813f]"
            href="/forgot-password"
          >
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
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0faf4]">
              <svg className="h-6 w-6 text-[#2f9f4f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#1b2a1f]">Password updated</h2>
            <p className="mt-2 text-sm text-[#5b665f]">
              Your password has been reset. You can now sign in with your new password.
            </p>
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
              <label className={labelClass}>
                New password
                <input
                  autoComplete="new-password"
                  className={inputClass}
                  maxLength={128}
                  onChange={(e) => { setPassword(e.target.value.slice(0, 128)); setError('') }}
                  placeholder="Create a strong password"
                  required
                  type="password"
                  value={password}
                />
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  {[
                    { key: 'hasMinLength', label: 'At least 8 characters' },
                    { key: 'hasUppercase', label: 'Uppercase letter' },
                    { key: 'hasLowercase', label: 'Lowercase letter' },
                    { key: 'hasNumber', label: 'Number' },
                    { key: 'hasSpecial', label: 'Special character' },
                  ].map(({ key, label }) => {
                    const met = passwordRequirements[key as keyof typeof passwordRequirements]
                    return (
                      <li key={key} className={`flex items-center gap-1.5 ${met ? 'text-[#2f9f4f]' : 'text-[#9ca3af]'}`}>
                        <span>{met ? '✓' : '○'}</span>{label}
                      </li>
                    )
                  })}
                </ul>
              </label>

              <label className={labelClass}>
                Confirm password
                <input
                  aria-invalid={hasLiveMismatch}
                  autoComplete="new-password"
                  className={inputClass}
                  maxLength={128}
                  onChange={(e) => { setConfirmPassword(e.target.value.slice(0, 128)); setError('') }}
                  placeholder="Repeat your password"
                  required
                  type="password"
                  value={confirmPassword}
                />
                {hasLiveMismatch ? <p className={errorClass}>Passwords don&apos;t match.</p> : null}
              </label>

              {error ? <p aria-live="polite" className={errorClass}>{error}</p> : null}

              <button
                className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Updating…
                  </span>
                ) : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
