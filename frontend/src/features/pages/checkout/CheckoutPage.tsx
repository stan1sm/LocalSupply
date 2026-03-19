'use client'

import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

const CART_STORAGE_KEY = 'localsupply-marketplace-cart'
const BUYER_STORAGE_KEY = 'localsupply-user'

type CartItem = {
  id: string
  imageUrl: string | null
  name: string
  price: number
  quantity: number
  store: string | null
  unitInfo: string | null
}

type BuyerSession = {
  id: string
  firstName: string
  lastName: string
  email: string
  address: string | null
  phone: string | null
}

type MatchedStoreItem = {
  brand: string | null
  catalogProductId: string
  imageUrl: string | null
  lineTotal: number
  name: string
  quantity: number
  unitPrice: number
}

type MatchedStore = {
  deliveryCost: number
  eta: string
  etaMinutes: number
  items: MatchedStoreItem[]
  itemsAvailable: number
  itemsRequested: number
  storeCode: string
  storeName: string
  subtotal: number
  total: number
}

type MatchResponse = {
  bestMatch: MatchedStore | null
  savings: number
  stores: MatchedStore[]
  totalCartItems: number
}

type GeoNorgeAddress = {
  adressetekst: string
  postnummer: string
  poststed: string
  kommunenavn: string
}

type PaymentMethod = 'vipps' | 'card'

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

type WoltEstimate = {
  ok: true
  fee: number
  etaMinutes: number
  currency: string
}

