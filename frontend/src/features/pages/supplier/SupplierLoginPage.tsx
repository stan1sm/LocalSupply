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

type SupplierLoginResponse = {
  message?: string
  token?: string
  supplier?: {
    id: string
    businessName: string
    contactName: string
    email: string
    address: string
  }
  errors?: LoginFormErrors
}

const initialFormData: LoginFormData = {
  email: '',
  password: '',
}

export default function SupplierLoginPage() {
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
      nextErrors.email = 'Enter a valid business email.'
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
      const response = await fetch(buildApiUrl('/api/suppliers/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedData),
      })
      const payload = (await response.json().catch(() => ({}))) as SupplierLoginResponse

      if (!response.ok) {
        if (payload.errors) {
          setErrors((prev) => ({ ...prev, ...payload.errors }))
        }
        setSubmitState('error')
        setSubmitMessage(payload.message ?? 'Unable to sign in right now.')
        return
      }

      if (payload.supplier) {
        try {
          window.localStorage.setItem('localsupply-supplier', JSON.stringify(payload.supplier))
          if (payload.token) {
            window.localStorage.setItem('localsupply-supplier-token', payload.token)
          }
        } catch {
          // ignore storage issues
        }
      }

      setErrors({})
      setSubmitState('success')
      setSubmitMessage('Signed in successfully. Redirecting to your supplier dashboard...')
      router.push('/supplier/dashboard')
    } catch {
      setSubmitState('error')
      setSubmitMessage('Unable to reach the sign-in service. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-6 sm:px-6 lg:py-8">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-[#dfe5da] bg-white shadow-[0_20px_50px_rgba(17,24,39,0.08)] lg:max-h-[88vh] lg:grid-cols-[1.05fr_1fr] lg:grid-rows-[minmax(0,1fr)]">
        <div className="relative min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-br from-[#1f7b3a] via-[#2a9448] to-[#2fa04f] p-6 text-white sm:p-8">
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-white/10" />
          <p className="relative text-sm font-semibold uppercase tracking-[0.2em] text-white">LocalSupply</p>
          <h1 className="relative mt-4 text-2xl font-extrabold leading-tight text-white sm:text-3xl">
            Supplier sign in
          </h1>
          <p className="relative mt-3 max-w-sm text-sm text-white/95">
            Access your supplier dashboard to update products, pricing and orders.
          </p>
          <div className="relative mt-6 space-y-2 text-sm text-white/95">
            <p>Use the same business email you registered with.</p>
            <p>Passwords follow the same security rules as buyer accounts.</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-y-auto p-5 sm:p-6 lg:p-8">
          <div className="mb-3 flex items-center justify-between text-xs">
            <button
              className="flex items-center gap-1 rounded-full border-2 border-[#c7d2c2] bg-white px-3 py-1.5 font-medium text-[#1f2937] shadow-sm transition hover:border-[#2f9f4f] hover:text-[#1f7b3a]"
              onClick={() => router.push('/')}
              type="button"
            >
              <span aria-hidden="true">←</span>
              <span>Back to homepage</span>
            </button>
            <Link className="hidden text-xs font-semibold text-[#1f7b3a] underline underline-offset-2 hover:no-underline sm:inline" href="/login">
              Buyer login
            </Link>
          </div>
          <h2 className="text-xl font-bold text-[#1b2a1f]">Welcome supplier</h2>
          <p className="mt-1.5 text-sm text-[#5b665f]">
            Need to create a supplier account?{' '}
            <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/supplier/register">
              Go to supplier registration
            </Link>
          </p>

          <form className="mt-5 space-y-3.5" noValidate onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium text-[#2e3b31]">
              Business email
              <input
                aria-invalid={Boolean(errors.email) || hasLiveInvalidEmail}
                autoComplete="email"
                className="w-full rounded-xl border border-[#d6ddd2] bg-[#f9fbf8] px-4 py-3 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                maxLength={254}
                name="email"
                onChange={(event) => handleEmailChange(event.target.value)}
                placeholder="orders@yourbusiness.com"
                required
                spellCheck={false}
                type="email"
                value={formData.email}
              />
              <p className={`text-xs ${hasLiveInvalidEmail ? 'text-[#c53030]' : 'text-[#5b665f]'}`}>
                {hasLiveInvalidEmail ? 'Use a valid email format like name@business.no.' : 'Use the email address tied to your supplier account.'}
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
              <p className="mt-2 text-xs text-[#5b665f]">Password must be at least 8 characters.</p>
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

          <p className="mt-5 text-center text-sm text-[#5b665f]">
            Need a regular buyer account instead?{' '}
            <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/login">
              Go to user sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}

