import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ADDRESS_REGEX,
  BUSINESS_NAME_REGEX,
  EMAIL_REGEX,
  HUMAN_NAME_REGEX,
  PHONE_REGEX,
  getPasswordRequirementStatus,
  passwordPolicyError,
  sanitizeEmailInput,
  sanitizePhoneInput,
  sanitizeTextInput,
} from '../../utils/inputSecurity'

type SupplierFormData = {
  businessName: string
  contactName: string
  phoneNumber: string
  email: string
  password: string
  confirmPassword: string
  address: string
}

type SupplierFormErrors = Partial<Record<keyof SupplierFormData, string>>

const initialFormData: SupplierFormData = {
  businessName: '',
  contactName: '',
  phoneNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  address: '',
}

export default function SupplierRegistrationPage() {
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData)
  const [errors, setErrors] = useState<SupplierFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const passwordRequirements = getPasswordRequirementStatus(formData.password)
  const hasLivePasswordMismatch =
    (formData.password.length > 0 || formData.confirmPassword.length > 0) && formData.confirmPassword !== formData.password

  function handleTextChange(field: 'businessName' | 'contactName' | 'address', value: string) {
    const maxLength = field === 'address' ? 120 : 80
    setFormData((prev) => ({ ...prev, [field]: sanitizeTextInput(value, maxLength) }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitMessage('')
  }

  function handlePhoneChange(value: string) {
    setFormData((prev) => ({ ...prev, phoneNumber: sanitizePhoneInput(value) }))
    setErrors((prev) => ({ ...prev, phoneNumber: undefined }))
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

  function validate(data: SupplierFormData): SupplierFormErrors {
    const nextErrors: SupplierFormErrors = {}
    const businessName = data.businessName.trim()
    const contactName = data.contactName.trim()
    const phoneNumber = data.phoneNumber.trim()
    const email = data.email.trim().toLowerCase()
    const address = data.address.trim()

    if (!BUSINESS_NAME_REGEX.test(businessName)) {
      nextErrors.businessName = 'Use 2-80 valid business name characters.'
    }

    if (!HUMAN_NAME_REGEX.test(contactName)) {
      nextErrors.contactName = 'Use 2-50 letters, spaces, apostrophes, or hyphens.'
    }

    if (!PHONE_REGEX.test(phoneNumber)) {
      nextErrors.phoneNumber = 'Enter a valid phone number.'
    }

    if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = 'Enter a valid business email.'
    }

    const passwordError = passwordPolicyError(data.password)
    if (passwordError) {
      nextErrors.password = passwordError
    }

    if (data.confirmPassword !== data.password) {
      nextErrors.confirmPassword = "Passwords don't match."
    }

    if (!ADDRESS_REGEX.test(address)) {
      nextErrors.address = 'Use a full address (5-120 valid characters).'
    }

    return nextErrors
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedData = {
      ...formData,
      businessName: formData.businessName.trim(),
      contactName: formData.contactName.trim(),
      phoneNumber: formData.phoneNumber.trim(),
      email: formData.email.trim().toLowerCase(),
      address: formData.address.trim(),
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
      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#dfe5da] bg-white shadow-[0_20px_50px_rgba(17,24,39,0.08)] lg:grid-cols-[1fr_1.05fr]">
        <div className="order-2 border-t border-[#e6ece2] bg-[#f7faf5] p-6 sm:p-8 lg:order-1 lg:border-r lg:border-t-0 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier Portal</p>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight text-[#1b2a1f] sm:text-4xl">Grow with LocalSupply</h1>
          <p className="mt-4 text-sm text-[#5b665f] sm:text-base">
            Join our marketplace to reach customers looking for fresh, local inventory every day.
          </p>
          <div className="mt-8 space-y-3 text-sm text-[#465448]">
            <p>Fast onboarding for grocery and produce vendors</p>
            <p>Inventory controls for daily stock updates</p>
            <p>Order visibility and fulfillment tracking</p>
          </div>
          <div className="mt-8 rounded-2xl border border-[#d4ddcf] bg-white p-4 text-sm text-[#4f5d53]">
            Need a personal account instead?{' '}
            <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" to="/register">
              Go to user registration
            </Link>
          </div>
        </div>

        <div className="order-1 bg-gradient-to-br from-[#2fa04f] via-[#2a9448] to-[#1f7b3a] p-6 text-white sm:p-8 lg:order-2 lg:p-10">
          <h2 className="text-2xl font-bold">Supplier registration</h2>
          <p className="mt-2 text-sm text-white/85">
            Already have an account?{' '}
            <Link className="font-semibold text-white underline-offset-4 hover:underline" to="/login">
              Sign in
            </Link>
          </p>

          <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium text-white">
              Business Name
              <input
                aria-invalid={Boolean(errors.businessName)}
                autoComplete="organization"
                className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-3 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                maxLength={80}
                name="businessName"
                onChange={(event) => handleTextChange('businessName', event.target.value)}
                placeholder="Green Valley Farms"
                required
                type="text"
                value={formData.businessName}
              />
              {errors.businessName ? <p className="text-xs text-[#ffdfdf]">{errors.businessName}</p> : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-white">
                Contact Name
                <input
                  aria-invalid={Boolean(errors.contactName)}
                  autoComplete="name"
                  className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-3 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={50}
                  name="contactName"
                  onChange={(event) => handleTextChange('contactName', event.target.value)}
                  placeholder="Jordan Lee"
                  required
                  type="text"
                  value={formData.contactName}
                />
                {errors.contactName ? <p className="text-xs text-[#ffdfdf]">{errors.contactName}</p> : null}
              </label>
              <label className="space-y-2 text-sm font-medium text-white">
                Phone Number
                <input
                  aria-invalid={Boolean(errors.phoneNumber)}
                  autoComplete="tel"
                  className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-3 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  inputMode="tel"
                  maxLength={20}
                  name="phoneNumber"
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  placeholder="(555) 555-0143"
                  required
                  type="tel"
                  value={formData.phoneNumber}
                />
                {errors.phoneNumber ? <p className="text-xs text-[#ffdfdf]">{errors.phoneNumber}</p> : null}
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-white">
              Business Email
              <input
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-3 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                maxLength={254}
                name="email"
                onChange={(event) => handleEmailChange(event.target.value)}
                placeholder="orders@yourbusiness.com"
                required
                spellCheck={false}
                type="email"
                value={formData.email}
              />
              {errors.email ? <p className="text-xs text-[#ffdfdf]">{errors.email}</p> : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-white">
                Password
                <input
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-3 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={128}
                  name="password"
                  onChange={(event) => handlePasswordChange('password', event.target.value)}
                  placeholder="Create a secure password"
                  required
                  type="password"
                  value={formData.password}
                />
                <ul className="mt-2 space-y-1 text-xs">
                  <li className={passwordRequirements.hasUppercase ? 'text-[#d4ffd8]' : 'text-white/75'}>At least one uppercase letter</li>
                  <li className={passwordRequirements.hasLowercase ? 'text-[#d4ffd8]' : 'text-white/75'}>At least one lowercase letter</li>
                  <li className={passwordRequirements.hasNumber ? 'text-[#d4ffd8]' : 'text-white/75'}>At least one number</li>
                  <li className={passwordRequirements.hasSpecial ? 'text-[#d4ffd8]' : 'text-white/75'}>At least one special character</li>
                </ul>
                {errors.password ? <p className="text-xs text-[#ffdfdf]">{errors.password}</p> : null}
              </label>
              <label className="space-y-2 text-sm font-medium text-white">
                Confirm Password
                <input
                  aria-invalid={Boolean(errors.confirmPassword) || hasLivePasswordMismatch}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-3 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={128}
                  name="confirmPassword"
                  onChange={(event) => handlePasswordChange('confirmPassword', event.target.value)}
                  placeholder="Repeat password"
                  required
                  type="password"
                  value={formData.confirmPassword}
                />
                {hasLivePasswordMismatch ? <p className="text-xs text-[#ffdfdf]">Passwords don't match.</p> : null}
                {!hasLivePasswordMismatch && errors.confirmPassword ? (
                  <p className="text-xs text-[#ffdfdf]">{errors.confirmPassword}</p>
                ) : null}
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-white">
              Business Address
              <input
                aria-invalid={Boolean(errors.address)}
                autoComplete="street-address"
                className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-3 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                maxLength={120}
                name="address"
                onChange={(event) => handleTextChange('address', event.target.value)}
                placeholder="123 Market St, Springfield"
                required
                type="text"
                value={formData.address}
              />
              {errors.address ? <p className="text-xs text-[#ffdfdf]">{errors.address}</p> : null}
            </label>

            <button
              className="mt-2 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#1f7b3a] transition hover:bg-[#eff6eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              type="submit"
            >
              Create Supplier Account
            </button>
            {submitMessage ? <p className="text-center text-xs text-white/85">{submitMessage}</p> : null}
          </form>
        </div>
      </section>
    </main>
  )
}
