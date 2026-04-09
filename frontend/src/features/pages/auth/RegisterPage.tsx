'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import {
  EMAIL_REGEX,
  HUMAN_NAME_REGEX,
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

const initialFormData: RegisterFormData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  termsAccepted: false,
}

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<RegisterFormData>(initialFormData)
  const [errors, setErrors] = useState<RegisterFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasLivePasswordMismatch =
    (formData.password.length > 0 || formData.confirmPassword.length > 0) && formData.confirmPassword !== formData.password

  function handleTextChange(field: 'firstName' | 'lastName', value: string) {
    setFormData((prev) => ({ ...prev, [field]: sanitizeTextInput(value, 50) }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitMessage('')
    setSubmitState('idle')
  }

  function handleEmailChange(value: string) {
    setFormData((prev) => ({ ...prev, email: sanitizeEmailInput(value) }))
    setErrors((prev) => ({ ...prev, email: undefined }))
    setSubmitMessage('')
    setSubmitState('idle')
  }

  function handlePasswordChange(field: 'password' | 'confirmPassword', value: string) {
    setFormData((prev) => ({ ...prev, [field]: value.slice(0, 128) }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitMessage('')
    setSubmitState('idle')
  }

  function validate(data: RegisterFormData): RegisterFormErrors {
    const nextErrors: RegisterFormErrors = {}
    const firstName = data.firstName.trim()
    const lastName = data.lastName.trim()
    const email = data.email.trim().toLowerCase()

    if (!HUMAN_NAME_REGEX.test(firstName)) {
      nextErrors.firstName = 'Use 2-50 letters, spaces, apostrophes, or hyphens.'
    }

    if (!HUMAN_NAME_REGEX.test(lastName)) {
      nextErrors.lastName = 'Use 2-50 letters, spaces, apostrophes, or hyphens.'
    }

    if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    const passwordError = passwordPolicyError(data.password)
    if (passwordError) {
      nextErrors.password = passwordError
    }

    if (data.confirmPassword !== data.password) {
      nextErrors.confirmPassword = "Passwords don't match."
    }

    if (!data.termsAccepted) {
      nextErrors.termsAccepted = 'You must accept the terms to continue.'
    }

    return nextErrors
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

    const nextErrors = validate(normalizedData)
    setErrors(nextErrors)
    setFormData(normalizedData)

    if (Object.keys(nextErrors).length > 0) {
      setSubmitState('error')
      setSubmitMessage('Please fix the highlighted fields.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(buildApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedData),
      })

      const payload = (await response.json().catch(() => ({}))) as RegisterApiErrorResponse

      if (!response.ok) {
        if (payload.errors) {
          setErrors((prev) => ({ ...prev, ...payload.errors }))
        }

        setSubmitState('error')
        setSubmitMessage(payload.message ?? 'Unable to create account right now.')
        return
      }

      setErrors({})
      setFormData(initialFormData)
      const nextUrl = new URL('/check-email', window.location.origin)
      if (payload.verificationPreviewUrl) {
        nextUrl.searchParams.set('verificationPreviewUrl', payload.verificationPreviewUrl)
      }
      router.push(`${nextUrl.pathname}${nextUrl.search}`)
    } catch {
      setSubmitState('error')
      setSubmitMessage('Unable to reach the registration service. Please try again.')
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
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/login">
            Sign in
          </Link>
        </p>

          <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-[#2e3b31]">
                First Name
                <input
                  aria-invalid={Boolean(errors.firstName)}
                  autoComplete="given-name"
                  className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                  maxLength={50}
                  name="firstName"
                  onChange={(event) => handleTextChange('firstName', event.target.value)}
                  placeholder="Ava"
                  required
                  type="text"
                  value={formData.firstName}
                />
                {errors.firstName ? <p className="text-xs text-[#c53030]">{errors.firstName}</p> : null}
              </label>
              <label className="space-y-2 text-sm font-medium text-[#2e3b31]">
                Last Name
                <input
                  aria-invalid={Boolean(errors.lastName)}
                  autoComplete="family-name"
                  className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                  maxLength={50}
                  name="lastName"
                  onChange={(event) => handleTextChange('lastName', event.target.value)}
                  placeholder="Johnson"
                  required
                  type="text"
                  value={formData.lastName}
                />
                {errors.lastName ? <p className="text-xs text-[#c53030]">{errors.lastName}</p> : null}
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
              Email
              <input
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                maxLength={254}
                name="email"
                onChange={(event) => handleEmailChange(event.target.value)}
                placeholder="you@email.com"
                required
                spellCheck={false}
                type="email"
                value={formData.email}
              />
              {errors.email ? <p className="text-xs text-[#c53030]">{errors.email}</p> : null}
            </label>

            <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
              Password
              <input
                aria-invalid={Boolean(errors.password)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                maxLength={128}
                name="password"
                onChange={(event) => handlePasswordChange('password', event.target.value)}
                placeholder="Create a secure password"
                required
                type="password"
                value={formData.password}
              />
              <p className="mt-2 text-xs text-[#5b665f]">Use at least 8 characters. Longer is usually safer.</p>
              {errors.password ? <p className="text-xs text-[#c53030]">{errors.password}</p> : null}
            </label>

            <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
              Confirm Password
              <input
                aria-invalid={Boolean(errors.confirmPassword) || hasLivePasswordMismatch}
                autoComplete="new-password"
                className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                maxLength={128}
                name="confirmPassword"
                onChange={(event) => handlePasswordChange('confirmPassword', event.target.value)}
                placeholder="Repeat your password"
                required
                type="password"
                value={formData.confirmPassword}
              />
              {hasLivePasswordMismatch ? <p className="text-xs text-[#c53030]">Passwords don't match.</p> : null}
              {!hasLivePasswordMismatch && errors.confirmPassword ? (
                <p className="text-xs text-[#c53030]">{errors.confirmPassword}</p>
              ) : null}
            </label>

            <label className="flex items-start gap-3 text-sm text-[#516056]">
              <input
                checked={formData.termsAccepted}
                className="mt-1 h-4 w-4 rounded border-[#c7d2c2] text-[#2f9f4f] focus:ring-[#2f9f4f]/40"
                onChange={(event) => {
                  setFormData((prev) => ({ ...prev, termsAccepted: event.target.checked }))
                  setErrors((prev) => ({ ...prev, termsAccepted: undefined }))
                  setSubmitMessage('')
                  setSubmitState('idle')
                }}
                required
                type="checkbox"
              />
              <span>I agree to the terms and privacy policy.</span>
            </label>
            {errors.termsAccepted ? <p className="text-xs text-[#c53030]">{errors.termsAccepted}</p> : null}

            <button
              className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>
            {submitMessage ? (
              <p
                aria-live="polite"
                className={`text-center text-xs ${submitState === 'error' ? 'text-[#c53030]' : 'text-[#5b665f]'} ${
                  submitState === 'success' ? 'text-[#2f9f4f]' : ''
                }`}
              >
                {submitMessage}
              </p>
            ) : null}
          </form>

        <p className="mt-6 text-center text-sm text-[#5b665f]">
          Are you a business?{' '}
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/supplier/register">
            Supplier registration
          </Link>
        </p>
      </div>
    </main>
  )
}
