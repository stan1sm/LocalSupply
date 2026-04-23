'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BUSINESS_NAME_REGEX,
  EMAIL_REGEX,
  HUMAN_NAME_REGEX,
  PHONE_REGEX,
  getPasswordRequirementStatus,
  passwordPolicyError,
  sanitizeEmailInput,
  sanitizePhoneInput,
  sanitizeTextInput,
} from '../../../utils/inputSecurity'
import { buildApiUrl } from '../../../lib/api'
import { type GeonorgeAdresse, searchAddresses } from '../../../lib/geonorgeAdresser'

type BrregResult = {
  ok: boolean
  name?: string
  address?: string
  isActive?: boolean
  inBankruptcy?: boolean
  inLiquidation?: boolean
  message?: string
}

type SupplierFormData = {
  orgnr: string
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
  orgnr: '',
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
const BRREG_SLOW_THRESHOLD_MS = 4000

type BrregStatus = 'idle' | 'loading' | 'slow' | 'verified' | 'bankrupt' | 'liquidation' | 'inactive' | 'not_found' | 'error'

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2f9f4f] text-[11px] font-bold text-white">
        {number}
      </span>
      <h3 className="text-sm font-semibold text-[#1b2a1f]">{title}</h3>
      <div className="h-px flex-1 bg-[#e5ece2]" />
    </div>
  )
}

