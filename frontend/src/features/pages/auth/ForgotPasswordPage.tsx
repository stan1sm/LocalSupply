'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import { EMAIL_REGEX, sanitizeEmailInput } from '../../../utils/inputSecurity'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const normalizedEmail = email.trim().toLowerCase()
  const hasLiveInvalidEmail = normalizedEmail.length > 0 && !EMAIL_REGEX.test(normalizedEmail)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError('Enter a valid email address.')
      return
    }

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
            <h2 className="text-xl font-bold text-[#1b2a1f]">Check your email</h2>
            <p className="mt-2 text-sm text-[#5b665f]">
              If an account exists for <span className="font-medium text-[#1f2937]">{normalizedEmail}</span>, we sent a password reset link. Check your inbox and spam folder.
            </p>
            <p className="mt-4 text-sm text-[#5b665f]">
              The link expires in 1 hour.
            </p>
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
              Enter your email and we'll send you a reset link.
            </p>

            <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
              <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
                Email
                <input
                  aria-invalid={hasLiveInvalidEmail}
                  autoComplete="email"
                  className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                  maxLength={254}
                  onChange={(e) => { setEmail(sanitizeEmailInput(e.target.value)); setError('') }}
                  placeholder="you@email.com"
                  required
                  spellCheck={false}
                  type="email"
                  value={email}
                />
                {hasLiveInvalidEmail ? <p className="text-xs text-[#c53030]">Use a valid email format.</p> : null}
                {error ? <p className="text-xs text-[#c53030]">{error}</p> : null}
              </label>

              <button
                className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#5b665f]">
              Remember your password?{' '}
              <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/login">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
