'use client'

import { useEffect, useState } from 'react'
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

function formatCurrency(value: number) {
  return `${value.toFixed(2)} kr`
}

function getStatusColor(itemsAvailable: number, itemsRequested: number) {
  if (itemsAvailable === itemsRequested) return 'text-[#2f9f4f]'
  if (itemsAvailable > 0) return 'text-[#c07e00]'
  return 'text-[#9b2c2c]'
}

export default function CheckoutPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [buyer, setBuyer] = useState<BuyerSession | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null)
  const [selectedStore, setSelectedStore] = useState<MatchedStore | null>(null)
  const [isMatching, setIsMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [isPlacing, setIsPlacing] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Read buyer from localStorage
    try {
      const stored = window.localStorage.getItem(BUYER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as BuyerSession
        if (parsed && parsed.id) setBuyer(parsed)
      }
    } catch {
      // ignore
    }

    // Read cart from localStorage
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

  // Run store match once cart items are loaded
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
            items: cartItems.map((item) => ({
              priceId: item.id,
              quantity: item.quantity,
            })),
          }),
        })
        const payload = (await response.json()) as MatchResponse
        if (!cancelled && response.ok) {
          setMatchResult(payload)

          // Try to restore previously selected store from URL param
          const params = new URLSearchParams(window.location.search)
          const storeParam = params.get('store')
          const stores = payload.stores ?? []
          const match =
            (storeParam ? stores.find((s) => s.storeCode === storeParam) : null) ??
            payload.bestMatch

          setSelectedStore(match ?? null)
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

  async function handlePlaceOrder() {
    if (!selectedStore || !buyer || isPlacing) return

    setOrderError('')
    setIsPlacing(true)

    try {
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
            `Order at ${selectedStore.storeName}`,
            deliveryAddress ? `Delivery address: ${deliveryAddress}` : '',
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

      // Clear cart and redirect
      window.localStorage.removeItem(CART_STORAGE_KEY)
      window.location.href = '/orders'
    } catch {
      setOrderError('Unable to place order right now.')
    } finally {
      setIsPlacing(false)
    }
  }

  // Not ready yet (SSR guard)
  if (!isReady) return null

  // Redirect if not logged in
  if (!buyer) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Checkout</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">Sign in to place an order</h1>
          <p className="mt-2 text-sm text-[#5b665f]">You need to be logged in to complete your purchase.</p>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <a
              className="rounded-2xl bg-[#2f9f4f] px-4 py-2.5 font-semibold text-white transition hover:bg-[#25813f]"
              href="/login"
            >
              Go to Login
            </a>
            <a
              className="rounded-2xl border border-[#d4ddcf] bg-white px-4 py-2.5 font-semibold text-[#314237] transition hover:border-[#9db5a4]"
              href="/cart"
            >
              Back to Cart
            </a>
          </div>
        </div>
      </main>
    )
  }

  // Empty cart
  if (cartItems.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Checkout</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">Your cart is empty</h1>
          <p className="mt-2 text-sm text-[#5b665f]">Add some products before checking out.</p>
          <a
            className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
            href="/marketplace/dashboard"
          >
            Browse Marketplace
          </a>
        </div>
      </main>
    )
  }

  const stores = matchResult?.stores ?? []
  const savings = matchResult?.savings ?? 0

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">

        {/* Sidebar nav */}
        <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="px-2 pb-4">
            <a
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]"
              href="/"
            >
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
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#d6dfd2] bg-white text-xs font-bold text-[#5a675d]">
                  {item.icon}
                </span>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Store selection + order summary */}
        <section className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="border-b border-[#e5ece2] px-5 py-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Checkout</p>
            <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">Choose a store</h1>
            <p className="mt-1 text-sm text-[#617166]">
              Select where you want to order from.
            </p>
          </div>

          <div className="px-5 py-5">
            {isMatching ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
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
                ))}
              </div>
            ) : matchError ? (
              <div className="rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
                {matchError}
              </div>
            ) : stores.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#cfd9cb] bg-[#f8fbf7] p-6 text-center">
                <p className="text-sm font-semibold text-[#304136]">No stores matched your cart</p>
                <p className="mt-2 text-xs text-[#6c7c71]">
                  The products in your cart may not be in the catalog yet.
                </p>
                <a
                  className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                  href="/cart"
                >
                  Back to Cart
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {savings > 0 && matchResult?.bestMatch ? (
                  <div className="rounded-2xl bg-[#f0faf2] px-4 py-3 text-sm text-[#1a7a34]">
                    You save <span className="font-bold">{formatCurrency(savings)}</span> by choosing {matchResult.bestMatch.storeName} over other stores.
                  </div>
                ) : null}

                {stores.map((store) => {
                  const isSelected = selectedStore?.storeCode === store.storeCode
                  const isBest = store.storeCode === matchResult?.bestMatch?.storeCode

                  return (
                    <button
                      className={`flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left transition ${
                        isSelected
                          ? 'border-[#2f9f4f] bg-[#f0faf2]'
                          : 'border-[#e5ece2] bg-white hover:border-[#b2d4bc] hover:bg-[#f8fbf7]'
                      }`}
                      key={store.storeCode}
                      onClick={() => setSelectedStore(store)}
                      type="button"
                    >
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                        isSelected ? 'bg-[#2f9f4f] text-white' : 'bg-[#e8f5ea] text-[#2f9f4f]'
                      }`}>
                        {store.storeName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#1f2b22]">{store.storeName}</p>
                          {isBest ? (
                            <span className="rounded-full bg-[#dcf5e2] px-2 py-0.5 text-[10px] font-semibold text-[#1a7a34]">
                              Best price
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-[#6d7b70]">
                          ETA: {store.eta} ·{' '}
                          <span className={getStatusColor(store.itemsAvailable, store.itemsRequested)}>
                            {store.itemsAvailable}/{store.itemsRequested} items available
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-[#1f2b22]">{formatCurrency(store.total)}</p>
                        <p className="text-xs text-[#6d7b70]">
                          incl. {formatCurrency(store.deliveryCost)} delivery
                        </p>
                      </div>
                      {isSelected ? (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#2f9f4f] text-[10px] text-white">✓</span>
                      ) : (
                        <span className="h-5 w-5 rounded-full border-2 border-[#d4ddd0]" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Cart item list */}
            {cartItems.length > 0 && !isMatching ? (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-semibold text-[#1f2b22]">
                  Your items ({cartItems.length})
                </h2>
                <div className="divide-y divide-[#eef2ec] rounded-2xl border border-[#e5ece2]">
                  {cartItems.map((item) => (
                    <div className="flex items-center gap-3 px-4 py-3" key={item.id}>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#eef5ee]">
                        {item.imageUrl ? (
                          <img alt={item.name} className="h-full w-full object-contain p-1" src={item.imageUrl} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[#86a28f] text-sm">+</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#1f2b22]">{item.name}</p>
                        <p className="text-xs text-[#6d7b70]">
                          {formatCurrency(item.price)} · qty {item.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-[#1f2b22]">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Order confirmation panel */}
        <section className="space-y-4">
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="border-b border-[#e5ece2] px-5 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Order details</p>
              <h2 className="mt-2 text-xl font-bold text-[#1f2b22]">
                {buyer.firstName} {buyer.lastName}
              </h2>
              <p className="mt-0.5 text-xs text-[#6d7b70]">{buyer.email}</p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">
                  Delivery address
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-[#d4ddd0] bg-[#f7faf6] px-3 py-2.5 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Street address, city"
                  type="text"
                  value={deliveryAddress}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">
                  Order notes
                  <span className="ml-1 font-normal normal-case text-[#9ca3af]">(optional)</span>
                </label>
                <textarea
                  className="mt-2 w-full resize-none rounded-xl border border-[#d4ddd0] bg-[#f7faf6] px-3 py-2.5 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30"
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions for your order…"
                  rows={3}
                  value={notes}
                />
              </div>

              {selectedStore ? (
                <div className="rounded-2xl border border-[#e5ece2] bg-[#f8fbf7] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7b70]">
                    Order summary
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[#1f2b22]">{selectedStore.storeName}</p>

                  <dl className="mt-3 space-y-1.5 text-sm text-[#647267]">
                    <div className="flex justify-between">
                      <dt>Subtotal</dt>
                      <dd className="font-semibold text-[#1f2b22]">{formatCurrency(selectedStore.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Delivery fee</dt>
                      <dd className="font-semibold text-[#1f2b22]">{formatCurrency(selectedStore.deliveryCost)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>ETA</dt>
                      <dd className="font-semibold text-[#1f2b22]">{selectedStore.eta}</dd>
                    </div>
                    <div className="flex justify-between border-t border-[#e5ece2] pt-2 text-base font-bold text-[#1f2b22]">
                      <dt>Total</dt>
                      <dd>{formatCurrency(selectedStore.total)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {orderError ? (
                <div className="rounded-xl border border-[#f0d4d4] bg-[#fff5f5] px-3 py-2 text-xs text-[#9b2c2c]">
                  {orderError}
                </div>
              ) : null}

              <button
                className="w-full rounded-2xl bg-[#2f9f4f] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,159,79,0.24)] transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6] disabled:shadow-none"
                disabled={!selectedStore || isPlacing || isMatching}
                onClick={handlePlaceOrder}
                type="button"
              >
                {isPlacing ? 'Placing order…' : selectedStore ? `Place order · ${formatCurrency(selectedStore.total)}` : 'Select a store to continue'}
              </button>

              <a
                className="block w-full rounded-2xl border border-[#d5ded1] bg-white px-4 py-3 text-center text-sm font-semibold text-[#415044] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
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