function BrregBanner({ status, result }: { status: BrregStatus; result: BrregResult | null }) {
  if (status === 'loading' || status === 'slow') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[#d4ddcf] bg-[#f7faf6] px-4 py-3">
        <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#c7d2c2] border-t-[#2f9f4f]" />
        <div>
          <p className="text-sm font-medium text-[#374740]">
            {status === 'slow' ? 'Still checking — this is taking longer than usual.' : 'Checking Brønnøysundregistrene…'}
          </p>
          <p className="mt-0.5 text-xs text-[#6b7b70]">
            We&apos;re looking up your organisation in Norway&apos;s official business registry to confirm it&apos;s active and valid.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'verified') {
    return (
      <div className="rounded-xl border border-[#a3d4b3] bg-[#f0faf4] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2f9f4f] text-[11px] font-bold text-white">✓</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1a5c2e]">Business verified</p>
            {result?.name && <p className="mt-0.5 text-sm font-bold text-[#1f2b22]">{result.name}</p>}
            {result?.address && <p className="mt-0.5 text-xs text-[#3d6b4b]">{result.address}</p>}
            <p className="mt-1.5 text-xs text-[#4b6b54]">
              Active registration · Brønnøysundregistrene · Business name and address have been pre-filled below — review them before continuing.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'bankrupt' || status === 'liquidation' || status === 'inactive') {
    const title =
      status === 'bankrupt' ? 'Business in bankruptcy proceedings' :
      status === 'liquidation' ? 'Business in voluntary liquidation' :
      'Business is not active'
    const detail =
      status === 'bankrupt'
        ? 'This organisation is registered in Brønnøysundregistrene as being in bankruptcy proceedings. It cannot be used to register a new supplier account.'
        : status === 'liquidation'
          ? 'This organisation is in voluntary liquidation and is no longer operating. It cannot be used for registration.'
          : 'This organisation is registered but is currently marked as inactive. Only businesses with an active status can register on LocalSupply.'
    return (
      <div className="rounded-xl border border-[#fca5a5] bg-[#fff5f5] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[#dc2626]">✗</span>
          <div>
            <p className="text-sm font-semibold text-[#991b1b]">{title}</p>
            <p className="mt-0.5 text-sm text-[#7f1d1d]">{detail}</p>
            <p className="mt-1.5 text-xs text-[#991b1b]">
              If you believe this is incorrect, contact Brønnøysundregistrene directly or try a different organisation number.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-amber-500 text-base">⚠</span>
          <div>
            <p className="text-sm font-semibold text-[#92400e]">Organisation not found</p>
            <p className="mt-0.5 text-sm text-[#78350f]">
              No active registered business was found for this number. Check that you&apos;ve entered exactly 9 digits with no spaces or dashes.
            </p>
            <p className="mt-1.5 text-xs text-[#92400e]">
              Newly registered businesses can take up to 48 hours to appear. You can still continue — we&apos;ll verify your details as part of the review process.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[#3b82f6] text-base font-bold">i</span>
          <div>
            <p className="text-sm font-semibold text-[#1e3a5f]">Registry temporarily unavailable</p>
            <p className="mt-0.5 text-sm text-[#1e40af]">
              We couldn&apos;t reach Brønnøysundregistrene right now. You can still complete your registration — your business details will be verified during account review.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default function SupplierRegistrationPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData)
  const [errors, setErrors] = useState<SupplierFormErrors>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitIsError, setSubmitIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addressSuggestions, setAddressSuggestions] = useState<GeonorgeAdresse[]>([])
  const [addressDropdownVisible, setAddressDropdownVisible] = useState(false)
  const [loadingAddresses, setLoadingAddresses] = useState(false)
  const addressSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addressDropdownRef = useRef<HTMLDivElement | null>(null)

  const [brregStatus, setBrregStatus] = useState<BrregStatus>('idle')
  const [brregResult, setBrregResult] = useState<BrregResult | null>(null)
  const [brregVerifiedName, setBrregVerifiedName] = useState<string | null>(null)
  const orgnrTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const brregSlowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const hasLivePasswordMismatch =
    (formData.password.length > 0 || formData.confirmPassword.length > 0) && formData.confirmPassword !== formData.password

  const passwordRequirements = getPasswordRequirementStatus(formData.password)

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
      if (orgnrTimeoutRef.current) clearTimeout(orgnrTimeoutRef.current)
      if (brregSlowTimeoutRef.current) clearTimeout(brregSlowTimeoutRef.current)
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

  function handleOrgnrChange(value: string) {
    const digits = value.replace(/[^0-9]/g, '').slice(0, 9)
    setFormData((prev) => ({ ...prev, orgnr: digits }))
    setErrors((prev) => ({ ...prev, orgnr: undefined }))
    setBrregResult(null)
    setBrregStatus('idle')
    setBrregVerifiedName(null)

    if (orgnrTimeoutRef.current) clearTimeout(orgnrTimeoutRef.current)
    if (brregSlowTimeoutRef.current) clearTimeout(brregSlowTimeoutRef.current)

    if (digits.length === 9) {
      orgnrTimeoutRef.current = setTimeout(() => {
        setBrregStatus('loading')
        brregSlowTimeoutRef.current = setTimeout(() => setBrregStatus('slow'), BRREG_SLOW_THRESHOLD_MS)

        fetch(buildApiUrl(`/api/suppliers/verify/${digits}`))
          .then((r) => r.json())
          .then((data: BrregResult) => {
            if (brregSlowTimeoutRef.current) clearTimeout(brregSlowTimeoutRef.current)
            setBrregResult(data)
            if (!data.ok) {
              setBrregStatus('not_found')
              return
            }
            if (data.inBankruptcy) {
              setBrregStatus('bankrupt')
              return
            }
            if (data.inLiquidation) {
              setBrregStatus('liquidation')
              return
            }
            if (!data.isActive) {
              setBrregStatus('inactive')
              return
            }
            setBrregStatus('verified')
            if (data.name) {
              setBrregVerifiedName(data.name)
              setFormData((prev) => ({ ...prev, businessName: data.name! }))
              setErrors((prev) => ({ ...prev, businessName: undefined }))
            }
            if (data.address) {
              const parts = data.address.split(',').map((p) => p.trim())
              const street = parts[0] ?? ''
              const rest = parts.slice(1).join(' ').trim()
              const postalMatch = rest.match(/^(\d{4})\s+(.+)$/)
              if (postalMatch) {
                setFormData((prev) => ({ ...prev, streetAddress: street, postalCode: postalMatch[1], city: postalMatch[2] }))
              } else {
                setFormData((prev) => ({ ...prev, streetAddress: street }))
              }
              setErrors((prev) => ({ ...prev, streetAddress: undefined, postalCode: undefined, city: undefined }))
            }
          })
          .catch(() => {
            if (brregSlowTimeoutRef.current) clearTimeout(brregSlowTimeoutRef.current)
            setBrregStatus('error')
          })
      }, 600)
    }
  }

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
      nextErrors.businessName = 'Use 2–80 valid business name characters.'
    }
    if (!HUMAN_NAME_REGEX.test(contactName)) {
      nextErrors.contactName = 'Use 2–50 letters, spaces, apostrophes, or hyphens.'
    }
    if (!PHONE_REGEX.test(phoneNumber)) {
      nextErrors.phoneNumber = 'Enter a valid Norwegian number, e.g. +47 41234567.'
    }
    if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = 'Enter a valid business email address.'
    }
    const passwordError = passwordPolicyError(data.password)
    if (passwordError) {
      nextErrors.password = passwordError
    }
    if (data.confirmPassword !== data.password) {
      nextErrors.confirmPassword = "Passwords don't match."
    }
    if (!postalCode.match(/^[0-9]{4}$/)) {
      nextErrors.postalCode = 'Enter a 4-digit Norwegian postal code.'
    }
    if (city.length < 2 || city.length > 80) {
      nextErrors.city = 'Enter a valid city name.'
    }
    if (streetAddress.length < 2 || streetAddress.length > 120) {
      nextErrors.streetAddress = 'Enter a valid street address (2–120 characters).'
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
      setSubmitMessage('Some fields need attention — check the highlighted errors above.')
      setSubmitIsError(true)
      return
    }

    setIsSubmitting(true)
    setSubmitMessage('')
    setSubmitIsError(false)

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
            orgnr: normalizedData.orgnr || undefined,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string
          token?: string
          supplier?: { id: string; businessName: string; contactName: string; email: string; address: string }
          errors?: SupplierFormErrors
        }

        if (!response.ok) {
          if (response.status === 409) {
            setSubmitMessage('An account already exists with this email or organisation number. Try signing in instead.')
            setSubmitIsError(true)
            return
          }
          if (payload.errors) {
            const serverErrors = payload.errors as SupplierFormErrors & { address?: string }
            const mappedErrors: SupplierFormErrors & { address?: string } = {
              ...serverErrors,
              ...(serverErrors.address
                ? { streetAddress: serverErrors.address, postalCode: serverErrors.address, city: serverErrors.address }
                : {}),
            }
            delete mappedErrors.address
            setErrors((prev) => ({ ...prev, ...mappedErrors }))
            setSubmitMessage('Some fields need attention — check the highlighted errors above.')
            setSubmitIsError(true)
          } else {
            setSubmitMessage(payload.message ?? 'Unable to create your account right now. Please try again.')
            setSubmitIsError(true)
          }
          return
        }

        if (payload.supplier) {
          try {
            window.localStorage.setItem('localsupply-supplier', JSON.stringify(payload.supplier))
            if (payload.token) {
              window.localStorage.setItem('localsupply-supplier-token', payload.token)
            }
          } catch {
            // ignore storage errors
          }
          router.push('/supplier/dashboard')
          return
        }

        setSubmitMessage(payload.message ?? 'Supplier account created.')
        setSubmitIsError(false)
      } catch {
        setSubmitMessage('Something went wrong. Check your connection and try again.')
        setSubmitIsError(true)
      } finally {
        setIsSubmitting(false)
      }
    }

    void submit()
  }

  const inputClass =
    'w-full rounded-lg border border-[#d6ddd2] bg-[#f9fbf8] px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20'
  const labelClass = 'space-y-1 text-xs font-medium text-[#2e3b31]'
  const errorClass = 'text-[10px] text-[#c53030]'
  const hintClass = 'text-[10px] text-[#7b8b80]'

  const nameDeviatesFromBrreg =
    brregVerifiedName !== null &&
    formData.businessName.trim().length > 0 &&
    formData.businessName.trim() !== brregVerifiedName

  const isBlocked = brregStatus === 'bankrupt' || brregStatus === 'liquidation' || brregStatus === 'inactive'

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
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

        <h2 className="text-xl font-bold text-[#1b2a1f]">Create your supplier account</h2>
        <p className="mt-1.5 text-sm text-[#5b665f]">
          Join LocalSupply as a verified Norwegian supplier.{' '}
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/supplier/login">Already have an account?</Link>
        </p>

        <form className="mt-6 space-y-5" noValidate onSubmit={handleSubmit}>

          {/* Section 1: Business verification */}
          <div className="space-y-3">
            <SectionHeader number={1} title="Verify your business" />
            <label className={`block ${labelClass}`}>
              Organisation number (orgnr)
              <input
                autoComplete="off"
                className={`${inputClass} pr-24`}
                inputMode="numeric"
                maxLength={9}
                onChange={(e) => handleOrgnrChange(e.target.value)}
                placeholder="123456789"
                type="text"
                value={formData.orgnr}
              />
              <p className={hintClass}>
                Your 9-digit Norwegian organisation number. We&apos;ll verify it against Brønnøysundregistrene to confirm your business is active.
              </p>
              {errors.orgnr ? <p className={errorClass}>{errors.orgnr}</p> : null}
            </label>

            {(brregStatus !== 'idle') && (
              <BrregBanner status={brregStatus} result={brregResult} />
            )}
          </div>

          {/* Section 2: Business & contact details */}
          <div className="space-y-3">
            <SectionHeader number={2} title="Business &amp; contact details" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`block ${labelClass}`}>
                Business name
                <input
                  aria-invalid={Boolean(errors.businessName)}
                  autoComplete="organization"
                  className={inputClass}
                  maxLength={80}
                  name="businessName"
                  onChange={(event) => handleTextChange('businessName', event.target.value)}
                  placeholder="Green Valley Farms AS"
                  required
                  type="text"
                  value={formData.businessName}
                />
                <p className={hintClass}>Appears on your profile and invoices.</p>
                {nameDeviatesFromBrreg && (
                  <p className="text-[10px] text-amber-600">
                    Official registry name: &quot;{brregVerifiedName}&quot; — make sure any difference is intentional.
                  </p>
                )}
                {errors.businessName ? <p className={errorClass}>{errors.businessName}</p> : null}
              </label>
              <label className={`block ${labelClass}`}>
                Contact name
                <input
                  aria-invalid={Boolean(errors.contactName)}
                  autoComplete="name"
                  className={inputClass}
                  maxLength={50}
                  name="contactName"
                  onChange={(event) => handleTextChange('contactName', event.target.value)}
                  placeholder="Jordan Lee"
                  required
                  type="text"
                  value={formData.contactName}
                />
                <p className={hintClass}>Primary contact for orders and account inquiries.</p>
                {errors.contactName ? <p className={errorClass}>{errors.contactName}</p> : null}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`block ${labelClass}`}>
                Phone number
                <input
                  aria-invalid={Boolean(errors.phoneNumber)}
                  autoComplete="tel"
                  className={inputClass}
                  inputMode="tel"
                  maxLength={16}
                  name="phoneNumber"
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  placeholder="+47 41234567"
                  required
                  type="tel"
                  value={formData.phoneNumber}
                />
                <p className={hintClass}>Norwegian number (+47). Used for order confirmations.</p>
                {errors.phoneNumber ? <p className={errorClass}>{errors.phoneNumber}</p> : null}
              </label>
              <label className={`block ${labelClass}`}>
                Business email
                <input
                  aria-invalid={Boolean(errors.email)}
                  autoComplete="email"
                  className={inputClass}
                  maxLength={254}
                  name="email"
                  onChange={(event) => handleEmailChange(event.target.value)}
                  placeholder="orders@yourbusiness.com"
                  required
                  spellCheck={false}
                  type="email"
                  value={formData.email}
                />
                <p className={hintClass}>Your login email and where you&apos;ll receive order notifications.</p>
                {errors.email ? <p className={errorClass}>{errors.email}</p> : null}
              </label>
            </div>
          </div>

          {/* Section 3: Account setup */}
          <div className="space-y-3">
            <SectionHeader number={3} title="Create your account" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`block ${labelClass}`}>
                Password
                <div className="relative">
                  <input
                    aria-invalid={Boolean(errors.password)}
                    autoComplete="new-password"
                    className={`${inputClass} pr-9`}
                    maxLength={128}
                    name="password"
                    onChange={(event) => handlePasswordChange('password', event.target.value)}
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
                <ul className="mt-1.5 space-y-0.5 text-[11px]">
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
                        <span>{met ? '✓' : '○'}</span>
                        {label}
                      </li>
                    )
                  })}
                </ul>
                {errors.password ? <p className={errorClass}>{errors.password}</p> : null}
              </label>
              <label className={`block ${labelClass}`}>
                Confirm password
                <div className="relative">
                  <input
                    aria-invalid={Boolean(errors.confirmPassword) || hasLivePasswordMismatch}
                    autoComplete="new-password"
                    className={`${inputClass} pr-9`}
                    maxLength={128}
                    name="confirmPassword"
                    onChange={(event) => handlePasswordChange('confirmPassword', event.target.value)}
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
          </div>

          {/* Section 4: Address */}
          <div className="space-y-3">
            <SectionHeader number={4} title="Business address" />
            <p className="text-xs text-[#7b8b80]">
              Your primary pickup or delivery location. This appears on your public store profile.
              {brregStatus === 'verified' ? ' Pre-filled from Brønnøysundregistrene — confirm it&apos;s correct.' : ''}
            </p>
            <div className="space-y-2 rounded-lg border border-[#dfe5da] bg-[#f9fbf8] p-3" ref={addressDropdownRef}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_80px_1fr]">
                <label className={`relative block ${labelClass}`}>
                  Street address
                  <input
                    aria-autocomplete="list"
                    aria-expanded={addressDropdownVisible && addressSuggestions.length > 0}
                    aria-invalid={Boolean(errors.streetAddress)}
                    autoComplete="address-line1"
                    className={inputClass}
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
                      ) : (
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
                      )}
                    </div>
                  ) : null}
                  {errors.streetAddress ? <p className={errorClass}>{errors.streetAddress}</p> : null}
                </label>
                <label className={`block ${labelClass}`}>
                  Postal code
                  <input
                    aria-invalid={Boolean(errors.postalCode)}
                    autoComplete="postal-code"
                    className={inputClass}
                    inputMode="numeric"
                    maxLength={4}
                    name="postalCode"
                    onChange={(event) => handlePostalCodeChange(event.target.value)}
                    placeholder="0550"
                    required
                    type="text"
                    value={formData.postalCode ?? ''}
                  />
                  {errors.postalCode ? <p className={errorClass}>{errors.postalCode}</p> : null}
                </label>
                <label className={`block ${labelClass}`}>
                  City
                  <input
                    aria-invalid={Boolean(errors.city)}
                    autoComplete="address-level2"
                    className={inputClass}
                    maxLength={80}
                    name="city"
                    onChange={(event) => handleTextChange('city', event.target.value)}
                    placeholder="Oslo"
                    required
                    type="text"
                    value={formData.city ?? ''}
                  />
                  {errors.city ? <p className={errorClass}>{errors.city}</p> : null}
                </label>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="space-y-3 pt-1">
            <button
              className="w-full rounded-xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9f4f]/35 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting || isBlocked}
              type="submit"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating your account…
                </span>
              ) : isBlocked ? (
                'Registration not available for this organisation'
              ) : (
                'Create Supplier Account'
              )}
            </button>

            {submitMessage ? (
              <p className={`text-center text-xs ${submitIsError ? 'text-[#c53030]' : 'text-[#2f9f4f]'}`}>
                {submitMessage}
              </p>
            ) : null}

            <p className="text-center text-[10px] text-[#9ca3af]">
              By registering, your account will be reviewed by our team before going live on the marketplace.
            </p>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-[#5b665f]">
          Personal buyer account?{' '}
          <Link className="font-semibold text-[#2f9f4f] hover:text-[#25813f]" href="/register">Register here</Link>
        </p>
      </div>
    </main>
  )
}
