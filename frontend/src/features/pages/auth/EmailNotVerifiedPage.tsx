'use client'

import { useState } from 'react'
import Link from 'next/link'
import { buildApiUrl } from '../../../lib/api'

type EmailNotVerifiedPageProps = {
  email?: string
}

type ResendVerificationResponse = {
  message?: string
  verificationPreviewUrl?: string
}

export default function EmailNotVerifiedPage({ email = '' }: EmailNotVerifiedPageProps) {
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verificationPreviewUrl, setVerificationPreviewUrl] = useState<string | null>(null)

  async function handleResendVerification() {
    if (!email || isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setSubmitMessage('')
    setSubmitState('idle')

    try {
      const response = await fetch(buildApiUrl('/api/auth/resend-verification'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const payload = (await response.json().catch(() => ({}))) as ResendVerificationResponse

      if (!response.ok) {
        setSubmitState('error')
        setSubmitMessage(payload.message ?? 'Unable to resend verification email right now.')
        return
      }

      setVerificationPreviewUrl(payload.verificationPreviewUrl ?? null)
      setSubmitState('success')
      setSubmitMessage(payload.message ?? 'Verification email sent.')
    } catch {
      setSubmitState('error')
      setSubmitMessage('Unable to reach the verification service. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f4ef] px-4 py-8 sm:px-6 lg:py-12">
      <section className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[#dfe5da] bg-white shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        <div className="bg-gradient-to-r from-[#b45309] via-[#c97316] to-[#df8f26] px-8 py-10 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/85">LocalSupply</p>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">Email not verified</h1>
          <p className="mt-3 max-w-xl text-sm text-white/90 sm:text-base">
            Verify your email address before signing in. We can send you a fresh verification link.
          </p>
        </div>

        <div className="space-y-4 px-8 py-8 text-sm text-[#4b5a4f] sm:text-base">
          <p>{email ? `Verification is still pending for ${email}.` : 'Return to login and try again with the account you registered.'}</p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-[#2f9f4f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={!email || isSubmitting}
              onClick={handleResendVerification}
              type="button"
            >
              {isSubmitting ? 'Sending...' : 'Resend Verification Email'}
            </button>
            <Link
              className="rounded-xl border border-[#d0d8cc] px-5 py-3 text-sm font-semibold text-[#314237] transition hover:border-[#2f9f4f] hover:text-[#2f9f4f]"
              href="/login"
            >
              Back to Login
            </Link>
          </div>
          {submitMessage ? (
            <p className={submitState === 'error' ? 'text-[#c53030]' : 'text-[#2f9f4f]'}>{submitMessage}</p>
          ) : null}
          {verificationPreviewUrl ? (
            <div className="rounded-2xl border border-[#cfe7d5] bg-[#f4fbf6] p-4 text-sm text-[#295237]">
              <p className="font-semibold">Email fallback is active.</p>
              <a
                className="mt-3 inline-flex rounded-xl bg-[#2f9f4f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                href={verificationPreviewUrl}
              >
                Open Verification Link
              </a>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
