'use client'

import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

const BUYER_STORAGE_KEY = 'localsupply-user'
const TOKEN_KEY = 'localsupply-token'

type Tab = 'profile' | 'addresses' | 'payment' | 'orders' | 'security'

type BuyerSession = {
  id: string
  firstName: string
  lastName: string
  email: string
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

type OrderItem = {
  id: string
  productId: string
  name: string
  unit: string
  quantity: number
  unitPrice: number | string
}

type Order = {
  id: string
  status: string
  subtotal: number | string
  deliveryFee: number | string
  total: number | string
  notes: string | null
  woltTrackingUrl: string | null
  woltStatus: string | null
  createdAt: string
  supplier: { id: string; businessName: string; address: string | null }
  items: OrderItem[]
}

const navItems = [
  { label: 'Marketplace', href: '/marketplace/dashboard' },
  { label: 'Cart', href: '/cart' },
  { label: 'Orders', href: '/orders' },
  { label: 'Settings', href: '/settings' },
]

const tabs: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'payment', label: 'Payment' },
  { id: 'orders', label: 'Orders' },
  { id: 'security', label: 'Security' },
]

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_TRANSIT: 'bg-purple-50 text-purple-700 border-purple-200',
  DELIVERED: 'bg-[#f0faf4] text-[#1a7a34] border-[#b2d4bc]',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
}

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

function fmt(n: number | string) {
  return Number(n).toFixed(2)
}

