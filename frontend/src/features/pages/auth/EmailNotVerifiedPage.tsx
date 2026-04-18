'use client'

import { useState } from 'react'
import Link from 'next/link'
import { buildApiUrl } from '../../../lib/api'

type EmailNotVerifiedPageProps = { email?: string }
type ResendVerificationResponse = { message?: string; verificationPreviewUrl?: string }

export default function EmailNotVerifiedPage({ email = '' }: EmailNotVerifiedPageProps) {
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitIsError, setSubmitIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verificationPreviewUrl, setVerificationPreviewUrl] = useState<string | null>(null)

  async function handleResend() {
    if (!email || isSubmitting) return
    setIsSubmitting(true)
    setSubmitMessage('')

    try {
      const response = await fetch(buildApiUrl('/api/auth/resend-verification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = (await response.json().catch(() => ({}))) as ResendVerificationResponse

      if (!response.ok) {
        setSubmitIsError(true)
        setSubmitMessage(payload.message ?? 'Unable to resend verification email right now.')
        return
      }

      setVerificationPreviewUrl(payload.verificationPreviewUrl ?? null)
      setSubmitIsError(false)
      setSubmitMessage(payload.message ?? 'Verification email sent. Check your inbox.')
    } catch {
      setSubmitIsError(true)
      setSubmitMessage('Unable to reach the verification service. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#fffbeb]">
          <svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-[#1b2a1f]">Email not verified</h1>
        <p className="mt-2 text-sm text-[#5b665f]">
          {email
            ? <>Verification is still pending for <span className="font-medium text-[#1f2937]">{email}</span>. We can send you a fresh link.</>
            : 'Return to login and try again with the account you registered.'}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!email || isSubmitting}
            onClick={handleResend}
            type="button"
          >
            {isSubmitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Sending…
              </>
            ) : 'Resend verification email'}
          </button>
          <Link
            className="block w-full rounded-xl border border-[#d4ddcf] px-4 py-3 text-center text-sm font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
            href="/login"
          >
            Back to sign in
          </Link>
        </div>

        {submitMessage ? (
          <p className={`mt-3 text-center text-[10px] ${submitIsError ? 'text-[#c53030]' : 'text-[#2f9f4f]'}`}>
            {submitMessage}
          </p>
        ) : null}

        {verificationPreviewUrl ? (
          <div className="mt-4 rounded-xl border border-[#a3d4b3] bg-[#f0faf4] px-4 py-3">
            <p className="text-xs font-semibold text-[#1a5c2e]">Email fallback is active</p>
            <a
              className="mt-2 inline-flex items-center rounded-lg bg-[#2f9f4f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#25813f]"
              href={verificationPreviewUrl}
            >
              Open verification link
            </a>
          </div>
        ) : null}
      </div>
    </main>
  )
}
