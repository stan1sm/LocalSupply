'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import {
  EMAIL_REGEX,
  getPasswordRequirementStatus,
  passwordPolicyError,
  sanitizeEmailInput,
} from '../../../utils/inputSecurity'

type LoginFormData = {
  email: string
  password: string
}

type LoginFormErrors = Partial<Record<keyof LoginFormData, string>>
type LoginApiResponse = {
  message?: string
  errors?: LoginFormErrors
}

const initialFormData: LoginFormData = {
  email: '',
  password: '',
}

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<LoginFormData>(initialFormData)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const normalizedEmail = formData.email.trim().toLowerCase()
  const hasLiveInvalidEmail = normalizedEmail.length > 0 && !EMAIL_REGEX.test(normalizedEmail)
  const passwordRequirements = getPasswordRequirementStatus(formData.password)

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

        setSubmitState('error')
        setSubmitMessage(payload.message ?? 'Unable to sign in right now.')
        return
      }

      setErrors({})
      setSubmitState('success')
      setSubmitMessage('Signed in successfully. Redirecting to your dashboard...')
      router.push('/marketplace/dashboard')
    } catch {
      setSubmitState('error')
      setSubmitMessage('Unable to reach the sign-in service. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#dfe5da] bg-white shadow-[0_20px_50px_rgba(17,24,39,0.08)] lg:grid-cols-[1.05fr_1fr]">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#1f7b3a] via-[#2a9448] to-[#2fa04f] p-8 text-white sm:p-10">
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-white/10" />
          <p className="relative text-sm font-semibold uppercase tracking-[0.2em] text-white/85">LocalSupply</p>
          <h1 className="relative mt-6 text-3xl font-extrabold leading-tight sm:text-4xl">
            Sign in to keep
            <br />
            your orders moving.
          </h1>
          <p className="relative mt-4 max-w-sm text-sm text-white/85 sm:text-base">
            Access saved carts, order tracking, and local supplier pricing with the same secure account you used to register.
          </p>
          <div className="relative mt-8 space-y-3 text-sm text-white/90">
            <p>Use a valid email format like name@example.com</p>
            <p>Passwords must meet the platform security requirements</p>
            <p>Buyer accounts route straight to the marketplace dashboard</p>
          </div>
        </div>

        <div className="p-6 sm:p-8 lg:p-10">
          <h2 className="text-2xl font-bold text-[#1b2a1f]">Welcome back</h2>
          <p className="mt-2 text-sm text-[#5b665f]">
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
              <p className={`text-xs ${hasLiveInvalidEmail ? 'text-[#c53030]' : 'text-[#5b665f]'}`}>
                {hasLiveInvalidEmail ? 'Use a valid email format like name@example.com.' : 'Use the email address tied to your account.'}
              </p>
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
                placeholder="Enter your secure password"
                required
                type="password"
                value={formData.password}
              />
              <ul className="mt-2 space-y-1 text-xs">
                <li className={passwordRequirements.hasMinLength ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least 8 characters</li>
                <li className={passwordRequirements.hasUppercase ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one uppercase letter</li>
                <li className={passwordRequirements.hasLowercase ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one lowercase letter</li>
                <li className={passwordRequirements.hasNumber ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one number</li>
                <li className={passwordRequirements.hasSpecial ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one special character</li>
              </ul>
              {errors.password ? <p className="text-xs text-[#c53030]">{errors.password}</p> : null}
            </label>

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
                className={`text-center text-xs ${submitState === 'error' ? 'text-[#c53030]' : 'text-[#5b665f]'} ${
                  submitState === 'success' ? 'text-[#2f9f4f]' : ''
                }`}
              >
                {submitMessage}
              </p>
            ) : null}
          </form>

          <p className="mt-6 text-center text-sm text-[#5b665f]">
            Registering as a supplier?{' '}
            <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/supplier/register">
              Go to supplier registration
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
