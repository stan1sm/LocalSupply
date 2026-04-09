'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import { EMAIL_REGEX, passwordPolicyError, sanitizeEmailInput } from '../../../utils/inputSecurity'

type LoginFormData = {
  email: string
  password: string
}

type LoginFormErrors = Partial<Record<keyof LoginFormData, string>>
type LoginApiResponse = {
  token?: string
  user?: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  email?: string
  message?: string
  errors?: LoginFormErrors
}

const initialFormData: LoginFormData = {
  email: '',
  password: '',
}

const BUYER_STORAGE_KEY = 'localsupply-user'

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<LoginFormData>(initialFormData)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const normalizedEmail = formData.email.trim().toLowerCase()
  const hasLiveInvalidEmail = normalizedEmail.length > 0 && !EMAIL_REGEX.test(normalizedEmail)

  function handleEmailChange(value: string) {
    setFormData((prev) => ({ ...prev, email: sanitizeEmailInput(value) }))
    setErrors((prev) => ({ ...prev, email: undefined }))
    setSubmitMessage('')
    setSubmitState('idle')
  }

  function handlePasswordChange(value: string) {
    setFormData((prev) => ({ ...prev, password: value.slice(0, 128) }))
    setErrors((prev) => ({ ...prev, password: undefined }))
    setSubmitMessage('')
    setSubmitState('idle')
  }

  function validate(data: LoginFormData): LoginFormErrors {
    const nextErrors: LoginFormErrors = {}

    if (!EMAIL_REGEX.test(data.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    const passwordError = passwordPolicyError(data.password)
    if (passwordError) {
      nextErrors.password = passwordError
    }

    return nextErrors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const normalizedData = {
      email: normalizedEmail,
      password: formData.password,
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
      const response = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedData),
      })

      const payload = (await response.json().catch(() => ({}))) as LoginApiResponse

      if (!response.ok) {
        if (payload.errors) {
          setErrors((prev) => ({ ...prev, ...payload.errors }))
        }

        if (response.status === 403 && payload.email) {
          const nextUrl = new URL('/email-not-verified', window.location.origin)
          nextUrl.searchParams.set('email', payload.email)
          router.push(`${nextUrl.pathname}${nextUrl.search}`)
          return
        }

        setSubmitState('error')
        setSubmitMessage(payload.message ?? 'Unable to sign in right now.')
        return
      }

      setErrors({})
      setSubmitState('success')
      setSubmitMessage('Signed in successfully. Redirecting to your dashboard...')
      if (payload.user && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            BUYER_STORAGE_KEY,
            JSON.stringify({
              id: payload.user.id,
              firstName: payload.user.firstName,
              lastName: payload.user.lastName,
              email: payload.user.email,
            }),
          )
          if (payload.token) {
            window.localStorage.setItem('localsupply-token', payload.token)
          }
        } catch {
          // Ignore storage errors and continue.
        }
      }
      router.push('/marketplace/dashboard')
    } catch {
      setSubmitState('error')
      setSubmitMessage('Unable to reach the sign-in service. Please try again.')
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
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/register">
            Create one
          </Link>
        </p>

        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
            Email
            <input
              aria-invalid={Boolean(errors.email) || hasLiveInvalidEmail}
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
            {hasLiveInvalidEmail ? <p className="text-xs text-[#c53030]">Use a valid email format like name@example.com.</p> : null}
            {errors.email ? <p className="text-xs text-[#c53030]">{errors.email}</p> : null}
          </label>

          <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
            Password
            <input
              aria-invalid={Boolean(errors.password)}
              autoComplete="current-password"
              className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
              maxLength={128}
              name="password"
              onChange={(event) => handlePasswordChange(event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={formData.password}
            />
            {errors.password ? <p className="text-xs text-[#c53030]">{errors.password}</p> : null}
          </label>

          <div className="flex justify-end">
            <Link className="text-xs font-medium text-[#2f9f4f] hover:text-[#25813f]" href="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <button
            className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
          {submitMessage ? (
            <p
              aria-live="polite"
              className={`text-center text-xs ${submitState === 'error' ? 'text-[#c53030]' : submitState === 'success' ? 'text-[#2f9f4f]' : 'text-[#5b665f]'}`}
            >
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
