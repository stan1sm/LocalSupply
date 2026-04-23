'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import { EMAIL_REGEX, passwordPolicyError, sanitizeEmailInput } from '../../../utils/inputSecurity'

type LoginFormData = { email: string; password: string }
type LoginFormErrors = Partial<Record<keyof LoginFormData, string>>
type LoginApiResponse = {
  token?: string
  user?: { id: string; firstName: string; lastName: string; email: string }
  email?: string
  message?: string
  errors?: LoginFormErrors
}

const BUYER_STORAGE_KEY = 'localsupply-user'

const inputClass =
  'w-full rounded-lg border border-[#d6ddd2] bg-[#f9fbf8] px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20'
const labelClass = 'block space-y-1 text-xs font-medium text-[#2e3b31]'
const errorClass = 'text-[10px] text-[#c53030]'

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' })
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitIsError, setSubmitIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const normalizedEmail = formData.email.trim().toLowerCase()
  const hasLiveInvalidEmail = normalizedEmail.length > 0 && !EMAIL_REGEX.test(normalizedEmail)

  function handleEmailChange(value: string) {
    setFormData((prev) => ({ ...prev, email: sanitizeEmailInput(value) }))
    setErrors((prev) => ({ ...prev, email: undefined }))
    setSubmitMessage('')
  }

  function handlePasswordChange(value: string) {
    setFormData((prev) => ({ ...prev, password: value.slice(0, 128) }))
    setErrors((prev) => ({ ...prev, password: undefined }))
    setSubmitMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const normalizedData = { email: normalizedEmail, password: formData.password }
    const nextErrors: LoginFormErrors = {}
    if (!EMAIL_REGEX.test(normalizedData.email)) nextErrors.email = 'Enter a valid email address.'
    const pErr = passwordPolicyError(normalizedData.password)
    if (pErr) nextErrors.password = pErr
    setErrors(nextErrors)
    setFormData(normalizedData)

    if (Object.keys(nextErrors).length > 0) {
      setSubmitMessage('Please fix the highlighted fields.')
      setSubmitIsError(true)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedData),
      })
      const payload = (await response.json().catch(() => ({}))) as LoginApiResponse

      if (!response.ok) {
        if (payload.errors) setErrors((prev) => ({ ...prev, ...payload.errors }))
        if (response.status === 403 && payload.email) {
          const nextUrl = new URL('/email-not-verified', window.location.origin)
          nextUrl.searchParams.set('email', payload.email)
          router.push(`${nextUrl.pathname}${nextUrl.search}`)
          return
        }
        setSubmitMessage(payload.message ?? 'Unable to sign in right now.')
        setSubmitIsError(true)
        return
      }

      if (payload.user && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(BUYER_STORAGE_KEY, JSON.stringify({
            id: payload.user.id,
            firstName: payload.user.firstName,
            lastName: payload.user.lastName,
            email: payload.user.email,
          }))
          if (payload.token) window.localStorage.setItem('localsupply-token', payload.token)
        } catch { /* ignore */ }
      }
      router.push('/marketplace/dashboard')
    } catch {
      setSubmitMessage('Unable to reach the sign-in service. Please try again.')
      setSubmitIsError(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
        <div className="mb-6 flex items-center justify-between">
          <button
            className="flex items-center gap-1 rounded-full border-2 border-[#c7d2c2] bg-white px-3 py-1.5 text-xs font-medium text-[#1f2937] shadow-sm transition hover:border-[#2f9f4f] hover:text-[#1f7b3a]"
            onClick={() => router.push('/')}
            type="button"
          >
            <span aria-hidden="true">←</span>
            <span>Back to homepage</span>
          </button>
          <Link className="text-xs font-semibold text-[#1f7b3a] underline underline-offset-2 hover:no-underline" href="/supplier/login">
            Supplier login
          </Link>
        </div>

        <h2 className="text-xl font-bold text-[#1b2a1f]">Welcome back</h2>
        <p className="mt-1.5 text-sm text-[#5b665f]">
          Need an account?{' '}
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/register">Create one</Link>
        </p>

        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          <label className={labelClass}>
            Email
            <input
              aria-invalid={Boolean(errors.email) || hasLiveInvalidEmail}
              autoComplete="email"
              className={inputClass}
              maxLength={254}
              name="email"
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="you@email.com"
              required
              spellCheck={false}
              type="email"
              value={formData.email}
            />
            {hasLiveInvalidEmail ? <p className={errorClass}>Use a valid email format like name@example.com.</p> : null}
            {errors.email ? <p className={errorClass}>{errors.email}</p> : null}
          </label>

          <label className={labelClass}>
            Password
            <div className="relative">
              <input
                aria-invalid={Boolean(errors.password)}
                autoComplete="current-password"
                className={`${inputClass} pr-9`}
                maxLength={128}
                name="password"
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="Enter your password"
                required
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                type="button"
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password ? <p className={errorClass}>{errors.password}</p> : null}
          </label>

          <div className="flex justify-end">
            <Link className="text-xs font-medium text-[#2f9f4f] hover:text-[#25813f]" href="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <button
            className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in…
              </span>
            ) : 'Sign in'}
          </button>

          {submitMessage ? (
            <p aria-live="polite" className={`text-center text-[10px] ${submitIsError ? 'text-[#c53030]' : 'text-[#2f9f4f]'}`}>
              {submitMessage}
            </p>
          ) : null}
        </form>

        <p className="mt-6 text-center text-sm text-[#5b665f]">
          Registering as a supplier?{' '}
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/supplier/register">
            Supplier registration
          </Link>
        </p>
      </div>
    </main>
  )
}
