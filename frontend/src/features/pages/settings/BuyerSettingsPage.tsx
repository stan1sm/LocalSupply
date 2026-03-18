'use client'

import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

const BUYER_STORAGE_KEY = 'localsupply-user'

type BuyerSession = {
  id: string
  firstName: string
  lastName: string
  email: string
  address: string | null
  phone: string | null
}

type GeoNorgeAddress = {
  adressetekst: string
  postnummer: string
  poststed: string
  kommunenavn: string
}

type SavedAddress = {
  id: string
  label: string | null
  address: string
  phone: string | null
  isDefault: boolean
}

type SavedPaymentMethod = {
  id: string
  cardholderName: string
  maskedNumber: string
  lastFour: string
  expiry: string
  cardType: string | null
  isDefault: boolean
}

const navItems = [
  { label: 'Marketplace', href: '/marketplace/dashboard' },
  { label: 'Cart', href: '/cart' },
  { label: 'Orders', href: '/orders' },
  { label: 'Settings', href: '/settings' },
]

function formatCardNumber(raw: string) {
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return digits
}

function detectCardType(number: string): string {
  const digits = number.replace(/\s/g, '')
  if (/^4/.test(digits)) return 'Visa'
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  return ''
}

function validateCardNumber(number: string): boolean {
  return /^\d{16}$/.test(number.replace(/\s/g, ''))
}

function validateExpiry(expiry: string): boolean {
  if (!/^\d{2}\/\d{2}$/.test(expiry)) return false
  const [mm, yy] = expiry.split('/').map(Number)
  if (mm < 1 || mm > 12) return false
  const now = new Date()
  return new Date(2000 + yy, mm, 0) >= now
}

function validateCvv(cvv: string): boolean {
  return /^\d{3,4}$/.test(cvv)
}

