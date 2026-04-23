'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import {
  EMAIL_REGEX,
  HUMAN_NAME_REGEX,
  getPasswordRequirementStatus,
  passwordPolicyError,
  sanitizeEmailInput,
  sanitizeTextInput,
} from '../../../utils/inputSecurity'

type RegisterFormData = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
}
type RegisterFormErrors = Partial<Record<keyof RegisterFormData, string>>
type RegisterApiErrorResponse = {
  deliveryMode?: 'email' | 'fallback'
  message?: string
  verificationPreviewUrl?: string
  errors?: RegisterFormErrors
}

const inputClass =
  'w-full rounded-lg border border-[#d6ddd2] bg-[#f9fbf8] px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20'
const labelClass = 'block space-y-1 text-xs font-medium text-[#2e3b31]'
const errorClass = 'text-[10px] text-[#c53030]'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '', termsAccepted: false,
  })
  const [errors, setErrors] = useState<RegisterFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitIsError, setSubmitIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const hasLivePasswordMismatch =
    (formData.password.length > 0 || formData.confirmPassword.length > 0) &&
    formData.confirmPassword !== formData.password
  const passwordRequirements = getPasswordRequirementStatus(formData.password)

  function handleTextChange(field: 'firstName' | 'lastName', value: string) {
    setFormData((prev) => ({ ...prev, [field]: sanitizeTextInput(value, 50) }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitMessage('')
  }

  function handleEmailChange(value: string) {
    setFormData((prev) => ({ ...prev, email: sanitizeEmailInput(value) }))
    setErrors((prev) => ({ ...prev, email: undefined }))
    setSubmitMessage('')
  }

  function handlePasswordChange(field: 'password' | 'confirmPassword', value: string) {
    setFormData((prev) => ({ ...prev, [field]: value.slice(0, 128) }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const normalizedData = {
      ...formData,
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim().toLowerCase(),
    }

    const nextErrors: RegisterFormErrors = {}
    if (!HUMAN_NAME_REGEX.test(normalizedData.firstName)) nextErrors.firstName = 'Use 2–50 letters, spaces, apostrophes, or hyphens.'
    if (!HUMAN_NAME_REGEX.test(normalizedData.lastName)) nextErrors.lastName = 'Use 2–50 letters, spaces, apostrophes, or hyphens.'
    if (!EMAIL_REGEX.test(normalizedData.email)) nextErrors.email = 'Enter a valid email address.'
    const pErr = passwordPolicyError(normalizedData.password)
    if (pErr) nextErrors.password = pErr
    if (normalizedData.confirmPassword !== normalizedData.password) nextErrors.confirmPassword = "Passwords don't match."
    if (!normalizedData.termsAccepted) nextErrors.termsAccepted = 'You must accept the terms to continue.'

    setErrors(nextErrors)
    setFormData(normalizedData)

    if (Object.keys(nextErrors).length > 0) {
      setSubmitMessage('Please fix the highlighted fields.')
      setSubmitIsError(true)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(buildApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedData),
      })
      const payload = (await response.json().catch(() => ({}))) as RegisterApiErrorResponse

      if (!response.ok) {
        if (payload.errors) setErrors((prev) => ({ ...prev, ...payload.errors }))
        setSubmitMessage(payload.message ?? 'Unable to create account right now.')
        setSubmitIsError(true)
        return
      }

      const nextUrl = new URL('/check-email', window.location.origin)
      if (payload.verificationPreviewUrl) nextUrl.searchParams.set('verificationPreviewUrl', payload.verificationPreviewUrl)
      router.push(`${nextUrl.pathname}${nextUrl.search}`)
    } catch {
      setSubmitMessage('Unable to reach the registration service. Please try again.')
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

        <h2 className="text-xl font-bold text-[#1b2a1f]">Create your account</h2>
        <p className="mt-1.5 text-sm text-[#5b665f]">
          Already registered?{' '}
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/login">Sign in</Link>
        </p>

        <a
          href={buildApiUrl('/api/auth/vipps')}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#FF5B24] px-4 py-3 font-bold text-white transition hover:bg-[#e5521f]"
        >
          Register with&nbsp;
          <svg viewBox="0 0 68 22" className="h-[1.1em] shrink-0" fill="white" xmlns="http://www.w3.org/2000/svg" aria-label="Vipps">
            <path d="M0 1h4.8l4.4 8.8L13.6 1H19L10.2 19 1 1z"/>
            <ellipse cx="9.8" cy="11.5" rx="2.2" ry="1.4" fill="#FF5B24"/>
            <rect x="22" y="1" width="3.5" height="3.5" rx="1.75"/>
            <rect x="22" y="6.5" width="3.5" height="12.5" rx="1"/>
            <path d="M29 6.5h3.5v2a4.5 4.5 0 0 1 3.8-2.2c3 0 5.2 2.4 5.2 6.4s-2.2 6.5-5.3 6.5a4.3 4.3 0 0 1-3.7-2v6.3H29zm3.5 6.1c0 2.1 1.1 3.4 2.8 3.4s2.8-1.3 2.8-3.4-1.1-3.4-2.8-3.4-2.8 1.3-2.8 3.4z"/>
            <path d="M44 6.5h3.5v2a4.5 4.5 0 0 1 3.8-2.2c3 0 5.2 2.4 5.2 6.4s-2.2 6.5-5.3 6.5a4.3 4.3 0 0 1-3.7-2v6.3H44zm3.5 6.1c0 2.1 1.1 3.4 2.8 3.4s2.8-1.3 2.8-3.4-1.1-3.4-2.8-3.4-2.8 1.3-2.8 3.4z"/>
            <path d="M58.2 15.4c.8.8 2 1.3 3.2 1.3 1 0 1.7-.4 1.7-1s-.5-.9-2-1.2c-2.6-.6-4-1.6-4-3.6 0-2.2 1.9-3.7 4.7-3.7 1.7 0 3.2.5 4.4 1.4l-1.7 2.3c-.8-.6-1.7-1-2.7-1-.9 0-1.5.4-1.5.9s.4.8 1.9 1.1c2.7.6 4.1 1.7 4.1 3.7 0 2.3-2 3.8-5 3.8-1.9 0-3.6-.6-4.9-1.7z"/>
          </svg>
        </a>

        <div className="relative mt-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#e5ece2]" />
          <span className="text-xs text-[#9ca3af]">or register with email</span>
          <div className="h-px flex-1 bg-[#e5ece2]" />
        </div>

        <form className="mt-5 space-y-4" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              First name
              <input
                aria-invalid={Boolean(errors.firstName)}
                autoComplete="given-name"
                className={inputClass}
                maxLength={50}
                name="firstName"
                onChange={(e) => handleTextChange('firstName', e.target.value)}
                placeholder="Ava"
                required
                type="text"
                value={formData.firstName}
              />
              {errors.firstName ? <p className={errorClass}>{errors.firstName}</p> : null}
            </label>
            <label className={labelClass}>
              Last name
              <input
                aria-invalid={Boolean(errors.lastName)}
                autoComplete="family-name"
                className={inputClass}
                maxLength={50}
                name="lastName"
                onChange={(e) => handleTextChange('lastName', e.target.value)}
                placeholder="Johnson"
                required
                type="text"
                value={formData.lastName}
              />
              {errors.lastName ? <p className={errorClass}>{errors.lastName}</p> : null}
            </label>
          </div>

          <label className={labelClass}>
            Email
            <input
              aria-invalid={Boolean(errors.email)}
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
            {errors.email ? <p className={errorClass}>{errors.email}</p> : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Password
              <div className="relative">
                <input
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="new-password"
                  className={`${inputClass} pr-9`}
                  maxLength={128}
                  name="password"
                  onChange={(e) => handlePasswordChange('password', e.target.value)}
                  placeholder="Create a strong password"
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
              {errors.password ? <p className={errorClass}>{errors.password}</p> : null}
            </label>

            <label className={labelClass}>
              Confirm password
              <div className="relative">
                <input
                  aria-invalid={Boolean(errors.confirmPassword) || hasLivePasswordMismatch}
                  autoComplete="new-password"
                  className={`${inputClass} pr-9`}
                  maxLength={128}
                  name="confirmPassword"
                  onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                  placeholder="Repeat your password"
                  required
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                />
                <button
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                  type="button"
                >
                  {showConfirmPassword ? (
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
              {hasLivePasswordMismatch ? <p className={errorClass}>Passwords don&apos;t match.</p> : null}
              {!hasLivePasswordMismatch && errors.confirmPassword ? <p className={errorClass}>{errors.confirmPassword}</p> : null}
            </label>
          </div>

          <label className="flex items-start gap-3 text-xs text-[#516056]">
            <input
              checked={formData.termsAccepted}
              className="mt-0.5 h-4 w-4 rounded border-[#c7d2c2] text-[#2f9f4f] focus:ring-[#2f9f4f]/40"
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, termsAccepted: e.target.checked }))
                setErrors((prev) => ({ ...prev, termsAccepted: undefined }))
                setSubmitMessage('')
              }}
              required
              type="checkbox"
            />
            <span>I agree to the terms and privacy policy.</span>
          </label>
          {errors.termsAccepted ? <p className={errorClass}>{errors.termsAccepted}</p> : null}

          <button
            className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating account…
              </span>
            ) : 'Create account'}
          </button>

          {submitMessage ? (
            <p aria-live="polite" className={`text-center text-[10px] ${submitIsError ? 'text-[#c53030]' : 'text-[#2f9f4f]'}`}>
              {submitMessage}
            </p>
          ) : null}
        </form>

        <p className="mt-6 text-center text-sm text-[#5b665f]">
          Registering as a business?{' '}
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/supplier/register">
            Supplier registration
          </Link>
        </p>
      </div>
    </main>
  )
}
