import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  EMAIL_REGEX,
  HUMAN_NAME_REGEX,
  getPasswordRequirementStatus,
  passwordPolicyError,
  sanitizeEmailInput,
  sanitizeTextInput,
} from '../../utils/inputSecurity'

type RegisterFormData = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
}

type RegisterFormErrors = Partial<Record<keyof RegisterFormData, string>>

const initialFormData: RegisterFormData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  termsAccepted: false,
}

export default function RegisterPage() {
  const [formData, setFormData] = useState<RegisterFormData>(initialFormData)
  const [errors, setErrors] = useState<RegisterFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const passwordRequirements = getPasswordRequirementStatus(formData.password)
  const hasLivePasswordMismatch =
    (formData.password.length > 0 || formData.confirmPassword.length > 0) && formData.confirmPassword !== formData.password

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      setSubmitMessage('Please fix the highlighted fields.')
      return
    }

    setSubmitMessage('Validation passed. This form is ready to connect to your API.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#dfe5da] bg-white shadow-[0_20px_50px_rgba(17,24,39,0.08)] lg:grid-cols-[1.05fr_1fr]">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#2fa04f] via-[#2a9448] to-[#1f7b3a] p-8 text-white sm:p-10">
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-white/10" />
          <p className="relative text-sm font-semibold uppercase tracking-[0.2em] text-white/85">LocalSupply</p>
          <h1 className="relative mt-6 text-3xl font-extrabold leading-tight sm:text-4xl">
            Fresh essentials,
            <br />
            delivered fast.
          </h1>
          <p className="relative mt-4 max-w-sm text-sm text-white/85 sm:text-base">
            Create your account to browse local groceries, manage orders, and keep your list organized in one place.
          </p>
          <div className="relative mt-8 space-y-3 text-sm text-white/90">
            <p>Next-day local delivery windows</p>
            <p>Simple reorder flow for weekly staples</p>
            <p>Real-time stock from trusted suppliers</p>
          </div>
        </div>

        <div className="p-6 sm:p-8 lg:p-10">
          <h2 className="text-2xl font-bold text-[#1b2a1f]">Create your account</h2>
          <p className="mt-2 text-sm text-[#5b665f]">
            Already registered?{' '}
            <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" to="/login">
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
              <ul className="mt-2 space-y-1 text-xs">
                <li className={passwordRequirements.hasUppercase ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one uppercase letter</li>
                <li className={passwordRequirements.hasLowercase ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one lowercase letter</li>
                <li className={passwordRequirements.hasNumber ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one number</li>
                <li className={passwordRequirements.hasSpecial ? 'text-[#2f9f4f]' : 'text-[#6b7280]'}>At least one special character</li>
              </ul>
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
                }}
                required
                type="checkbox"
              />
              <span>I agree to the terms and privacy policy.</span>
            </label>
            {errors.termsAccepted ? <p className="text-xs text-[#c53030]">{errors.termsAccepted}</p> : null}

            <button
              className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35"
              type="submit"
            >
              Create Account
            </button>
            {submitMessage ? <p className="text-center text-xs text-[#5b665f]">{submitMessage}</p> : null}
          </form>

          <p className="mt-6 text-center text-sm text-[#5b665f]">
            Are you a business?{' '}
            <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" to="/supplier/register">
              Go to supplier registration
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