type WoltError = {
  ok: false
  errorCode: string
  message: string
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} kr`
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

function etaLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

const WOLT_CLOSED_CODES = new Set([
  'DELIVERY_AREA_CLOSED',
  'DELIVERY_AREA_CLOSED_TEMPORARILY',
  'REQUEST_OUTSIDE_DELIVERY_HOURS',
  'VENUE_CLOSED',
])

const WOLT_OUTSIDE_AREA_CODES = new Set([
  'DROPOFF_OUTSIDE_OF_DELIVERY_AREA',
  'INVALID_DROPOFF_ADDRESS',
])

export default function CheckoutPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [buyer, setBuyer] = useState<BuyerSession | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null)
  const [selectedStore, setSelectedStore] = useState<MatchedStore | null>(null)
  const [isMatching, setIsMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [isReady, setIsReady] = useState(false)

  // Saved addresses + payment methods
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [savedPayments, setSavedPayments] = useState<SavedPaymentMethod[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'manual'>('manual')
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | 'new'>('new')

  // Address
  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<GeoNorgeAddress[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const addressRef = useRef<HTMLDivElement>(null)

  // Wolt real-time delivery estimate
  const [woltEstimate, setWoltEstimate] = useState<WoltEstimate | null>(null)
  const [woltError, setWoltError] = useState<WoltError | null>(null)
  const [isFetchingWolt, setIsFetchingWolt] = useState(false)
  const woltTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [vippsPhone, setVippsPhone] = useState('')
  const [cardErrors, setCardErrors] = useState<{ number?: string; expiry?: string; cvv?: string; name?: string }>({})

  // Order
  const [notes, setNotes] = useState('')
  const [isPlacing, setIsPlacing] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [placedTrackingUrl, setPlacedTrackingUrl] = useState<string | null>(null)

  const [expandedStore, setExpandedStore] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BUYER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as BuyerSession
        if (parsed?.id) {
          setBuyer(parsed)
          if (parsed.address) setAddressQuery(parsed.address)
          if (parsed.phone) setVippsPhone(parsed.phone)
        }
      }
    } catch { /* ignore */ }

    try {
      const stored = window.localStorage.getItem(CART_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[]
        if (Array.isArray(parsed)) setCartItems(parsed)
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    }

    setIsReady(true)
  }, [])

  useEffect(() => {
    if (isReady && !buyer) {
      window.location.href = '/login?redirect=/checkout'
    }
  }, [isReady, buyer])

  // Load saved addresses and payment methods
  useEffect(() => {
    if (!buyer) return
    const uid = encodeURIComponent(buyer.id)

    fetch(buildApiUrl(`/api/auth/addresses?userId=${uid}`))
      .then((r) => r.json())
      .then((data: SavedAddress[]) => {
        if (Array.isArray(data)) {
          setSavedAddresses(data)
          const def = data.find((a) => a.isDefault) ?? data[0]
          if (def) {
            setSelectedAddressId(def.id)
            setAddressQuery(def.address)
          }
        }
      })
      .catch(() => { /* ignore */ })

    fetch(buildApiUrl(`/api/auth/payment-methods?userId=${uid}`))
      .then((r) => r.json())
      .then((data: SavedPaymentMethod[]) => {
        if (Array.isArray(data)) {
          setSavedPayments(data)
          const def = data.find((p) => p.isDefault) ?? data[0]
          if (def) setSelectedPaymentId(def.id)
        }
      })
      .catch(() => { /* ignore */ })
  }, [buyer])

  // When saved address selection changes, update addressQuery
  useEffect(() => {
    if (selectedAddressId === 'manual') return
    const found = savedAddresses.find((a) => a.id === selectedAddressId)
    if (found) setAddressQuery(found.address)
  }, [selectedAddressId, savedAddresses])

  // Debounced Wolt estimate fetch whenever address changes
  useEffect(() => {
    if (woltTimerRef.current) clearTimeout(woltTimerRef.current)

    const addr = addressQuery.trim()
    if (addr.length < 8) {
      setWoltEstimate(null)
      setWoltError(null)
      return
    }

    woltTimerRef.current = setTimeout(async () => {
      setIsFetchingWolt(true)
      try {
        const res = await fetch(buildApiUrl('/api/wolt/estimate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dropoffAddress: addr }),
        })
        const data = (await res.json()) as WoltEstimate | WoltError
        if (data.ok) {
          setWoltEstimate(data)
          setWoltError(null)
        } else {
          setWoltEstimate(null)
          setWoltError(data)
        }
      } catch {
        setWoltEstimate(null)
        setWoltError(null)
      } finally {
        setIsFetchingWolt(false)
      }
    }, 900)

    return () => {
      if (woltTimerRef.current) clearTimeout(woltTimerRef.current)
    }
  }, [addressQuery])

  // Run store match
  useEffect(() => {
    if (!isReady || cartItems.length === 0) return
    let cancelled = false

    async function runMatch() {
      setIsMatching(true)
      setMatchError('')
      try {
        const response = await fetch(buildApiUrl('/api/cart/match'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cartItems.map((item) => ({ priceId: item.id, quantity: item.quantity })),
          }),
        })
        const payload = (await response.json()) as MatchResponse
        if (!cancelled && response.ok) {
          setMatchResult(payload)
          const params = new URLSearchParams(window.location.search)
          const storeParam = params.get('store')
          const stores = payload.stores ?? []
          const match = (storeParam ? stores.find((s) => s.storeCode === storeParam) : null) ?? payload.bestMatch
          setSelectedStore(match ?? null)
          if (match) setExpandedStore(match.storeCode)
        } else if (!cancelled) {
          setMatchError('Could not match your cart to stores right now.')
        }
      } catch {
        if (!cancelled) setMatchError('Could not match your cart to stores right now.')
      } finally {
        if (!cancelled) setIsMatching(false)
      }
    }

    runMatch()
    return () => { cancelled = true }
  }, [isReady, cartItems])

  // GeoNorge address autocomplete (only for manual entry)
  useEffect(() => {
    if (selectedAddressId !== 'manual') return
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
  }, [addressQuery, selectedAddressId])

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

  function getUnavailableItems(store: MatchedStore): CartItem[] {
    const matchedNames = new Set(store.items.map((i) => i.name.toLowerCase()))
    return cartItems.filter((ci) => !matchedNames.has(ci.name.toLowerCase()))
  }

  // Effective delivery cost/eta for a store — uses Wolt if available
  function effectiveDeliveryCost(store: MatchedStore): number {
    return woltEstimate ? woltEstimate.fee : store.deliveryCost
  }

  function effectiveEta(store: MatchedStore): string {
    return woltEstimate ? etaLabel(woltEstimate.etaMinutes) : store.eta
  }

  function effectiveTotal(store: MatchedStore): number {
    return Math.round((store.subtotal + effectiveDeliveryCost(store)) * 100) / 100
  }

  function validateCard(): boolean {
    const errors: typeof cardErrors = {}
    if (!cardName.trim()) errors.name = 'Cardholder name is required'
    if (!validateCardNumber(cardNumber)) errors.number = 'Enter a valid 16-digit card number'
    if (!validateExpiry(cardExpiry)) errors.expiry = 'Enter a valid expiry (MM/YY)'
    if (!validateCvv(cardCvv)) errors.cvv = 'Enter a valid CVV (3–4 digits)'
    setCardErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handlePlaceOrder() {
    if (!selectedStore || !buyer || isPlacing) return
    if (!addressQuery.trim()) {
      setOrderError('Please enter a delivery address.')
      return
    }
    if (paymentMethod === 'card' && selectedPaymentId === 'new') {
      if (!validateCard()) return
    }

    setOrderError('')
    setIsPlacing(true)

    try {
      let paymentNote: string
      if (paymentMethod === 'vipps') {
        paymentNote = `Payment: Vipps (${vippsPhone})`
      } else if (selectedPaymentId !== 'new') {
        const saved = savedPayments.find((p) => p.id === selectedPaymentId)
        paymentNote = saved ? `Payment: ${saved.cardType ?? 'Card'} ${saved.maskedNumber}` : 'Payment: Saved card'
      } else {
        paymentNote = `Payment: Card ending in ${cardNumber.replace(/\s/g, '').slice(-4)}`
      }

      const deliveryCost = effectiveDeliveryCost(selectedStore)

      const response = await fetch(buildApiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId: buyer.id,
          deliveryFee: deliveryCost,
          deliveryAddress: addressQuery.trim(),
          items: selectedStore.items.map((item) => ({
            name: item.name,
            unit: 'unit',
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
          notes: [
            `Store: ${selectedStore.storeName}`,
            `Delivery to: ${addressQuery.trim()}`,
            woltEstimate ? `Wolt delivery: ${formatCurrency(woltEstimate.fee)}, ~${etaLabel(woltEstimate.etaMinutes)}` : null,
            paymentNote,
            notes ? `Note: ${notes}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { message?: string; woltTrackingUrl?: string }

      if (!response.ok) {
        setOrderError(payload.message ?? 'Unable to place order right now.')
        return
      }

      window.localStorage.removeItem(CART_STORAGE_KEY)

      if (payload.woltTrackingUrl) {
        setPlacedTrackingUrl(payload.woltTrackingUrl)
      } else {
        window.location.href = '/orders'
      }
    } catch {
      setOrderError('Unable to place order right now.')
    } finally {
      setIsPlacing(false)
    }
  }

  if (!isReady) return null

  // Order placed — show tracking screen
  if (placedTrackingUrl) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-8 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#dcf5e2]">
            <svg className="h-7 w-7 text-[#1f7b3a]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Order placed</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">Your order is confirmed</h1>
          <p className="mt-2 text-sm text-[#5b665f]">Wolt is arranging your delivery. You can track your courier in real time.</p>
          <div className="mt-6 flex flex-col gap-3">
            <a
              href={placedTrackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#2f9f4f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" strokeLinecap="round" />
              </svg>
              Track my delivery
            </a>
            <a
              href="/orders"
              className="rounded-2xl border border-[#d4ddcf] bg-white px-5 py-3 text-sm font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
            >
              View my orders
            </a>
          </div>
        </div>
      </main>
    )
  }

  if (cartItems.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Checkout</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">Your cart is empty</h1>
          <a className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]" href="/marketplace/dashboard">Browse Marketplace</a>
        </div>
      </main>
    )
  }

  const stores = matchResult?.stores ?? []
  const savings = matchResult?.savings ?? 0
  const usingNewCard = paymentMethod === 'card' && selectedPaymentId === 'new'

  const woltDeliveryClosed = woltError && WOLT_CLOSED_CODES.has(woltError.errorCode)
  const woltOutsideArea = woltError && WOLT_OUTSIDE_AREA_CODES.has(woltError.errorCode)
  const woltUnavailable = woltError && woltError.errorCode === 'WOLT_UNAVAILABLE'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1300px] gap-6 lg:grid-cols-[220px_minmax(0,1fr)_360px]">

        {/* Sidebar */}
        <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="px-2 pb-4">
            <a className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]" href="/">
              <span aria-hidden="true">←</span>
              <span>LocalSupply</span>
            </a>
          </div>
          <nav aria-label="Checkout navigation" className="space-y-1">
            {[
              { id: 'marketplace', label: 'Marketplace', icon: 'M', href: '/marketplace/dashboard' },
              { id: 'suppliers', label: 'Suppliers', icon: 'S', href: '/suppliers' },
              { id: 'my-cart', label: 'My Cart', icon: 'C', href: '/cart' },
              { id: 'orders', label: 'Orders', icon: 'O', href: '/orders' },
              { id: 'delivery', label: 'Delivery Tracking', icon: 'T', href: '#' },
              { id: 'settings', label: 'Settings', icon: 'G', href: '/settings' },
            ].map((item) => (
              <a
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-[#4f5d52] transition hover:bg-[#f6faf5] hover:text-[#1f2b22]"
                href={item.href}
                key={item.id}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#d6dfd2] bg-white text-xs font-bold text-[#5a675d]">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Store selection */}
        <section className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="border-b border-[#e5ece2] px-5 py-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Checkout — step 1</p>
            <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">Choose a store</h1>
            <p className="mt-1 text-sm text-[#617166]">Select where you want to order from. Delivery pricing updates live via Wolt once you enter your address.</p>
          </div>

          {/* Wolt status banner */}
          {(woltDeliveryClosed || woltOutsideArea) && !isFetchingWolt ? (
            <div className={`mx-5 mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${woltDeliveryClosed ? 'border-[#f0c070] bg-[#fffbea] text-[#7a5000]' : 'border-[#f0d4d4] bg-[#fff5f5] text-[#9b2c2c]'}`}>
              <span className="mt-0.5 text-base">{woltDeliveryClosed ? '🕐' : '📍'}</span>
              <div>
                <p className="font-semibold">{woltDeliveryClosed ? 'Wolt delivery is currently closed' : 'Outside Wolt delivery area'}</p>
                <p className="mt-0.5 text-xs opacity-80">{woltError!.message} Showing estimated delivery times instead.</p>
              </div>
            </div>
          ) : woltEstimate && !isFetchingWolt ? (
            <div className="mx-5 mt-4 flex items-center gap-3 rounded-2xl border border-[#b2d4bc] bg-[#f0faf2] px-4 py-2.5 text-sm text-[#1a5e30]">
              <span className="shrink-0 text-base">🛵</span>
              <span><span className="font-semibold">Wolt delivery</span> — {formatCurrency(woltEstimate.fee)} · ~{etaLabel(woltEstimate.etaMinutes)} · Live pricing</span>
            </div>
          ) : isFetchingWolt ? (
            <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-[#e5ece2] bg-[#f8fbf7] px-4 py-2.5 text-sm text-[#6d7b70]">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#2f9f4f]/40 border-t-[#2f9f4f]" />
              Fetching live Wolt delivery price…
            </div>
          ) : null}

          <div className="px-5 py-5 space-y-3">
            {isMatching ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div className="animate-pulse rounded-2xl border border-[#e6ede3] bg-[#f8faf7] p-4" key={i}>
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-[#e2e9df]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 rounded bg-[#e2e9df]" />
                      <div className="h-3 w-1/2 rounded bg-[#e2e9df]" />
                    </div>
                    <div className="h-5 w-20 rounded bg-[#e2e9df]" />
                  </div>
                </div>
              ))
            ) : matchError ? (
              <div className="rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">{matchError}</div>
            ) : stores.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#cfd9cb] bg-[#f8fbf7] p-6 text-center">
                <p className="text-sm font-semibold text-[#304136]">No stores matched your cart</p>
                <p className="mt-2 text-xs text-[#6c7c71]">The products in your cart may not be in the catalog yet.</p>
                <a className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]" href="/cart">Back to Cart</a>
              </div>
            ) : (
              <>
                {savings > 0 && matchResult?.bestMatch ? (
                  <div className="rounded-2xl bg-[#f0faf2] px-4 py-2.5 text-sm text-[#1a7a34]">
                    Save <span className="font-bold">{formatCurrency(savings)}</span> by choosing {matchResult.bestMatch.storeName}
                  </div>
                ) : null}

                {stores.map((store) => {
                  const isSelected = selectedStore?.storeCode === store.storeCode
                  const isBest = store.storeCode === matchResult?.bestMatch?.storeCode
                  const unavailable = getUnavailableItems(store)
                  const hasPartial = store.itemsAvailable < store.itemsRequested
                  const isExpanded = expandedStore === store.storeCode
                  const dispDeliveryCost = effectiveDeliveryCost(store)
                  const dispEta = effectiveEta(store)
                  const dispTotal = effectiveTotal(store)

                  return (
                    <div key={store.storeCode} className={`rounded-2xl border-2 transition ${isSelected ? 'border-[#2f9f4f]' : 'border-[#e5ece2]'}`}>
                      <button
                        className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition ${isSelected ? 'bg-[#f0faf2]' : 'bg-white hover:bg-[#f8fbf7]'}`}
                        onClick={() => {
                          setSelectedStore(store)
                          setExpandedStore(isExpanded && isSelected ? null : store.storeCode)
                        }}
                        type="button"
                      >
                        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${isSelected ? 'bg-[#2f9f4f] text-white' : 'bg-[#e8f5ea] text-[#2f9f4f]'}`}>
                          {store.storeName.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-[#1f2b22]">{store.storeName}</p>
                            {isBest ? <span className="rounded-full bg-[#dcf5e2] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a34]">Best price</span> : null}
                            {woltEstimate ? <span className="rounded-full bg-[#e0f0ff] px-2 py-0.5 text-[10px] font-semibold text-[#1a4a7a]">🛵 Wolt</span> : null}
                          </div>
                          <p className="mt-0.5 text-xs text-[#6d7b70]">
                            ETA: {dispEta} ·{' '}
                            <span className={hasPartial ? 'text-[#c07e00]' : 'text-[#2f9f4f]'}>
                              {store.itemsAvailable}/{store.itemsRequested} items available
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-[#1f2b22]">{formatCurrency(dispTotal)}</p>
                          <p className="text-xs text-[#6d7b70]">incl. {formatCurrency(dispDeliveryCost)} delivery</p>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          {isSelected ? (
                            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#2f9f4f] text-[10px] text-white">✓</span>
                          ) : (
                            <span className="h-5 w-5 rounded-full border-2 border-[#d4ddd0]" />
                          )}
                          <span className="text-[10px] text-[#9ca3af]">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {isExpanded ? (
                        <div className="border-t border-[#eef2ec] px-4 pb-4 pt-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#6b7b70]">Items breakdown</p>
                          <div className="space-y-1.5">
                            {store.items.map((item) => (
                              <div className="flex items-center gap-2 text-xs" key={item.catalogProductId}>
                                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#dcf5e2] text-[9px] font-bold text-[#1a7a34]">✓</span>
                                <span className="min-w-0 flex-1 truncate text-[#1f2b22]">{item.name}</span>
                                <span className="shrink-0 text-[#6d7b70]">×{item.quantity}</span>
                                <span className="shrink-0 font-semibold text-[#2f9f4f]">{formatCurrency(item.lineTotal)}</span>
                              </div>
                            ))}
                            {unavailable.map((item) => (
                              <div className="flex items-center gap-2 text-xs" key={item.id}>
                                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#fef0ef] text-[9px] font-bold text-[#9b2c2c]">✕</span>
                                <span className="min-w-0 flex-1 truncate text-[#9b2c2c] line-through">{item.name}</span>
                                <span className="shrink-0 text-[#c0a0a0]">not available</span>
                              </div>
                            ))}
                          </div>
                          {unavailable.length > 0 ? (
                            <p className="mt-2 text-[11px] text-[#c07e00]">
                              {unavailable.length} item{unavailable.length > 1 ? 's' : ''} not available at this store — you can still order the rest.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </section>

        {/* Delivery + Payment + Confirm */}
        <section className="space-y-4">

          {/* Delivery details */}
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="border-b border-[#e5ece2] px-5 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Step 2 — Delivery</p>
              <p className="mt-1 text-base font-bold text-[#1f2b22]">{buyer?.firstName} {buyer?.lastName}</p>
              <p className="text-xs text-[#6d7b70]">{buyer?.email}</p>
            </div>

            <div className="space-y-4 px-5 py-4">
              {/* Saved addresses */}
              {savedAddresses.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">Delivery address</label>
                  <div className="mt-2 space-y-2">
                    {savedAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition ${selectedAddressId === addr.id ? 'border-[#2f9f4f] bg-[#f0faf2]' : 'border-[#e5ece2] bg-white hover:border-[#b2d4bc]'}`}
                      >
                        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${selectedAddressId === addr.id ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#d4ddd0]'}`}>
                          {selectedAddressId === addr.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                        </span>
                        <div className="min-w-0">
                          {addr.label ? <p className="text-xs font-semibold text-[#1f2b22]">{addr.label}</p> : null}
                          <p className="text-xs text-[#4f5d52]">{addr.address}</p>
                          {addr.phone ? <p className="text-xs text-[#6d7b70]">{addr.phone}</p> : null}
                        </div>
                        {addr.isDefault ? <span className="ml-auto shrink-0 rounded-full bg-[#dcf5e2] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a34]">Default</span> : null}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setSelectedAddressId('manual'); setAddressQuery('') }}
                      className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition ${selectedAddressId === 'manual' ? 'border-[#2f9f4f] bg-[#f0faf2]' : 'border-[#e5ece2] bg-white hover:border-[#b2d4bc]'}`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${selectedAddressId === 'manual' ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#d4ddd0]'}`}>
                        {selectedAddressId === 'manual' ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      <span className="text-xs font-semibold text-[#4f5d52]">Enter a different address</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Manual address input */}
              {(savedAddresses.length === 0 || selectedAddressId === 'manual') ? (
                <div ref={addressRef} className="relative">
                  {savedAddresses.length === 0 ? (
                    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">Delivery address</label>
                  ) : null}
                  <div className="relative mt-2">
                    <input
                      autoComplete="street-address"
                      className="w-full rounded-xl border border-[#d4ddd0] bg-[#f7faf6] px-3 py-2.5 pr-8 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                      onChange={(e) => setAddressQuery(e.target.value)}
                      onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                      placeholder="Start typing your address…"
                      type="text"
                      value={addressQuery}
                    />
                    {isSearchingAddress ? (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#2f9f4f]/40 border-t-[#2f9f4f]" />
                      </span>
                    ) : null}
                  </div>
                  {showSuggestions && addressSuggestions.length > 0 ? (
                    <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[#d4ddd0] bg-white shadow-lg">
                      {addressSuggestions.map((addr, i) => (
                        <li key={i}>
                          <button
                            className="flex w-full flex-col px-3 py-2.5 text-left text-xs hover:bg-[#f0faf2]"
                            onMouseDown={() => selectAddress(addr)}
                            type="button"
                          >
                            <span className="font-semibold text-[#1f2b22]">{addr.adressetekst}</span>
                            <span className="text-[#6d7b70]">{addr.postnummer} {addr.poststed}, {addr.kommunenavn}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">
                  Order notes <span className="font-normal normal-case text-[#9ca3af]">(optional)</span>
                </label>
                <textarea
                  className="mt-2 w-full resize-none rounded-xl border border-[#d4ddd0] bg-[#f7faf6] px-3 py-2.5 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions, gate code, etc."
                  rows={2}
                  value={notes}
                />
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="border-b border-[#e5ece2] px-5 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Step 3 — Payment</p>
            </div>

            <div className="space-y-2 px-5 py-4">
              {savedPayments.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => { setSelectedPaymentId(pm.id); setPaymentMethod('card') }}
                  className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${selectedPaymentId === pm.id ? 'border-[#2f9f4f] bg-[#f0faf2]' : 'border-[#e5ece2] bg-white hover:border-[#b2d4bc]'}`}
                >
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${selectedPaymentId === pm.id ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#d4ddd0]'}`}>
                    {selectedPaymentId === pm.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#1f2b22]">{pm.cardType ?? 'Card'} {pm.maskedNumber}</p>
                    <p className="text-xs text-[#6d7b70]">{pm.cardholderName} · Expires {pm.expiry}</p>
                  </div>
                  {pm.isDefault ? <span className="ml-auto shrink-0 rounded-full bg-[#dcf5e2] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a34]">Default</span> : null}
                </button>
              ))}

              <button
                className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${paymentMethod === 'vipps' ? 'border-[#2f9f4f] bg-[#f0faf2]' : 'border-[#e5ece2] bg-white hover:border-[#b2d4bc]'}`}
                onClick={() => { setPaymentMethod('vipps'); setSelectedPaymentId('new') }}
                type="button"
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${paymentMethod === 'vipps' ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#d4ddd0]'}`}>
                  {paymentMethod === 'vipps' ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1f2b22]">Vipps</p>
                  <p className="text-xs text-[#6d7b70]">Pay with your Vipps account</p>
                </div>
              </button>

              <button
                className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${usingNewCard ? 'border-[#2f9f4f] bg-[#f0faf2]' : 'border-[#e5ece2] bg-white hover:border-[#b2d4bc]'}`}
                onClick={() => { setPaymentMethod('card'); setSelectedPaymentId('new') }}
                type="button"
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${usingNewCard ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#d4ddd0]'}`}>
                  {usingNewCard ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1f2b22]">New credit / debit card</p>
                  <p className="text-xs text-[#6d7b70]">Visa, Mastercard</p>
                </div>
              </button>

              {usingNewCard ? (
                <div className="mt-3 space-y-3 rounded-xl border border-[#e5ece2] bg-[#f8fbf7] p-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#6b7b70]">Cardholder name</label>
                    <input
                      autoComplete="cc-name"
                      className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#1f2937] outline-none focus:ring-2 focus:ring-[#2f9f4f]/30 ${cardErrors.name ? 'border-red-400 focus:border-red-400' : 'border-[#d4ddd0] focus:border-[#2f9f4f]'}`}
                      onChange={(e) => { setCardName(e.target.value); setCardErrors((p) => ({ ...p, name: undefined })) }}
                      placeholder="Full name on card"
                      type="text"
                      value={cardName}
                    />
                    {cardErrors.name ? <p className="mt-1 text-xs text-red-500">{cardErrors.name}</p> : null}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Card number
                      {detectCardType(cardNumber) ? <span className="ml-2 font-normal text-[#2f9f4f]">{detectCardType(cardNumber)}</span> : null}
                    </label>
                    <input
                      autoComplete="cc-number"
                      className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-[#1f2937] outline-none focus:ring-2 focus:ring-[#2f9f4f]/30 ${cardErrors.number ? 'border-red-400 focus:border-red-400' : 'border-[#d4ddd0] focus:border-[#2f9f4f]'}`}
                      inputMode="numeric"
                      maxLength={19}
                      onChange={(e) => { setCardNumber(formatCardNumber(e.target.value)); setCardErrors((p) => ({ ...p, number: undefined })) }}
                      placeholder="0000 0000 0000 0000"
                      type="text"
                      value={cardNumber}
                    />
                    {cardErrors.number ? <p className="mt-1 text-xs text-red-500">{cardErrors.number}</p> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#6b7b70]">Expiry</label>
                      <input
                        autoComplete="cc-exp"
                        className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-[#1f2937] outline-none focus:ring-2 focus:ring-[#2f9f4f]/30 ${cardErrors.expiry ? 'border-red-400 focus:border-red-400' : 'border-[#d4ddd0] focus:border-[#2f9f4f]'}`}
                        inputMode="numeric"
                        maxLength={5}
                        onChange={(e) => { setCardExpiry(formatExpiry(e.target.value)); setCardErrors((p) => ({ ...p, expiry: undefined })) }}
                        placeholder="MM/YY"
                        type="text"
                        value={cardExpiry}
                      />
                      {cardErrors.expiry ? <p className="mt-1 text-xs text-red-500">{cardErrors.expiry}</p> : null}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#6b7b70]">CVV</label>
                      <input
                        autoComplete="cc-csc"
                        className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-[#1f2937] outline-none focus:ring-2 focus:ring-[#2f9f4f]/30 ${cardErrors.cvv ? 'border-red-400 focus:border-red-400' : 'border-[#d4ddd0] focus:border-[#2f9f4f]'}`}
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(e) => { setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors((p) => ({ ...p, cvv: undefined })) }}
                        placeholder="CVV"
                        type="text"
                        value={cardCvv}
                      />
                      {cardErrors.cvv ? <p className="mt-1 text-xs text-red-500">{cardErrors.cvv}</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {paymentMethod === 'vipps' ? (
                <div className="mt-3 rounded-xl border border-[#e5ece2] bg-[#f8fbf7] p-4">
                  <label className="block text-xs font-semibold text-[#6b7b70]">Vipps phone number</label>
                  <input
                    className="mt-1.5 w-full rounded-lg border border-[#d4ddd0] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                    inputMode="tel"
                    onChange={(e) => setVippsPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="000 00 000"
                    type="tel"
                    value={vippsPhone}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Order summary + place */}
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="px-5 py-4">
              {selectedStore ? (
                <dl className="space-y-1.5 text-sm text-[#647267]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">Order summary · {selectedStore.storeName}</p>
                  <div className="flex justify-between">
                    <dt>Subtotal ({selectedStore.itemsAvailable} items)</dt>
                    <dd className="font-semibold text-[#1f2b22]">{formatCurrency(selectedStore.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>
                      Delivery · {effectiveEta(selectedStore)}
                      {woltEstimate ? <span className="ml-1 text-[10px] text-[#2f9f4f]">🛵 Wolt</span> : null}
                    </dt>
                    <dd className="font-semibold text-[#1f2b22]">{formatCurrency(effectiveDeliveryCost(selectedStore))}</dd>
                  </div>
                  <div className="flex justify-between border-t border-[#e5ece2] pt-2 text-base font-bold text-[#1f2b22]">
                    <dt>Total</dt>
                    <dd>{formatCurrency(effectiveTotal(selectedStore))}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-[#6d7b70]">Select a store to see your total.</p>
              )}

              {/* Wolt not available warning in order summary */}
              {(woltDeliveryClosed || woltOutsideArea) && !woltUnavailable ? (
                <div className="mt-3 rounded-xl border border-[#f0c070] bg-[#fffbea] px-3 py-2 text-xs text-[#7a5000]">
                  {woltError!.message} You can still place an order — delivery will be arranged separately.
                </div>
              ) : null}

              {orderError ? (
                <div className="mt-3 rounded-xl border border-[#f0d4d4] bg-[#fff5f5] px-3 py-2 text-xs text-[#9b2c2c]">{orderError}</div>
              ) : null}

              <button
                className="mt-4 w-full rounded-2xl bg-[#2f9f4f] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,159,79,0.24)] transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6] disabled:shadow-none"
                disabled={!selectedStore || isPlacing || isMatching}
                onClick={handlePlaceOrder}
                type="button"
              >
                {isPlacing
                  ? 'Placing order…'
                  : selectedStore
                    ? `Place order · ${formatCurrency(effectiveTotal(selectedStore))}`
                    : 'Select a store to continue'}
              </button>

              <a
                className="mt-3 block w-full rounded-2xl border border-[#d5ded1] bg-white px-4 py-3 text-center text-sm font-semibold text-[#415044] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
                href="/cart"
              >
                ← Back to cart
              </a>

              {woltEstimate ? (
                <p className="mt-3 text-center text-[10px] text-[#9ca3af]">Delivery powered by Wolt Drive · Live pricing</p>
              ) : null}
            </div>
          </div>

        </section>
      </div>
    </main>
  )
}
