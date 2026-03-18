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

type PaymentMethod = 'invoice' | 'vipps' | 'card'

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

export default function CheckoutPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [buyer, setBuyer] = useState<BuyerSession | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null)
  const [selectedStore, setSelectedStore] = useState<MatchedStore | null>(null)
  const [isMatching, setIsMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [isReady, setIsReady] = useState(false)

  // Address
  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<GeoNorgeAddress[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const addressRef = useRef<HTMLDivElement>(null)

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('invoice')
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [vippsPhone, setVippsPhone] = useState('')

  // Order
  const [notes, setNotes] = useState('')
  const [isPlacing, setIsPlacing] = useState(false)
  const [orderError, setOrderError] = useState('')

  // Items breakdown toggle per store
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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (isReady && !buyer) {
      window.location.href = '/login?redirect=/checkout'
    }
  }, [isReady, buyer])

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

  // GeoNorge address autocomplete
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

  // Close suggestions on outside click
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

  // Find unavailable cart items for a given store
  function getUnavailableItems(store: MatchedStore): CartItem[] {
    const matchedNames = new Set(store.items.map((i) => i.name.toLowerCase()))
    return cartItems.filter((ci) => !matchedNames.has(ci.name.toLowerCase()))
  }

  async function handlePlaceOrder() {
    if (!selectedStore || !buyer || isPlacing) return
    if (!addressQuery.trim()) {
      setOrderError('Please enter a delivery address.')
      return
    }

    setOrderError('')
    setIsPlacing(true)

    try {
      const paymentNote =
        paymentMethod === 'card'
          ? `Payment: Card ending in ${cardNumber.replace(/\s/g, '').slice(-4)}`
          : paymentMethod === 'vipps'
            ? `Payment: Vipps (${vippsPhone})`
            : 'Payment: Invoice'

      const response = await fetch(buildApiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId: buyer.id,
          deliveryFee: selectedStore.deliveryCost,
          items: selectedStore.items.map((item) => ({
            name: item.name,
            unit: 'unit',
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
          notes: [
            `Store: ${selectedStore.storeName}`,
            `Delivery to: ${addressQuery.trim()}`,
            paymentNote,
            notes ? `Note: ${notes}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { message?: string }

      if (!response.ok) {
        setOrderError(payload.message ?? 'Unable to place order right now.')
        return
      }

      window.localStorage.removeItem(CART_STORAGE_KEY)
      window.location.href = '/orders'
    } catch {
      setOrderError('Unable to place order right now.')
    } finally {
      setIsPlacing(false)
    }
  }

  if (!isReady) return null

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
            <p className="mt-1 text-sm text-[#617166]">Select where you want to order from. We show which items each store can fulfil.</p>
          </div>

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

                  return (
                    <div key={store.storeCode} className={`rounded-2xl border-2 transition ${isSelected ? 'border-[#2f9f4f]' : 'border-[#e5ece2]'}`}>
                      {/* Store header row */}
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
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-[#1f2b22]">{store.storeName}</p>
                            {isBest ? <span className="rounded-full bg-[#dcf5e2] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a34]">Best price</span> : null}
                          </div>
                          <p className="mt-0.5 text-xs text-[#6d7b70]">
                            ETA: {store.eta} ·{' '}
                            <span className={hasPartial ? 'text-[#c07e00]' : 'text-[#2f9f4f]'}>
                              {store.itemsAvailable}/{store.itemsRequested} items available
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-[#1f2b22]">{formatCurrency(store.total)}</p>
                          <p className="text-xs text-[#6d7b70]">incl. {formatCurrency(store.deliveryCost)} delivery</p>
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

                      {/* Items breakdown */}
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
              {/* GeoNorge address autocomplete */}
              <div ref={addressRef} className="relative">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">
                  Delivery address
                </label>
                <div className="relative mt-2">
                  <input
                    autoComplete="off"
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
              {(
                [
                  { id: 'invoice', label: 'Invoice / Faktura', sub: 'Bill sent to your email after delivery' },
                  { id: 'vipps', label: 'Vipps', sub: 'Pay with your Vipps account' },
                  { id: 'card', label: 'Credit / Debit card', sub: 'Visa, Mastercard' },
                ] as { id: PaymentMethod; label: string; sub: string }[]
              ).map((opt) => (
                <button
                  className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${paymentMethod === opt.id ? 'border-[#2f9f4f] bg-[#f0faf2]' : 'border-[#e5ece2] bg-white hover:border-[#b2d4bc]'}`}
                  key={opt.id}
                  onClick={() => setPaymentMethod(opt.id)}
                  type="button"
                >
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${paymentMethod === opt.id ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#d4ddd0]'}`}>
                    {paymentMethod === opt.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#1f2b22]">{opt.label}</p>
                    <p className="text-xs text-[#6d7b70]">{opt.sub}</p>
                  </div>
                </button>
              ))}

              {/* Card fields */}
              {paymentMethod === 'card' ? (
                <div className="mt-3 space-y-3 rounded-xl border border-[#e5ece2] bg-[#f8fbf7] p-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#6b7b70]">Cardholder name</label>
                    <input
                      className="mt-1.5 w-full rounded-lg border border-[#d4ddd0] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="Full name on card"
                      type="text"
                      value={cardName}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6b7b70]">Card number</label>
                    <input
                      className="mt-1.5 w-full rounded-lg border border-[#d4ddd0] bg-white px-3 py-2 font-mono text-sm text-[#1f2937] outline-none focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                      inputMode="numeric"
                      maxLength={19}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      placeholder="0000 0000 0000 0000"
                      type="text"
                      value={cardNumber}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#6b7b70]">Expiry</label>
                      <input
                        className="mt-1.5 w-full rounded-lg border border-[#d4ddd0] bg-white px-3 py-2 font-mono text-sm text-[#1f2937] outline-none focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                        inputMode="numeric"
                        maxLength={5}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        placeholder="MM/YY"
                        type="text"
                        value={cardExpiry}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#6b7b70]">CVV</label>
                      <input
                        className="mt-1.5 w-full rounded-lg border border-[#d4ddd0] bg-white px-3 py-2 font-mono text-sm text-[#1f2937] outline-none focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="CVV"
                        type="password"
                        value={cardCvv}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Vipps field */}
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
                    <dt>Delivery · {selectedStore.eta}</dt>
                    <dd className="font-semibold text-[#1f2b22]">{formatCurrency(selectedStore.deliveryCost)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-[#e5ece2] pt-2 text-base font-bold text-[#1f2b22]">
                    <dt>Total</dt>
                    <dd>{formatCurrency(selectedStore.total)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-[#6d7b70]">Select a store to see your total.</p>
              )}

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
                    ? `Place order · ${formatCurrency(selectedStore.total)}`
                    : 'Select a store to continue'}
              </button>

              <a
                className="mt-3 block w-full rounded-2xl border border-[#d5ded1] bg-white px-4 py-3 text-center text-sm font-semibold text-[#415044] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
                href="/cart"
              >
                ← Back to cart
              </a>
            </div>
          </div>

        </section>
      </div>
    </main>
  )
}