export default function BuyerSettingsPage() {
  const [buyer, setBuyer] = useState<BuyerSession | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Saved addresses
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [newAddrQuery, setNewAddrQuery] = useState('')
  const [newAddrSuggestions, setNewAddrSuggestions] = useState<GeoNorgeAddress[]>([])
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false)
  const [isSearchingAddr, setIsSearchingAddr] = useState(false)
  const [newAddrLabel, setNewAddrLabel] = useState('')
  const [newAddrPhone, setNewAddrPhone] = useState('')
  const [newAddrDefault, setNewAddrDefault] = useState(false)
  const [isSavingAddr, setIsSavingAddr] = useState(false)
  const [addrMsg, setAddrMsg] = useState('')
  const addrRef = useRef<HTMLDivElement>(null)

  // Saved payment methods
  const [payments, setPayments] = useState<SavedPaymentMethod[]>([])
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [newCardName, setNewCardName] = useState('')
  const [newCardNumber, setNewCardNumber] = useState('')
  const [newCardExpiry, setNewCardExpiry] = useState('')
  const [newCardCvv, setNewCardCvv] = useState('')
  const [newCardDefault, setNewCardDefault] = useState(false)
  const [cardErrors, setCardErrors] = useState<{ name?: string; number?: string; expiry?: string; cvv?: string }>({})
  const [isSavingCard, setIsSavingCard] = useState(false)
  const [cardMsg, setCardMsg] = useState('')

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BUYER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as BuyerSession
        if (parsed?.id) setBuyer(parsed)
      }
    } catch { /* ignore */ }
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (isReady && !buyer) {
      window.location.href = '/login?redirect=/settings'
    }
  }, [isReady, buyer])

  // Load saved addresses + payment methods
  useEffect(() => {
    if (!buyer) return
    const uid = encodeURIComponent(buyer.id)
    fetch(buildApiUrl(`/api/auth/addresses?userId=${uid}`))
      .then((r) => r.json())
      .then((data: SavedAddress[]) => { if (Array.isArray(data)) setAddresses(data) })
      .catch(() => { /* ignore */ })

    fetch(buildApiUrl(`/api/auth/payment-methods?userId=${uid}`))
      .then((r) => r.json())
      .then((data: SavedPaymentMethod[]) => { if (Array.isArray(data)) setPayments(data) })
      .catch(() => { /* ignore */ })
  }, [buyer])

  // GeoNorge autocomplete for new address
  useEffect(() => {
    if (newAddrQuery.length < 3) {
      setNewAddrSuggestions([])
      setShowAddrSuggestions(false)
      return
    }
    const timer = setTimeout(async () => {
      setIsSearchingAddr(true)
      try {
        const res = await fetch(
          `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(newAddrQuery)}&fuzzy=true&treffPerSide=7`,
        )
        const data = (await res.json()) as { adresser: GeoNorgeAddress[] }
        setNewAddrSuggestions(data.adresser ?? [])
        setShowAddrSuggestions(true)
      } catch { /* ignore */ } finally {
        setIsSearchingAddr(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [newAddrQuery])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addrRef.current && !addrRef.current.contains(e.target as Node)) {
        setShowAddrSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectNewAddr(addr: GeoNorgeAddress) {
    setNewAddrQuery(`${addr.adressetekst}, ${addr.postnummer} ${addr.poststed}`)
    setShowAddrSuggestions(false)
  }

  async function handleSaveAddress() {
    if (!buyer || isSavingAddr) return
    const trimmed = newAddrQuery.trim()
    if (!trimmed) { setAddrMsg('Please enter an address.'); return }

    setIsSavingAddr(true)
    setAddrMsg('')
    try {
      const res = await fetch(buildApiUrl('/api/auth/addresses'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: buyer.id,
          address: trimmed,
          label: newAddrLabel.trim() || null,
          phone: newAddrPhone.trim() || null,
          isDefault: newAddrDefault,
        }),
      })
      const data = (await res.json()) as SavedAddress
      if (!res.ok) { setAddrMsg('Failed to save address.'); return }

      if (newAddrDefault) {
        setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: false })).concat(data))
      } else {
        setAddresses((prev) => prev.concat(data))
      }
      setShowAddAddress(false)
      setNewAddrQuery('')
      setNewAddrLabel('')
      setNewAddrPhone('')
      setNewAddrDefault(false)
    } catch {
      setAddrMsg('Unable to reach the server.')
    } finally {
      setIsSavingAddr(false)
    }
  }

  async function handleSetDefaultAddress(id: string) {
    if (!buyer) return
    const res = await fetch(buildApiUrl(`/api/auth/addresses/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: buyer.id, isDefault: true }),
    })
    if (res.ok) {
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })))
    }
  }

  async function handleDeleteAddress(id: string) {
    if (!buyer) return
    const res = await fetch(buildApiUrl(`/api/auth/addresses/${id}?userId=${encodeURIComponent(buyer.id)}`), {
      method: 'DELETE',
    })
    if (res.ok || res.status === 204) {
      setAddresses((prev) => {
        const remaining = prev.filter((a) => a.id !== id)
        // if deleted was default and there's another, mark first as default
        const wasDefault = prev.find((a) => a.id === id)?.isDefault
        if (wasDefault && remaining.length > 0) remaining[0].isDefault = true
        return remaining
      })
    }
  }

  function validateNewCard(): boolean {
    const errors: typeof cardErrors = {}
    if (!newCardName.trim()) errors.name = 'Name is required'
    if (!validateCardNumber(newCardNumber)) errors.number = 'Enter a valid 16-digit card number'
    if (!validateExpiry(newCardExpiry)) errors.expiry = 'Enter a valid expiry (MM/YY)'
    if (!validateCvv(newCardCvv)) errors.cvv = 'Enter a valid CVV (3–4 digits)'
    setCardErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSaveCard() {
    if (!buyer || isSavingCard) return
    if (!validateNewCard()) return

    setIsSavingCard(true)
    setCardMsg('')
    try {
      const digits = newCardNumber.replace(/\s/g, '')
      const lastFour = digits.slice(-4)
      const cardType = detectCardType(newCardNumber)

      const res = await fetch(buildApiUrl('/api/auth/payment-methods'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: buyer.id,
          cardholderName: newCardName.trim(),
          lastFour,
          maskedNumber: `•••• •••• •••• ${lastFour}`,
          expiry: newCardExpiry,
          cardType: cardType || null,
          isDefault: newCardDefault,
        }),
      })
      const data = (await res.json()) as SavedPaymentMethod
      if (!res.ok) { setCardMsg('Failed to save card.'); return }

      if (newCardDefault) {
        setPayments((prev) => prev.map((p) => ({ ...p, isDefault: false })).concat(data))
      } else {
        setPayments((prev) => prev.concat(data))
      }
      setShowAddPayment(false)
      setNewCardName('')
      setNewCardNumber('')
      setNewCardExpiry('')
      setNewCardCvv('')
      setNewCardDefault(false)
      setCardErrors({})
    } catch {
      setCardMsg('Unable to reach the server.')
    } finally {
      setIsSavingCard(false)
    }
  }

  async function handleSetDefaultPayment(id: string) {
    if (!buyer) return
    const res = await fetch(buildApiUrl(`/api/auth/payment-methods/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: buyer.id, isDefault: true }),
    })
    if (res.ok) {
      setPayments((prev) => prev.map((p) => ({ ...p, isDefault: p.id === id })))
    }
  }

  async function handleDeletePayment(id: string) {
    if (!buyer) return
    const res = await fetch(buildApiUrl(`/api/auth/payment-methods/${id}?userId=${encodeURIComponent(buyer.id)}`), {
      method: 'DELETE',
    })
    if (res.ok || res.status === 204) {
      setPayments((prev) => {
        const remaining = prev.filter((p) => p.id !== id)
        const wasDefault = prev.find((p) => p.id === id)?.isDefault
        if (wasDefault && remaining.length > 0) remaining[0].isDefault = true
        return remaining
      })
    }
  }

  if (!isReady || !buyer) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6]">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    )
  }

  const defaultAddr = addresses.find((a) => a.isDefault)
  const defaultPayment = payments.find((p) => p.isDefault)

  return (
    <main className="min-h-screen bg-[#f3f4f6]">
      <header className="border-b border-[#dfe5da] bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a href="/marketplace/dashboard" className="text-sm font-bold text-[#1f7b3a]">LocalSupply</a>
          <nav className="flex items-center gap-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`text-sm font-medium ${item.href === '/settings' ? 'text-[#1f7b3a]' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-gray-900">Account settings</h1>
          <p className="text-sm text-gray-500">{buyer.firstName} {buyer.lastName} &middot; {buyer.email}</p>
        </div>

        {/* Profile */}
        <section className="rounded-xl border border-[#dfe5da] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">First name</label>
              <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">{buyer.firstName}</div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Last name</label>
              <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">{buyer.lastName}</div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
              <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">{buyer.email}</div>
            </div>
            {defaultAddr ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-500">Default delivery address</label>
                <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {defaultAddr.label ? <span className="font-medium">{defaultAddr.label} — </span> : null}
                  {defaultAddr.address}
                  {defaultAddr.phone ? <span className="ml-2 text-gray-500">· {defaultAddr.phone}</span> : null}
                </div>
              </div>
            ) : null}
            {defaultPayment ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-500">Default payment method</label>
                <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {defaultPayment.cardType ?? 'Card'} {defaultPayment.maskedNumber} · expires {defaultPayment.expiry}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Delivery addresses */}
        <section className="rounded-xl border border-[#dfe5da] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Delivery addresses</h2>
              <p className="text-xs text-gray-500">Saved addresses autofill at checkout. You can still choose a different one.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddAddress((v) => !v)}
              className="rounded-lg bg-[#1f7b3a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#176330]"
            >
              {showAddAddress ? 'Cancel' : '+ Add address'}
            </button>
          </div>

          {addresses.length === 0 && !showAddAddress ? (
            <p className="text-sm text-gray-400">No saved addresses yet.</p>
          ) : null}

          <div className="space-y-3">
            {addresses.map((addr) => (
              <div key={addr.id} className={`rounded-lg border px-4 py-3 ${addr.isDefault ? 'border-[#1f7b3a] bg-[#f0faf4]' : 'border-[#dfe5da]'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {addr.label ? <p className="text-xs font-semibold text-gray-700">{addr.label}</p> : null}
                    <p className="text-sm text-gray-800">{addr.address}</p>
                    {addr.phone ? <p className="text-xs text-gray-500">{addr.phone}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {addr.isDefault ? (
                      <span className="rounded-full bg-[#dcf5e2] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a34]">Default</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultAddress(addr.id)}
                        className="text-xs font-medium text-[#1f7b3a] hover:underline"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {showAddAddress ? (
            <div className="mt-4 rounded-lg border border-[#dfe5da] bg-[#f9fafb] p-4 space-y-3">
              <div ref={addrRef} className="relative">
                <label className="mb-1 block text-xs font-medium text-gray-700">Address</label>
                <input
                  type="text"
                  value={newAddrQuery}
                  onChange={(e) => setNewAddrQuery(e.target.value)}
                  placeholder="Start typing your address..."
                  className="w-full rounded-lg border border-[#dfe5da] px-3 py-2 text-sm outline-none focus:border-[#1f7b3a] focus:ring-2 focus:ring-[#1f7b3a]/20"
                />
                {isSearchingAddr ? <span className="absolute right-3 top-8 text-xs text-gray-400">Searching...</span> : null}
                {showAddrSuggestions && newAddrSuggestions.length > 0 ? (
                  <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#dfe5da] bg-white shadow-lg">
                    {newAddrSuggestions.map((addr, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-[#f3f4f6]"
                          onMouseDown={(e) => { e.preventDefault(); selectNewAddr(addr) }}
                        >
                          <span className="font-medium">{addr.adressetekst}</span>
                          <span className="ml-2 text-gray-400">{addr.postnummer} {addr.poststed}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Label <span className="font-normal text-gray-400">(optional)</span></label>
                  <input
                    type="text"
                    value={newAddrLabel}
                    onChange={(e) => setNewAddrLabel(e.target.value)}
                    placeholder="e.g. Home, Work"
                    className="w-full rounded-lg border border-[#dfe5da] px-3 py-2 text-sm outline-none focus:border-[#1f7b3a] focus:ring-2 focus:ring-[#1f7b3a]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Phone <span className="font-normal text-gray-400">(optional)</span></label>
                  <input
                    type="tel"
                    value={newAddrPhone}
                    onChange={(e) => setNewAddrPhone(e.target.value.slice(0, 20))}
                    placeholder="+47 900 00 000"
                    className="w-full rounded-lg border border-[#dfe5da] px-3 py-2 text-sm outline-none focus:border-[#1f7b3a] focus:ring-2 focus:ring-[#1f7b3a]/20"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newAddrDefault}
                  onChange={(e) => setNewAddrDefault(e.target.checked)}
                  className="rounded"
                />
                Set as default address
              </label>
              {addrMsg ? <p className="text-xs text-red-500">{addrMsg}</p> : null}
              <button
                type="button"
                onClick={handleSaveAddress}
                disabled={isSavingAddr}
                className="rounded-lg bg-[#1f7b3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#176330] disabled:opacity-60"
              >
                {isSavingAddr ? 'Saving...' : 'Save address'}
              </button>
            </div>
          ) : null}
        </section>

        {/* Payment methods */}
        <section className="rounded-xl border border-[#dfe5da] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Payment methods</h2>
              <p className="text-xs text-gray-500">Saved cards can be selected at checkout. CVV is always required when placing an order.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddPayment((v) => !v)}
              className="rounded-lg bg-[#1f7b3a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#176330]"
            >
              {showAddPayment ? 'Cancel' : '+ Add card'}
            </button>
          </div>

          {payments.length === 0 && !showAddPayment ? (
            <p className="text-sm text-gray-400">No saved cards yet.</p>
          ) : null}

          <div className="space-y-3">
            {payments.map((pm) => (
              <div key={pm.id} className={`rounded-lg border px-4 py-3 ${pm.isDefault ? 'border-[#1f7b3a] bg-[#f0faf4]' : 'border-[#dfe5da]'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{pm.cardType ?? 'Card'} {pm.maskedNumber}</p>
                    <p className="text-xs text-gray-500">{pm.cardholderName} · Expires {pm.expiry}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {pm.isDefault ? (
                      <span className="rounded-full bg-[#dcf5e2] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a34]">Default</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultPayment(pm.id)}
                        className="text-xs font-medium text-[#1f7b3a] hover:underline"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeletePayment(pm.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {showAddPayment ? (
            <div className="mt-4 rounded-lg border border-[#dfe5da] bg-[#f9fafb] p-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Cardholder name</label>
                <input
                  autoComplete="cc-name"
                  type="text"
                  value={newCardName}
                  onChange={(e) => { setNewCardName(e.target.value); setCardErrors((p) => ({ ...p, name: undefined })) }}
                  placeholder="Full name on card"
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.name ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`}
                />
                {cardErrors.name ? <p className="mt-1 text-xs text-red-500">{cardErrors.name}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Card number
                  {detectCardType(newCardNumber) ? <span className="ml-2 font-normal text-[#1f7b3a]">{detectCardType(newCardNumber)}</span> : null}
                </label>
                <input
                  autoComplete="cc-number"
                  type="text"
                  inputMode="numeric"
                  value={newCardNumber}
                  onChange={(e) => { setNewCardNumber(formatCardNumber(e.target.value)); setCardErrors((p) => ({ ...p, number: undefined })) }}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.number ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`}
                />
                {cardErrors.number ? <p className="mt-1 text-xs text-red-500">{cardErrors.number}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Expiry</label>
                  <input
                    autoComplete="cc-exp"
                    type="text"
                    inputMode="numeric"
                    value={newCardExpiry}
                    onChange={(e) => { setNewCardExpiry(formatExpiry(e.target.value)); setCardErrors((p) => ({ ...p, expiry: undefined })) }}
                    placeholder="MM/YY"
                    maxLength={5}
                    className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.expiry ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`}
                  />
                  {cardErrors.expiry ? <p className="mt-1 text-xs text-red-500">{cardErrors.expiry}</p> : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">CVV</label>
                  <input
                    autoComplete="cc-csc"
                    type="text"
                    inputMode="numeric"
                    value={newCardCvv}
                    onChange={(e) => { setNewCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors((p) => ({ ...p, cvv: undefined })) }}
                    placeholder="CVV"
                    maxLength={4}
                    className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.cvv ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`}
                  />
                  {cardErrors.cvv ? <p className="mt-1 text-xs text-red-500">{cardErrors.cvv}</p> : null}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newCardDefault}
                  onChange={(e) => setNewCardDefault(e.target.checked)}
                  className="rounded"
                />
                Set as default payment method
              </label>
              {cardMsg ? <p className="text-xs text-red-500">{cardMsg}</p> : null}
              <button
                type="button"
                onClick={handleSaveCard}
                disabled={isSavingCard}
                className="rounded-lg bg-[#1f7b3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#176330] disabled:opacity-60"
              >
                {isSavingCard ? 'Saving...' : 'Save card'}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
