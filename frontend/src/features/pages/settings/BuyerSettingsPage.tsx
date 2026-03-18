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

const navItems = [
  { label: 'Marketplace', href: '/marketplace/dashboard' },
  { label: 'Cart', href: '/cart' },
  { label: 'Orders', href: '/orders' },
  { label: 'Settings', href: '/settings' },
]

export default function BuyerSettingsPage() {
  const [buyer, setBuyer] = useState<BuyerSession | null>(null)
  const [isReady, setIsReady] = useState(false)

  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<GeoNorgeAddress[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const addressRef = useRef<HTMLDivElement>(null)

  const [phone, setPhone] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BUYER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as BuyerSession
        if (parsed?.id) {
          setBuyer(parsed)
          setAddressQuery(parsed.address ?? '')
          setPhone(parsed.phone ?? '')
        }
      }
    } catch { /* ignore */ }
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (isReady && !buyer) {
      window.location.href = '/login?redirect=/settings'
    }
  }, [isReady, buyer])

  // GeoNorge autocomplete
  useEffect(() => {
    if (addressQuery.length < 3) {
      setAddressSuggestions([])
      setShowSuggestions(false)
      return
    }
    const timer = setTimeout(async () => {
      setIsSearchingAddress(true)
      try {
        const res = await fetch(
          `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(addressQuery)}&fuzzy=true&treffPerSide=7`,
        )
        const data = (await res.json()) as { adresser: GeoNorgeAddress[] }
        setAddressSuggestions(data.adresser ?? [])
        setShowSuggestions(true)
      } catch { /* ignore */ } finally {
        setIsSearchingAddress(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [addressQuery])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addressRef.current && !addressRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectAddress(addr: GeoNorgeAddress) {
    setAddressQuery(`${addr.adressetekst}, ${addr.postnummer} ${addr.poststed}`)
    setShowSuggestions(false)
  }

  async function handleSave() {
    if (!buyer || isSaving) return
    const trimmedAddress = addressQuery.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedAddress && !trimmedPhone) {
      setSaveState('error')
      setSaveMessage('Add at least an address or phone number to save.')
      return
    }

    setIsSaving(true)
    setSaveMessage('')
    setSaveState('idle')

    try {
      const response = await fetch(buildApiUrl('/api/auth/profile'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: buyer.id,
          address: trimmedAddress || null,
          phone: trimmedPhone || null,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { user?: BuyerSession; message?: string }

      if (!response.ok) {
        setSaveState('error')
        setSaveMessage(payload.message ?? 'Unable to save right now.')
        return
      }

      const updatedBuyer: BuyerSession = {
        ...buyer,
        address: trimmedAddress || null,
        phone: trimmedPhone || null,
      }
      setBuyer(updatedBuyer)
      window.localStorage.setItem(BUYER_STORAGE_KEY, JSON.stringify(updatedBuyer))

      setSaveState('success')
      setSaveMessage('Saved.')
    } catch {
      setSaveState('error')
      setSaveMessage('Unable to reach the server. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isReady || !buyer) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6]">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6]">
      {/* Top nav */}
      <header className="border-b border-[#dfe5da] bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a href="/marketplace/dashboard" className="text-sm font-bold text-[#1f7b3a]">
            LocalSupply
          </a>
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

      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Account settings</h1>
        <p className="mb-8 text-sm text-gray-500">
          {buyer.firstName} {buyer.lastName} &middot; {buyer.email}
        </p>

        {/* Profile info (read-only) */}
        <section className="mb-6 rounded-xl border border-[#dfe5da] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">First name</label>
              <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {buyer.firstName}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Last name</label>
              <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {buyer.lastName}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
              <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {buyer.email}
              </div>
            </div>
          </div>
        </section>

        {/* Delivery info */}
        <section className="rounded-xl border border-[#dfe5da] bg-white p-6">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Delivery info</h2>
          <p className="mb-5 text-xs text-gray-500">Used to autofill your delivery address and contact at checkout.</p>

          {/* Address */}
          <div className="mb-4" ref={addressRef}>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Delivery address
            </label>
            <div className="relative">
              <input
                type="text"
                value={addressQuery}
                onChange={(e) => {
                  setAddressQuery(e.target.value)
                  setSaveState('idle')
                  setSaveMessage('')
                }}
                placeholder="Start typing your street address..."
                className="w-full rounded-lg border border-[#dfe5da] px-3 py-2 text-sm outline-none focus:border-[#1f7b3a] focus:ring-2 focus:ring-[#1f7b3a]/20"
              />
              {isSearchingAddress && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  Searching...
                </span>
              )}
              {showSuggestions && addressSuggestions.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#dfe5da] bg-white shadow-lg">
                  {addressSuggestions.map((addr, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-[#f3f4f6]"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          selectAddress(addr)
                        }}
                      >
                        <span className="font-medium">{addr.adressetekst}</span>
                        <span className="ml-2 text-gray-400">
                          {addr.postnummer} {addr.poststed}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="mb-6">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.slice(0, 20))
                setSaveState('idle')
                setSaveMessage('')
              }}
              placeholder="+47 900 00 000"
              className="w-full rounded-lg border border-[#dfe5da] px-3 py-2 text-sm outline-none focus:border-[#1f7b3a] focus:ring-2 focus:ring-[#1f7b3a]/20"
            />
          </div>

          {/* Save */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-[#1f7b3a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#176330] disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
            {saveMessage && (
              <p className={`text-sm ${saveState === 'success' ? 'text-[#1f7b3a]' : 'text-red-600'}`}>
                {saveMessage}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
