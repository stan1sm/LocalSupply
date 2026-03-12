'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BUSINESS_NAME_REGEX,
  EMAIL_REGEX,
  HUMAN_NAME_REGEX,
  PHONE_REGEX,
  passwordPolicyError,
  sanitizeEmailInput,
  sanitizePhoneInput,
  sanitizeTextInput,
} from '../../../utils/inputSecurity'
import { buildApiUrl } from '../../../lib/api'
import { type GeonorgeAdresse, searchAddresses } from '../../../lib/geonorgeAdresser'

type SupplierFormData = {
  businessName: string
  contactName: string
  phoneNumber: string
  email: string
  password: string
  confirmPassword: string
  streetAddress: string
  postalCode: string
  city: string
}

type SupplierFormErrors = Partial<Record<keyof SupplierFormData, string>>

const initialFormData: SupplierFormData = {
  businessName: '',
  contactName: '',
  phoneNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  streetAddress: '',
  postalCode: '',
  city: '',
}

const ADDRESS_DEBOUNCE_MS = 400
const GEONORGE_SUGGESTIONS_LIMIT = 8

export default function SupplierRegistrationPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData)
  const [errors, setErrors] = useState<SupplierFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<GeonorgeAdresse[]>([])
  const [addressDropdownVisible, setAddressDropdownVisible] = useState(false)
  const [loadingAddresses, setLoadingAddresses] = useState(false)
  const addressSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addressDropdownRef = useRef<HTMLDivElement | null>(null)

  const hasLivePasswordMismatch =
    (formData.password.length > 0 || formData.confirmPassword.length > 0) && formData.confirmPassword !== formData.password

  const runAddressSearch = useCallback(
    async (query: string, onResults?: (results: GeonorgeAdresse[]) => void) => {
      if (!query.trim()) {
        setAddressSuggestions([])
        setAddressDropdownVisible(false)
        return
      }
      setLoadingAddresses(true)
      setAddressDropdownVisible(true)
      try {
        const results = await searchAddresses(query, GEONORGE_SUGGESTIONS_LIMIT)
        setAddressSuggestions(results)
        onResults?.(results)
      } catch {
        setAddressSuggestions([])
      } finally {
        setLoadingAddresses(false)
      }
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (addressSearchTimeoutRef.current) clearTimeout(addressSearchTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(event.target as Node)) {
        setAddressDropdownVisible(false)
      }
    }
    if (addressDropdownVisible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [addressDropdownVisible])

  function handleTextChange(field: 'businessName' | 'contactName' | 'streetAddress' | 'city', value: string) {
    const maxLength = field === 'streetAddress' ? 120 : 80
    setFormData((prev) => ({ ...prev, [field]: sanitizeTextInput(value, maxLength) }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitMessage('')

    if (field === 'streetAddress' && value.trim().length >= 2) {
      if (addressSearchTimeoutRef.current) clearTimeout(addressSearchTimeoutRef.current)
      addressSearchTimeoutRef.current = setTimeout(() => {
        void runAddressSearch(value.trim())
      }, ADDRESS_DEBOUNCE_MS)
    } else if (field === 'streetAddress') {
      setAddressSuggestions([])
      setAddressDropdownVisible(false)
    }
  }

  function handlePostalCodeChange(value: string) {
    const digits = value.replace(/[^0-9]/g, '').slice(0, 4)
    setFormData((prev) => ({ ...prev, postalCode: digits }))
    setErrors((prev) => ({ ...prev, postalCode: undefined }))
    setSubmitMessage('')
    if (digits.length === 4) {
      void runAddressSearch(digits, (results) => {
        const first = results[0]
        if (first) {
          setFormData((prev) => ({ ...prev, city: first.poststed }))
          setErrors((prev) => ({ ...prev, city: undefined }))
        }
      })
    } else {
      setAddressSuggestions([])
      setAddressDropdownVisible(false)
    }
  }

  function handleSelectAddress(addr: GeonorgeAdresse) {
    setFormData((prev) => ({
      ...prev,
      streetAddress: addr.adressetekst,
      postalCode: addr.postnummer,
      city: addr.poststed,
    }))
    setErrors((prev) => ({ ...prev, streetAddress: undefined, postalCode: undefined, city: undefined }))
    setAddressSuggestions([])
    setAddressDropdownVisible(false)
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
    const streetAddress = data.streetAddress.trim()
    const postalCode = data.postalCode.trim()
    const city = data.city.trim()

    if (!BUSINESS_NAME_REGEX.test(businessName)) {
      nextErrors.businessName = 'Use 2-80 valid business name characters.'
    }

    if (!HUMAN_NAME_REGEX.test(contactName)) {
      nextErrors.contactName = 'Use 2-50 letters, spaces, apostrophes, or hyphens.'
    }

    if (!PHONE_REGEX.test(phoneNumber)) {
      nextErrors.phoneNumber = 'Bruk norsk format +47XXXXXXXX.'
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

    if (!postalCode.match(/^[0-9]{4}$/)) {
      nextErrors.postalCode = 'Bruk et gyldig norsk postnummer (4 siffer).'
    }

    if (city.length < 2 || city.length > 80) {
      nextErrors.city = 'Bruk et gyldig stedsnavn.'
    }

    if (streetAddress.length < 2 || streetAddress.length > 120) {
      nextErrors.streetAddress = 'Use 2-120 characters for street address.'
    }

    return nextErrors
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedData: SupplierFormData = {
      ...formData,
      businessName: formData.businessName.trim(),
      contactName: formData.contactName.trim(),
      phoneNumber: formData.phoneNumber.trim().replace(/\s+/g, ''),
      email: formData.email.trim().toLowerCase(),
      streetAddress: formData.streetAddress.trim(),
      postalCode: formData.postalCode.trim(),
      city: formData.city.trim(),
    }

    // Canonicalize Norwegian phone numbers to +47XXXXXXXX
    if (/^[0-9]{8}$/.test(normalizedData.phoneNumber)) {
      normalizedData.phoneNumber = `+47${normalizedData.phoneNumber}`
    } else if (/^\+47[0-9]{8}$/.test(normalizedData.phoneNumber) === false && /^\+47[0-9\s]{8,}$/.test(normalizedData.phoneNumber)) {
      const digits = normalizedData.phoneNumber.replace(/\D/g, '').slice(-8)
      normalizedData.phoneNumber = `+47${digits}`
    }

    const combinedAddress =
      normalizedData.streetAddress && normalizedData.postalCode && normalizedData.city
        ? `${normalizedData.streetAddress}, ${normalizedData.postalCode} ${normalizedData.city}`
        : normalizedData.streetAddress

    const nextErrors = validate(normalizedData)
    setErrors(nextErrors)
    setFormData(normalizedData)

    if (Object.keys(nextErrors).length > 0) {
      setSubmitMessage('Please fix the highlighted fields.')
      return
    }

    async function submit() {
      try {
        const response = await fetch(buildApiUrl('/api/suppliers/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: normalizedData.businessName,
            contactName: normalizedData.contactName,
            phoneNumber: normalizedData.phoneNumber,
            email: normalizedData.email,
            password: normalizedData.password,
            confirmPassword: normalizedData.confirmPassword,
            address: combinedAddress,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string
          supplier?: { id: string; businessName: string; contactName: string; email: string; address: string }
          errors?: SupplierFormErrors
        }

        if (!response.ok) {
          if (payload.errors) {
            setErrors((prev) => ({ ...prev, ...payload.errors }))
          }
          setSubmitMessage(payload.message ?? 'Unable to create supplier account right now.')
          return
        }

        if (payload.supplier) {
          try {
            window.localStorage.setItem('localsupply-supplier', JSON.stringify(payload.supplier))
          } catch {
            // ignore storage errors
          }
          router.push('/supplier/dashboard')
          return
        }

        setSubmitMessage(payload.message ?? 'Supplier account created.')
      } catch {
        setSubmitMessage('Unable to create supplier account right now.')
      }
    }

    void submit()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-6 sm:px-6 lg:py-8">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-[#dfe5da] bg-white shadow-[0_20px_50px_rgba(17,24,39,0.08)] lg:max-h-[88vh] lg:grid-cols-[1fr_1.05fr] lg:grid-rows-[minmax(0,1fr)]">
        <div className="order-2 min-h-0 overflow-y-auto border-t border-[#e6ece2] bg-[#f7faf5] p-4 sm:p-5 lg:order-1 lg:border-r lg:border-t-0 lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier Portal</p>
          <h1 className="mt-2 text-xl font-extrabold leading-tight text-[#1b2a1f] sm:text-2xl">Grow with LocalSupply</h1>
          <p className="mt-2 text-xs text-[#5b665f]">
            Join our marketplace to reach customers looking for fresh, local inventory every day.
          </p>
          <div className="mt-3 text-xs text-[#465448]">
            <p>Fast onboarding · Inventory · Order visibility</p>
          </div>
          <div className="mt-3 rounded-lg border border-[#d4ddcf] bg-white p-2 text-xs text-[#4f5d53]">
            Personal account? <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/register">User registration</Link>
          </div>
        </div>

        <div className="order-1 flex min-h-0 flex-col overflow-y-auto bg-gradient-to-br from-[#2fa04f] via-[#2a9448] to-[#1f7b3a] p-4 text-white sm:p-5 lg:order-2 lg:p-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <button
              className="flex items-center gap-1 rounded-full border-2 border-white bg-white px-3 py-1.5 font-medium text-[#1f7b3a] shadow-sm transition hover:bg-[#eff6eb] hover:border-white"
              onClick={() => router.push('/')}
              type="button"
            >
              <span aria-hidden="true">←</span>
              <span>Back to homepage</span>
            </button>
            <Link
              className="hidden text-xs font-semibold text-white underline underline-offset-2 hover:no-underline sm:inline"
              href="/supplier/login"
            >
              Supplier login
            </Link>
          </div>
          <h2 className="text-lg font-bold text-white">Supplier registration</h2>
          <p className="mt-1 text-xs text-white">
            Already have an account? <Link className="font-semibold underline underline-offset-1 hover:no-underline" href="/supplier/login">Sign in</Link>
          </p>

          <form className="mt-3 space-y-2" noValidate onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-white">
                Business Name
                <input
                  aria-invalid={Boolean(errors.businessName)}
                  autoComplete="organization"
                  className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={80}
                  name="businessName"
                  onChange={(event) => handleTextChange('businessName', event.target.value)}
                  placeholder="Green Valley Farms"
                  required
                  type="text"
                  value={formData.businessName}
                />
                {errors.businessName ? <p className="text-[10px] text-[#ffdfdf]">{errors.businessName}</p> : null}
              </label>
              <label className="space-y-1 text-xs font-medium text-white">
                Contact Name
                <input
                  aria-invalid={Boolean(errors.contactName)}
                  autoComplete="name"
                  className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={50}
                  name="contactName"
                  onChange={(event) => handleTextChange('contactName', event.target.value)}
                  placeholder="Jordan Lee"
                  required
                  type="text"
                  value={formData.contactName}
                />
                {errors.contactName ? <p className="text-[10px] text-[#ffdfdf]">{errors.contactName}</p> : null}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-white">
                Phone (+47)
                <input
                  aria-invalid={Boolean(errors.phoneNumber)}
                  autoComplete="tel"
                  className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  inputMode="tel"
                  maxLength={16}
                  name="phoneNumber"
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  placeholder="+47 41234567"
                  required
                  type="tel"
                  value={formData.phoneNumber}
                />
                {errors.phoneNumber ? <p className="text-[10px] text-[#ffdfdf]">{errors.phoneNumber}</p> : null}
              </label>
              <label className="space-y-1 text-xs font-medium text-white">
                Business Email
                <input
                  aria-invalid={Boolean(errors.email)}
                  autoComplete="email"
                  className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={254}
                  name="email"
                  onChange={(event) => handleEmailChange(event.target.value)}
                  placeholder="orders@yourbusiness.com"
                  required
                  spellCheck={false}
                  type="email"
                  value={formData.email}
                />
                {errors.email ? <p className="text-[10px] text-[#ffdfdf]">{errors.email}</p> : null}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-white">
                Password
                <input
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={128}
                  name="password"
                  onChange={(event) => handlePasswordChange('password', event.target.value)}
                  placeholder="Password"
                  required
                  type="password"
                  value={formData.password}
                />
                <p className="text-[10px] text-white/90">Uppercase, lowercase, number, special</p>
                {errors.password ? <p className="text-[10px] text-[#ffdfdf]">{errors.password}</p> : null}
              </label>
              <label className="space-y-1 text-xs font-medium text-white">
                Confirm Password
                <input
                  aria-invalid={Boolean(errors.confirmPassword) || hasLivePasswordMismatch}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                  maxLength={128}
                  name="confirmPassword"
                  onChange={(event) => handlePasswordChange('confirmPassword', event.target.value)}
                  placeholder="Repeat"
                  required
                  type="password"
                  value={formData.confirmPassword}
                />
                {hasLivePasswordMismatch ? <p className="text-[10px] text-[#ffdfdf]">Passwords don't match.</p> : null}
                {!hasLivePasswordMismatch && errors.confirmPassword ? (
                  <p className="text-[10px] text-[#ffdfdf]">{errors.confirmPassword}</p>
                ) : null}
              </label>
            </div>

            <div className="space-y-1.5 rounded-lg border border-white/30 bg-white/10 p-2" ref={addressDropdownRef}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white">Address</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_80px_1fr]">
                <label className="relative space-y-1 text-xs font-medium text-white">
                  Street
                  <input
                    aria-autocomplete="list"
                    aria-expanded={addressDropdownVisible && addressSuggestions.length > 0}
                    aria-invalid={Boolean(errors.streetAddress)}
                    autoComplete="address-line1"
                    className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                    maxLength={120}
                    name="streetAddress"
                    onChange={(event) => handleTextChange('streetAddress', event.target.value)}
                    placeholder="Storgata 1"
                    required
                    type="text"
                    value={formData.streetAddress}
                  />
                  {addressDropdownVisible && (loadingAddresses || addressSuggestions.length > 0) ? (
                    <div className="absolute z-10 mt-0.5 max-h-44 w-full min-w-[200px] overflow-auto rounded-lg border border-[#dfe5da] bg-white shadow-lg">
                      {loadingAddresses ? (
                        <p className="px-3 py-2 text-xs text-[#5b665f]">Søker…</p>
                      ) : addressSuggestions.length > 0 ? (
                        <ul className="py-0.5" role="listbox">
                          {addressSuggestions.map((addr, i) => (
                            <li key={`${addr.adressetekst}-${addr.postnummer}-${i}`} role="option">
                              <button
                                className="w-full px-3 py-1.5 text-left text-xs text-[#1f2937] hover:bg-[#f0f4ee] focus:bg-[#f0f4ee] focus:outline-none"
                                type="button"
                                onClick={() => handleSelectAddress(addr)}
                              >
                                {addr.adressetekst} · {addr.postnummer} {addr.poststed}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {errors.streetAddress ? <p className="text-[10px] text-[#ffdfdf]">{errors.streetAddress}</p> : null}
                </label>
                <label className="space-y-1 text-xs font-medium text-white">
                  Postnr
                  <input
                    aria-invalid={Boolean(errors.postalCode)}
                    autoComplete="postal-code"
                    className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                    inputMode="numeric"
                    maxLength={4}
                    name="postalCode"
                    onChange={(event) => handlePostalCodeChange(event.target.value)}
                    placeholder="0550"
                    required
                    type="text"
                    value={formData.postalCode ?? ''}
                  />
                  {errors.postalCode ? <p className="text-[10px] text-[#ffdfdf]">{errors.postalCode}</p> : null}
                </label>
                <label className="space-y-1 text-xs font-medium text-white">
                  Poststed
                  <input
                    aria-invalid={Boolean(errors.city)}
                    autoComplete="address-level2"
                    className="w-full rounded-lg border border-white/25 bg-white/95 px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#667085] focus:border-white focus:ring-2 focus:ring-white/40"
                    maxLength={80}
                    name="city"
                    onChange={(event) => handleTextChange('city', event.target.value)}
                    placeholder="Oslo"
                    required
                    type="text"
                    value={formData.city ?? ''}
                  />
                  {errors.city ? <p className="text-[10px] text-[#ffdfdf]">{errors.city}</p> : null}
                </label>
              </div>
            </div>

            <button
              className="mt-1 w-full rounded-lg border-2 border-white bg-white px-3 py-2.5 text-sm font-semibold text-[#1f7b3a] shadow transition hover:bg-[#eff6eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1f7b3a]"
              type="submit"
            >
              Create Supplier Account
            </button>
            {submitMessage ? <p className="text-center text-[10px] text-white">{submitMessage}</p> : null}
          </form>
        </div>
      </section>
    </main>
  )
}
