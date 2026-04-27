'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import { EMAIL_REGEX, sanitizeEmailInput } from '../../../utils/inputSecurity'

const inputClass =
  'w-full rounded-lg border border-[#d6ddd2] bg-[#f9fbf8] px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const normalizedEmail = email.trim().toLowerCase()
  const hasLiveInvalidEmail = normalizedEmail.length > 0 && !EMAIL_REGEX.test(normalizedEmail)

  /** POSTs the email to the forgot-password API (always shows the success state to avoid user enumeration). */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    if (!EMAIL_REGEX.test(normalizedEmail)) { setError('Enter a valid email address.'); return }

    setIsSubmitting(true)
    setError('')
    try {
      await fetch(buildApiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      setSubmitted(true)
    } catch {
      setError('Unable to reach the service. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
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

        {submitted ? (
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0faf4]">
              <svg className="h-6 w-6 text-[#2f9f4f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#1b2a1f]">Check your inbox</h2>
            <p className="mt-2 text-sm text-[#5b665f]">
              If an account exists for{' '}
              <span className="font-medium text-[#1f2937]">{normalizedEmail}</span>
              , we sent a reset link. Check your inbox and spam folder.
            </p>
            <p className="mt-2 text-[10px] text-[#9ca3af]">The link expires in 1 hour.</p>
            <Link
              className="mt-6 block text-center text-sm font-semibold text-[#2f9f4f] hover:text-[#25813f]"
              href="/login"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-[#1b2a1f]">Forgot your password?</h2>
            <p className="mt-1.5 text-sm text-[#5b665f]">
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
              <label className="block space-y-1 text-xs font-medium text-[#2e3b31]">
                Email
                <input
                  aria-invalid={hasLiveInvalidEmail}
                  autoComplete="email"
                  className={inputClass}
                  maxLength={254}
                  onChange={(e) => { setEmail(sanitizeEmailInput(e.target.value)); setError('') }}
                  placeholder="you@email.com"
                  required
                  spellCheck={false}
                  type="email"
                  value={email}
                />
                {hasLiveInvalidEmail ? <p className="text-[10px] text-[#c53030]">Use a valid email format.</p> : null}
                {error ? <p className="text-[10px] text-[#c53030]">{error}</p> : null}
              </label>

              <button
                className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Sending…
                  </span>
                ) : 'Send reset link'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#5b665f]">
              Remember your password?{' '}
              <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