function statusLabel(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BuyerSettingsPage() {
  const [buyer, setBuyer] = useState<BuyerSession | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  // --- Profile ---
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileFirstName, setProfileFirstName] = useState('')
  const [profileLastName, setProfileLastName] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // --- Addresses ---
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [newAddrQuery, setNewAddrQuery] = useState('')
  const [newAddrSuggestions, setNewAddrSuggestions] = useState<GeoNorgeAddress[]>([])
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false)
  const [isSearchingAddr, setIsSearchingAddr] = useState(false)
  const [newAddrLabel, setNewAddrLabel] = useState('')
  const [newAddrPhone, setNewAddrPhone] = useState('')
  const [newAddrInstructions, setNewAddrInstructions] = useState('')
  const [newAddrDefault, setNewAddrDefault] = useState(false)
  const [isSavingAddr, setIsSavingAddr] = useState(false)
  const [addrMsg, setAddrMsg] = useState('')
  const addrRef = useRef<HTMLDivElement>(null)

  // --- Payment methods ---
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

  // --- Orders ---
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [reorderingId, setReorderingId] = useState<string | null>(null)

  // --- Security ---
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [isSavingPw, setIsSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BUYER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as BuyerSession
        if (parsed?.id) {
          setBuyer(parsed)
          setProfileFirstName(parsed.firstName)
          setProfileLastName(parsed.lastName)
        }
      }
    } catch { /* ignore */ }
    setIsReady(true)
  }, [])

  function getAuthHeader(): Record<string, string> {
    try {
      const token = window.localStorage.getItem(TOKEN_KEY)
      if (token) return { Authorization: `Bearer ${token}` }
    } catch { /* ignore */ }
    return {}
  }

  useEffect(() => {
    if (isReady && !buyer) window.location.href = '/login?redirect=/settings'
  }, [isReady, buyer])

  // Load addresses + payments on mount
  useEffect(() => {
    if (!buyer) return
    const headers = getAuthHeader()
    fetch(buildApiUrl('/api/auth/addresses'), { headers })
      .then((r) => r.json())
      .then((data: SavedAddress[]) => { if (Array.isArray(data)) setAddresses(data) })
      .catch(() => {})

    fetch(buildApiUrl('/api/auth/payment-methods'), { headers })
      .then((r) => r.json())
      .then((data: SavedPaymentMethod[]) => { if (Array.isArray(data)) setPayments(data) })
      .catch(() => {})
  }, [buyer])

  // Load orders when orders tab is activated
  useEffect(() => {
    if (activeTab !== 'orders' || !buyer || orders.length > 0) return
    setOrdersLoading(true)
    fetch(buildApiUrl(`/api/orders/buyer/${buyer.id}`), { headers: getAuthHeader() })
      .then((r) => r.json())
      .then((data: Order[]) => { if (Array.isArray(data)) setOrders(data) })
      .catch(() => {})
      .finally(() => setOrdersLoading(false))
  }, [activeTab, buyer])

  // GeoNorge autocomplete
  useEffect(() => {
    if (newAddrQuery.length < 3) { setNewAddrSuggestions([]); setShowAddrSuggestions(false); return }
    const timer = setTimeout(async () => {
      setIsSearchingAddr(true)
      try {
        const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(newAddrQuery)}&fuzzy=true&treffPerSide=7`)
        const data = (await res.json()) as { adresser: GeoNorgeAddress[] }
        setNewAddrSuggestions(data.adresser ?? [])
        setShowAddrSuggestions(true)
      } catch { /* ignore */ } finally { setIsSearchingAddr(false) }
    }, 350)
    return () => clearTimeout(timer)
  }, [newAddrQuery])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addrRef.current && !addrRef.current.contains(e.target as Node)) setShowAddrSuggestions(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Profile ──────────────────────────────────────────────────────────────────

  async function handleSaveProfile() {
    if (!buyer || isSavingProfile) return
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      setProfileMsg({ ok: false, text: 'Name fields cannot be empty.' }); return
    }
    setIsSavingProfile(true)
    setProfileMsg(null)
    try {
      const res = await fetch(buildApiUrl('/api/auth/profile'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ firstName: profileFirstName.trim(), lastName: profileLastName.trim() }),
      })
      const data = (await res.json()) as { firstName?: string; lastName?: string; message?: string }
      if (!res.ok) { setProfileMsg({ ok: false, text: data.message ?? 'Failed to save.' }); return }
      const updated = { ...buyer, firstName: data.firstName ?? buyer.firstName, lastName: data.lastName ?? buyer.lastName }
      setBuyer(updated)
      try { window.localStorage.setItem(BUYER_STORAGE_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
      setEditingProfile(false)
      setProfileMsg({ ok: true, text: 'Profile updated.' })
    } catch {
      setProfileMsg({ ok: false, text: 'Unable to reach the server.' })
    } finally {
      setIsSavingProfile(false)
    }
  }

  // ── Addresses ────────────────────────────────────────────────────────────────

  function selectNewAddr(addr: GeoNorgeAddress) {
    setNewAddrQuery(`${addr.adressetekst}, ${addr.postnummer} ${addr.poststed}`)
    setShowAddrSuggestions(false)
  }

  async function handleSaveAddress() {
    if (!buyer || isSavingAddr) return
    const trimmed = newAddrQuery.trim()
    if (!trimmed) { setAddrMsg('Please enter an address.'); return }
    setIsSavingAddr(true); setAddrMsg('')
    try {
      const labelValue = newAddrInstructions.trim()
        ? `${newAddrLabel.trim() || 'Address'}${newAddrInstructions.trim() ? ` — ${newAddrInstructions.trim()}` : ''}`
        : newAddrLabel.trim() || null
      const res = await fetch(buildApiUrl('/api/auth/addresses'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ address: trimmed, label: labelValue, phone: newAddrPhone.trim() || null, isDefault: newAddrDefault }),
      })
      const data = (await res.json()) as SavedAddress
      if (!res.ok) { setAddrMsg('Failed to save address.'); return }
      if (newAddrDefault) {
        setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: false })).concat(data))
      } else {
        setAddresses((prev) => prev.concat(data))
      }
      setShowAddAddress(false)
      setNewAddrQuery(''); setNewAddrLabel(''); setNewAddrPhone(''); setNewAddrInstructions(''); setNewAddrDefault(false)
    } catch {
      setAddrMsg('Unable to reach the server.')
    } finally {
      setIsSavingAddr(false)
    }
  }

  async function handleSetDefaultAddress(id: string) {
    const res = await fetch(buildApiUrl(`/api/auth/addresses/${id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ isDefault: true }),
    })
    if (res.ok) setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })))
  }

  async function handleDeleteAddress(id: string) {
    const res = await fetch(buildApiUrl(`/api/auth/addresses/${id}`), { method: 'DELETE', headers: getAuthHeader() })
    if (res.ok || res.status === 204) {
      setAddresses((prev) => {
        const remaining = prev.filter((a) => a.id !== id)
        const wasDefault = prev.find((a) => a.id === id)?.isDefault
        if (wasDefault && remaining.length > 0) remaining[0].isDefault = true
        return remaining
      })
    }
  }

  // ── Payment methods ───────────────────────────────────────────────────────────

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
    setIsSavingCard(true); setCardMsg('')
    try {
      const digits = newCardNumber.replace(/\s/g, '')
      const lastFour = digits.slice(-4)
      const cardType = detectCardType(newCardNumber)
      const res = await fetch(buildApiUrl('/api/auth/payment-methods'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ cardholderName: newCardName.trim(), lastFour, maskedNumber: `•••• •••• •••• ${lastFour}`, expiry: newCardExpiry, cardType: cardType || null, isDefault: newCardDefault }),
      })
      const data = (await res.json()) as SavedPaymentMethod
      if (!res.ok) { setCardMsg('Failed to save card.'); return }
      if (newCardDefault) {
        setPayments((prev) => prev.map((p) => ({ ...p, isDefault: false })).concat(data))
      } else {
        setPayments((prev) => prev.concat(data))
      }
      setShowAddPayment(false)
      setNewCardName(''); setNewCardNumber(''); setNewCardExpiry(''); setNewCardCvv(''); setNewCardDefault(false); setCardErrors({})
    } catch {
      setCardMsg('Unable to reach the server.')
    } finally {
      setIsSavingCard(false)
    }
  }

  async function handleSetDefaultPayment(id: string) {
    const res = await fetch(buildApiUrl(`/api/auth/payment-methods/${id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ isDefault: true }),
    })
    if (res.ok) setPayments((prev) => prev.map((p) => ({ ...p, isDefault: p.id === id })))
  }

  async function handleDeletePayment(id: string) {
    const res = await fetch(buildApiUrl(`/api/auth/payment-methods/${id}`), { method: 'DELETE', headers: getAuthHeader() })
    if (res.ok || res.status === 204) {
      setPayments((prev) => {
        const remaining = prev.filter((p) => p.id !== id)
        const wasDefault = prev.find((p) => p.id === id)?.isDefault
        if (wasDefault && remaining.length > 0) remaining[0].isDefault = true
        return remaining
      })
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────────

  async function handleReorder(order: Order) {
    if (!buyer || reorderingId) return
    setReorderingId(order.id)
    try {
      const res = await fetch(buildApiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          buyerId: buyer.id,
          supplierId: order.supplier.id,
          items: order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { id: string }
        setOrders((prev) => [{ ...order, id: data.id, status: 'PENDING', createdAt: new Date().toISOString(), woltTrackingUrl: null, woltStatus: null }, ...prev])
      }
    } catch { /* ignore */ } finally {
      setReorderingId(null)
    }
  }

  // ── Security ──────────────────────────────────────────────────────────────────

  async function handleChangePassword() {
    if (isSavingPw) return
    setPwMsg(null)
    if (!currentPw || !newPw || !confirmPw) { setPwMsg({ ok: false, text: 'All fields are required.' }); return }
    if (newPw.length < 8) { setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return }
    setIsSavingPw(true)
    try {
      const res = await fetch(buildApiUrl('/api/auth/password'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const data = (await res.json()) as { message: string }
      if (!res.ok) { setPwMsg({ ok: false, text: data.message ?? 'Failed to update password.' }); return }
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setPwMsg({ ok: true, text: 'Password updated successfully.' })
    } catch {
      setPwMsg({ ok: false, text: 'Unable to reach the server.' })
    } finally {
      setIsSavingPw(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!isReady || !buyer) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
      </main>
    )
  }

  const inputCls = 'w-full rounded-lg border border-[#dfe5da] px-3 py-2 text-sm outline-none focus:border-[#1f7b3a] focus:ring-2 focus:ring-[#1f7b3a]/20'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-700'

  return (
    <main className="min-h-screen bg-[#f3f4f6]">
      <header className="border-b border-[#dfe5da] bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a href="/marketplace/dashboard" className="text-sm font-bold text-[#1f7b3a]">LocalSupply</a>
          <nav className="flex items-center gap-4">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className={`text-sm font-medium ${item.href === '/settings' ? 'text-[#1f7b3a]' : 'text-gray-500 hover:text-gray-800'}`}>
                {item.label}
              </a>
            ))}
            <button
              onClick={() => {
                try { window.localStorage.removeItem(BUYER_STORAGE_KEY); window.localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
                window.location.href = '/login'
              }}
              className="text-sm font-medium text-red-500 hover:text-red-700"
              type="button"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <h1 className="mb-1 text-2xl font-bold text-gray-900">Account settings</h1>
          <p className="text-sm text-gray-500">{buyer.firstName} {buyer.lastName} &middot; {buyer.email}</p>
        </div>

        {/* Tab nav */}
        <div className="mb-6 flex gap-1 rounded-xl border border-[#dfe5da] bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${activeTab === t.id ? 'bg-[#1f7b3a] text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Profile tab ── */}
        {activeTab === 'profile' && (
          <section className="space-y-4">
            <div className="rounded-xl border border-[#dfe5da] bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Profile info</h2>
                {!editingProfile ? (
                  <button type="button" onClick={() => { setEditingProfile(true); setProfileMsg(null) }} className="text-xs font-semibold text-[#1f7b3a] hover:underline">Edit</button>
                ) : (
                  <button type="button" onClick={() => { setEditingProfile(false); setProfileFirstName(buyer.firstName); setProfileLastName(buyer.lastName); setProfileMsg(null) }} className="text-xs text-gray-400 hover:underline">Cancel</button>
                )}
              </div>

              {editingProfile ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>First name</label>
                      <input type="text" value={profileFirstName} onChange={(e) => setProfileFirstName(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Last name</label>
                      <input type="text" value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Email <span className="font-normal text-gray-400">(cannot be changed)</span></label>
                    <div className="rounded-lg border border-[#dfe5da] bg-gray-50 px-3 py-2 text-sm text-gray-500">{buyer.email}</div>
                  </div>
                  {profileMsg && <p className={`text-xs ${profileMsg.ok ? 'text-[#1a7a34]' : 'text-red-500'}`}>{profileMsg.text}</p>}
                  <button type="button" onClick={handleSaveProfile} disabled={isSavingProfile} className="rounded-lg bg-[#1f7b3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#176330] disabled:opacity-60">
                    {isSavingProfile ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">First name</p>
                    <p className="text-sm text-gray-800">{buyer.firstName}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">Last name</p>
                    <p className="text-sm text-gray-800">{buyer.lastName}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-xs font-medium text-gray-500">Email</p>
                    <p className="text-sm text-gray-800">{buyer.email}</p>
                  </div>
                  {profileMsg?.ok && <p className="sm:col-span-2 text-xs text-[#1a7a34]">{profileMsg.text}</p>}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#dfe5da] bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-gray-900">Quick summary</h2>
              <div className="space-y-2 text-sm text-gray-700">
                <p><span className="font-medium">{addresses.length}</span> saved {addresses.length === 1 ? 'address' : 'addresses'}</p>
                <p><span className="font-medium">{payments.length}</span> saved {payments.length === 1 ? 'card' : 'cards'}</p>
              </div>
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => setActiveTab('addresses')} className="rounded-lg border border-[#dfe5da] px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Manage addresses</button>
                <button type="button" onClick={() => setActiveTab('payment')} className="rounded-lg border border-[#dfe5da] px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Manage cards</button>
              </div>
            </div>
          </section>
        )}

        {/* ── Addresses tab ── */}
        {activeTab === 'addresses' && (
          <section className="rounded-xl border border-[#dfe5da] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Delivery addresses</h2>
                <p className="text-xs text-gray-500">Saved addresses autofill at checkout.</p>
              </div>
              <button type="button" onClick={() => setShowAddAddress((v) => !v)} className="rounded-lg bg-[#1f7b3a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#176330]">
                {showAddAddress ? 'Cancel' : '+ Add address'}
              </button>
            </div>

            {addresses.length === 0 && !showAddAddress && (
              <div className="rounded-2xl border border-dashed border-[#d2dcd0] bg-[#f8fbf7] px-5 py-8 text-center">
                <p className="text-sm font-semibold text-[#304136]">No saved addresses yet</p>
                <p className="mt-1 text-xs text-[#728176]">Add an address and it will autofill at checkout.</p>
                <button type="button" onClick={() => setShowAddAddress(true)} className="mt-3 rounded-lg bg-[#1f7b3a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#176330]">
                  Add your first address
                </button>
              </div>
            )}

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
                        <button type="button" onClick={() => handleSetDefaultAddress(addr.id)} className="text-xs font-medium text-[#1f7b3a] hover:underline">Set default</button>
                      )}
                      <button type="button" onClick={() => handleDeleteAddress(addr.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showAddAddress && (
              <div className="mt-4 rounded-lg border border-[#dfe5da] bg-[#f9fafb] p-4 space-y-3">
                <div ref={addrRef} className="relative">
                  <label className={labelCls}>Address</label>
                  <input
                    type="text" value={newAddrQuery} onChange={(e) => setNewAddrQuery(e.target.value)}
                    placeholder="Start typing your address..." className={inputCls}
                  />
                  {isSearchingAddr && <span className="absolute right-3 top-8 text-xs text-gray-400">Searching...</span>}
                  {showAddrSuggestions && newAddrSuggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#dfe5da] bg-white shadow-lg">
                      {newAddrSuggestions.map((addr, i) => (
                        <li key={i}>
                          <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-[#f3f4f6]" onMouseDown={(e) => { e.preventDefault(); selectNewAddr(addr) }}>
                            <span className="font-medium">{addr.adressetekst}</span>
                            <span className="ml-2 text-gray-400">{addr.postnummer} {addr.poststed}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Label <span className="font-normal text-gray-400">(optional)</span></label>
                    <input type="text" value={newAddrLabel} onChange={(e) => setNewAddrLabel(e.target.value)} placeholder="e.g. Home, Work" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Phone <span className="font-normal text-gray-400">(optional)</span></label>
                    <input type="tel" value={newAddrPhone} onChange={(e) => setNewAddrPhone(e.target.value.slice(0, 20))} placeholder="+47 900 00 000" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Delivery instructions <span className="font-normal text-gray-400">(optional)</span></label>
                  <input type="text" value={newAddrInstructions} onChange={(e) => setNewAddrInstructions(e.target.value)} placeholder="e.g. Ring the bell, leave at door" className={inputCls} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={newAddrDefault} onChange={(e) => setNewAddrDefault(e.target.checked)} className="rounded" />
                  Set as default address
                </label>
                {addrMsg && <p className="text-xs text-red-500">{addrMsg}</p>}
                <button type="button" onClick={handleSaveAddress} disabled={isSavingAddr} className="rounded-lg bg-[#1f7b3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#176330] disabled:opacity-60">
                  {isSavingAddr ? 'Saving...' : 'Save address'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Payment tab ── */}
        {activeTab === 'payment' && (
          <section className="rounded-xl border border-[#dfe5da] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Payment methods</h2>
                <p className="text-xs text-gray-500">Saved cards can be selected at checkout. CVV is always required when placing an order.</p>
              </div>
              <button type="button" onClick={() => setShowAddPayment((v) => !v)} className="rounded-lg bg-[#1f7b3a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#176330]">
                {showAddPayment ? 'Cancel' : '+ Add card'}
              </button>
            </div>

            {payments.length === 0 && !showAddPayment && (
              <div className="rounded-2xl border border-dashed border-[#d2dcd0] bg-[#f8fbf7] px-5 py-8 text-center">
                <p className="text-sm font-semibold text-[#304136]">No saved cards yet</p>
                <p className="mt-1 text-xs text-[#728176]">Save a card to speed up checkout.</p>
                <button type="button" onClick={() => setShowAddPayment(true)} className="mt-3 rounded-lg bg-[#1f7b3a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#176330]">Add a card</button>
              </div>
            )}

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
                        <button type="button" onClick={() => handleSetDefaultPayment(pm.id)} className="text-xs font-medium text-[#1f7b3a] hover:underline">Set default</button>
                      )}
                      <button type="button" onClick={() => handleDeletePayment(pm.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showAddPayment && (
              <div className="mt-4 rounded-lg border border-[#dfe5da] bg-[#f9fafb] p-4 space-y-3">
                <div>
                  <label className={labelCls}>Cardholder name</label>
                  <input autoComplete="cc-name" type="text" value={newCardName} onChange={(e) => { setNewCardName(e.target.value); setCardErrors((p) => ({ ...p, name: undefined })) }} placeholder="Full name on card" className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.name ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`} />
                  {cardErrors.name && <p className="mt-1 text-xs text-red-500">{cardErrors.name}</p>}
                </div>
                <div>
                  <label className={labelCls}>
                    Card number
                    {detectCardType(newCardNumber) && <span className="ml-2 font-normal text-[#1f7b3a]">{detectCardType(newCardNumber)}</span>}
                  </label>
                  <input autoComplete="cc-number" type="text" inputMode="numeric" value={newCardNumber} onChange={(e) => { setNewCardNumber(formatCardNumber(e.target.value)); setCardErrors((p) => ({ ...p, number: undefined })) }} placeholder="0000 0000 0000 0000" maxLength={19} className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.number ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`} />
                  {cardErrors.number && <p className="mt-1 text-xs text-red-500">{cardErrors.number}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Expiry</label>
                    <input autoComplete="cc-exp" type="text" inputMode="numeric" value={newCardExpiry} onChange={(e) => { setNewCardExpiry(formatExpiry(e.target.value)); setCardErrors((p) => ({ ...p, expiry: undefined })) }} placeholder="MM/YY" maxLength={5} className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.expiry ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`} />
                    {cardErrors.expiry && <p className="mt-1 text-xs text-red-500">{cardErrors.expiry}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>CVV</label>
                    <input autoComplete="cc-csc" type="text" inputMode="numeric" value={newCardCvv} onChange={(e) => { setNewCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors((p) => ({ ...p, cvv: undefined })) }} placeholder="CVV" maxLength={4} className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[#1f7b3a]/20 ${cardErrors.cvv ? 'border-red-400' : 'border-[#dfe5da] focus:border-[#1f7b3a]'}`} />
                    {cardErrors.cvv && <p className="mt-1 text-xs text-red-500">{cardErrors.cvv}</p>}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={newCardDefault} onChange={(e) => setNewCardDefault(e.target.checked)} className="rounded" />
                  Set as default payment method
                </label>
                {cardMsg && <p className="text-xs text-red-500">{cardMsg}</p>}
                <button type="button" onClick={handleSaveCard} disabled={isSavingCard} className="rounded-lg bg-[#1f7b3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#176330] disabled:opacity-60">
                  {isSavingCard ? 'Saving...' : 'Save card'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Orders tab ── */}
        {activeTab === 'orders' && (
          <section className="space-y-3">
            {ordersLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d2dcd0] bg-[#f8fbf7] px-5 py-12 text-center">
                <p className="text-sm font-semibold text-[#304136]">No orders yet</p>
                <p className="mt-1 text-xs text-[#728176]">Your order history will appear here.</p>
                <a href="/marketplace/dashboard" className="mt-3 inline-block rounded-lg bg-[#1f7b3a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#176330]">Browse marketplace</a>
              </div>
            ) : (
              orders.map((order) => {
                const isExpanded = expandedOrderId === order.id
                return (
                  <div key={order.id} className="rounded-xl border border-[#dfe5da] bg-white overflow-hidden">
                    <div className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400">#{order.id.slice(-8).toUpperCase()}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[order.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>{statusLabel(order.status)}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-gray-800">{order.supplier.businessName}</p>
                        <p className="text-xs text-gray-500">{formatDate(order.createdAt)} · {order.items.length} {order.items.length === 1 ? 'item' : 'items'} · kr {fmt(order.total)}</p>
                        {order.woltTrackingUrl && order.status === 'IN_TRANSIT' && (
                          <a href={order.woltTrackingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium text-[#1f7b3a] underline">Track delivery</a>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleReorder(order)}
                          disabled={!!reorderingId}
                          className="rounded-lg bg-[#1f7b3a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#176330] disabled:opacity-60"
                        >
                          {reorderingId === order.id ? 'Ordering...' : 'Reorder'}
                        </button>
                        <button type="button" onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="text-xs text-gray-400 hover:text-gray-700">
                          {isExpanded ? 'Hide details' : 'Details'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[#f0f0f0] bg-[#fafafa] px-4 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="pb-1 text-left font-medium">Item</th>
                              <th className="pb-1 text-right font-medium">Qty</th>
                              <th className="pb-1 text-right font-medium">Price</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f0f0f0]">
                            {order.items.map((item) => (
                              <tr key={item.id}>
                                <td className="py-1.5 text-gray-700">{item.name}</td>
                                <td className="py-1.5 text-right text-gray-600">{item.quantity} {item.unit}</td>
                                <td className="py-1.5 text-right text-gray-700">kr {fmt(Number(item.unitPrice) * item.quantity)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-2 flex flex-col items-end gap-0.5 text-xs text-gray-500">
                          <span>Subtotal: kr {fmt(order.subtotal)}</span>
                          {Number(order.deliveryFee) > 0 && <span>Delivery: kr {fmt(order.deliveryFee)}</span>}
                          <span className="font-semibold text-gray-800">Total: kr {fmt(order.total)}</span>
                        </div>
                        {order.notes && <p className="mt-2 text-xs text-gray-500 italic">Notes: {order.notes}</p>}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </section>
        )}

        {/* ── Security tab ── */}
        {activeTab === 'security' && (
          <section className="space-y-4">
            <div className="rounded-xl border border-[#dfe5da] bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-gray-900">Change password</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Current password</label>
                  <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={inputCls} autoComplete="current-password" />
                </div>
                <div>
                  <label className={labelCls}>New password <span className="font-normal text-gray-400">(min. 8 characters)</span></label>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} autoComplete="new-password" />
                </div>
                <div>
                  <label className={labelCls}>Confirm new password</label>
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} autoComplete="new-password" />
                </div>
                {pwMsg && <p className={`text-xs ${pwMsg.ok ? 'text-[#1a7a34]' : 'text-red-500'}`}>{pwMsg.text}</p>}
                <button type="button" onClick={handleChangePassword} disabled={isSavingPw} className="rounded-lg bg-[#1f7b3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#176330] disabled:opacity-60">
                  {isSavingPw ? 'Saving...' : 'Update password'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#dfe5da] bg-white p-6">
              <h2 className="mb-1 text-base font-semibold text-gray-900">Account</h2>
              <p className="mb-4 text-xs text-gray-500">Permanently delete your account and all associated data. This cannot be undone.</p>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Delete account
                </button>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Are you sure? This will permanently delete your account, orders, and saved data.</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsDeletingAccount(true)
                        try {
                          const res = await fetch(buildApiUrl('/api/auth/account'), { method: 'DELETE', headers: getAuthHeader() })
                          if (res.ok || res.status === 204) {
                            try { window.localStorage.removeItem(BUYER_STORAGE_KEY); window.localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
                            window.location.href = '/login'
                          }
                        } catch { /* ignore */ } finally {
                          setIsDeletingAccount(false)
                        }
                      }}
                      disabled={isDeletingAccount}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {isDeletingAccount ? 'Deleting...' : 'Yes, delete my account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
