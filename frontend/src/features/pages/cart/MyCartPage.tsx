'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

type CartItem = {
  id: string
  imageUrl: string | null
  name: string
  price: number
  quantity: number
  store: string | null
  unitInfo: string | null
}

type SubstitutionSuggestion = {
  priceId: string
  name: string
  brand: string | null
  imageUrl: string | null
  unit: string | null
  storeCode: string
  storeName: string
  price: number
  savingsAmount: number
  savingsPercentage: number | null
  similarity: number
  reason: string
}

type SubstitutionsResponse = {
  suggestions: SubstitutionSuggestion[]
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

type IntentCartItem = {
  imageUrl: string | null
  priceId: string
  catalogProductId: string
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

type IntentCartStoreChoice = {
  storeCode: string
  storeName: string
  subtotal: number
  deliveryCost: number
  total: number
  eta: string
  etaMinutes: number
}

type IntentCartResponse = {
  items: IntentCartItem[]
  explanation: string[]
  storeChoice: IntentCartStoreChoice | null
  totalPrice: number
}

const CART_STORAGE_KEY = 'localsupply-marketplace-cart'
const BUYER_STORAGE_KEY = 'localsupply-user'

function formatCurrency(value: number) {
  return `${value.toFixed(2)} kr`
}

export default function MyCartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null)
  const [isMatching, setIsMatching] = useState(false)
  const [selectedStoreCode, setSelectedStoreCode] = useState<string | null>(null)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [substitutions, setSubstitutions] = useState<Record<string, SubstitutionSuggestion[]>>({})
  const [loadingSubFor, setLoadingSubFor] = useState<string | null>(null)
  const [intentText, setIntentText] = useState('')
  const [isPlanningIntent, setIsPlanningIntent] = useState(false)
  const [intentExplanation, setIntentExplanation] = useState<string[] | null>(null)
  const [intentProgressStep, setIntentProgressStep] = useState(0)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CART_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[]
        if (Array.isArray(parsed)) setCartItems(parsed)
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))
  }, [cartItems])

  const runMatch = useCallback(async (items: CartItem[]) => {
    if (items.length === 0) {
      setMatchResult(null)
      return
    }

    setIsMatching(true)
    try {
      const response = await fetch(buildApiUrl('/api/cart/match'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            priceId: item.id,
            quantity: item.quantity,
          })),
        }),
      })
      const payload = (await response.json()) as MatchResponse
      if (response.ok) {
        setMatchResult(payload)
        setSelectedStoreCode(payload.bestMatch?.storeCode ?? null)
      }
    } catch {
      setMatchResult(null)
    } finally {
      setIsMatching(false)
    }
  }, [])

  useEffect(() => {
    runMatch(cartItems)
  }, [cartItems, runMatch])

  function updateQuantity(itemId: string, delta: number) {
    setCartItems((current) =>
      current
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(item.quantity + delta, 0) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  function replaceCartItem(oldPriceId: string, suggestion: SubstitutionSuggestion) {
    setCartItems((current) =>
      current.map((item) =>
        item.id === oldPriceId
          ? {
              ...item,
              id: suggestion.priceId,
              name: suggestion.name,
              imageUrl: suggestion.imageUrl,
              price: suggestion.price,
              store: suggestion.storeName,
            }
          : item,
      ),
    )
    setSubstitutions((current) => {
      const next = { ...current }
      delete next[oldPriceId]
      return next
    })
  }

  async function loadSubstitutions(priceId: string) {
    if (!priceId || loadingSubFor === priceId) return

    setLoadingSubFor(priceId)
    try {
      const response = await fetch(buildApiUrl(`/api/products/${encodeURIComponent(priceId)}/substitutions`))
      if (!response.ok) {
        return
      }
      const payload = (await response.json()) as SubstitutionsResponse
      setSubstitutions((current) => ({
        ...current,
        [priceId]: payload.suggestions,
      }))
    } catch {
      // ignore
    } finally {
      setLoadingSubFor((current) => (current === priceId ? null : current))
    }
  }

  async function planIntentCart() {
    const text = intentText.trim()
    if (!text) return

    setIsPlanningIntent(true)
    setIntentProgressStep(0)
    setIntentExplanation(null)

    const totalSteps = 4
    let cancelled = false

    const advanceStep = (step: number) => {
      if (cancelled) return
      setIntentProgressStep(step)
      if (step < totalSteps - 1) {
        window.setTimeout(() => advanceStep(step + 1), 650)
      }
    }

    advanceStep(0)

    try {
      const response = await fetch(buildApiUrl('/api/cart/intent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
        }),
      })
      const payload = (await response.json()) as IntentCartResponse
      if (!response.ok) {
        return
      }

      if (!payload.items || payload.items.length === 0 || !payload.storeChoice) {
        setIntentExplanation(payload.explanation ?? ['Could not build a cart from this request.'])
        return
      }

      const newCartItems: CartItem[] = payload.items.map((item) => ({
        id: item.priceId,
        imageUrl: item.imageUrl,
        name: item.name,
        price: item.unitPrice,
        quantity: item.quantity,
        store: payload.storeChoice?.storeName ?? null,
        unitInfo: null,
      }))

      setCartItems(newCartItems)
      setIntentExplanation(payload.explanation)
      setSelectedStoreCode(payload.storeChoice.storeCode)
    } catch {
      setIntentExplanation(['Unable to plan cart right now.'])
    } finally {
      cancelled = true
      setIntentProgressStep(totalSteps)
      setIsPlanningIntent(false)
    }
  }

  function clearCart() {
    setCartItems([])
    setMatchResult(null)
    setSelectedStoreCode(null)
  }

  const bestMatch = matchResult?.bestMatch ?? null
  const stores = matchResult?.stores ?? []
  const savings = matchResult?.savings ?? 0
  const selectedStore = stores.find((s) => s.storeCode === selectedStoreCode) ?? bestMatch

  async function handlePlaceOrder() {
    if (!selectedStore || cartItems.length === 0 || isPlacingOrder) return

    setOrderError('')

    let buyerId: string | null = null
    try {
      const storedBuyer = typeof window !== 'undefined' ? window.localStorage.getItem(BUYER_STORAGE_KEY) : null
      if (storedBuyer) {
        const parsed = JSON.parse(storedBuyer) as { id?: string }
        if (parsed && typeof parsed.id === 'string') {
          buyerId = parsed.id
        }
      }
    } catch {
      buyerId = null
    }

    if (!buyerId) {
      window.location.href = '/login'
      return
    }

    setIsPlacingOrder(true)
    try {
      const response = await fetch(buildApiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId,
          deliveryFee: selectedStore.deliveryCost,
          items: selectedStore.items.map((item) => ({
            name: item.name,
            unit: 'unit',
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
          notes: `Marketplace order at ${selectedStore.storeName}`,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { message?: string; id?: string }

      if (!response.ok) {
        const message = payload.message ?? 'Unable to place order right now.'
        setOrderError(message)
        return
      }

      clearCart()
      window.location.href = '/orders'
    } catch {
      setOrderError('Unable to place order right now.')
    } finally {
      setIsPlacingOrder(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">

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
          <nav aria-label="Cart navigation" className="space-y-1">
            {[
              { id: 'marketplace', label: 'Marketplace', icon: 'M', href: '/marketplace/dashboard' },
              { id: 'suppliers', label: 'Suppliers', icon: 'S', href: '/suppliers' },
              { id: 'my-cart', label: 'My Cart', icon: 'C', href: '/cart' },
              { id: 'orders', label: 'Orders', icon: 'O', href: '/orders' },
              { id: 'delivery', label: 'Delivery Tracking', icon: 'T', href: '#' },
            ].map((item) => {
              const isActive = item.id === 'my-cart'
              return (
                <a
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                    isActive ? 'bg-[#f0f4ef] text-[#1f2b22]' : 'text-[#4f5d52] hover:bg-[#f6faf5] hover:text-[#1f2b22]'
                  }`}
                  href={item.href}
                  key={item.id}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#d6dfd2] bg-white text-xs font-bold text-[#5a675d]">
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              )
            })}
          </nav>
        </aside>

        <section className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="border-b border-[#e5ece2] px-5 py-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">My Cart</p>
            <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">My Grocery List & Smart Match</h1>
          </div>

          <div className="px-5 py-5">
            <div className="mb-5 rounded-2xl border border-[#d9e3d5] bg-[#f6faf5] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f9f4f]">AI meal planner</p>
              <p className="mt-1 text-sm text-[#314136]">
                Describe what you want (e.g. “taco night for 4”) and we{"'"}ll build a cheap cart for you.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                <textarea
                  className="flex-1 resize-none overflow-hidden rounded-xl border border-[#cfd9cb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#2f9f4f] focus:outline-none focus:ring-2 focus:ring-[#2f9f4f]/40"
                  onChange={(event) => {
                    setIntentText(event.target.value)
                  }}
                  onInput={(event) => {
                    const target = event.currentTarget
                    target.style.height = '0px'
                    target.style.height = `${target.scrollHeight}px`
                  }}
                  placeholder="I want taco night for 4 people"
                  rows={1}
                  value={intentText}
                />
                <button
                  className="mt-2 inline-flex items-center justify-center rounded-2xl bg-[#2f9f4f] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#25813f] sm:mt-0"
                  disabled={isPlanningIntent || !intentText.trim()}
                  onClick={planIntentCart}
                  type="button"
                >
                  {isPlanningIntent ? 'Planning…' : 'Plan meal'}
                </button>
              </div>
              {isPlanningIntent && !intentExplanation && (
                <ul className="mt-2 space-y-0.5 pl-1 text-xs">
                  {[
                    'Understanding your request…',
                    'Finding ingredients in the catalog…',
                    'Comparing stores and delivery…',
                    'Selecting the cheapest full cart…',
                  ].map((label, index) => {
                    const isDone = intentProgressStep > index
                    const isCurrent = intentProgressStep === index
                    return (
                      <li
                        key={label}
                        className={
                          isDone
                            ? 'text-[#2f9f4f]'
                            : isCurrent
                              ? 'text-[#314136]'
                              : 'text-[#9ca3af]'
                        }
                      >
                        {label}
                      </li>
                    )
                  })}
                </ul>
              )}
              {intentExplanation && intentExplanation.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[#556558]">
                  {intentExplanation.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            {cartItems.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#d2dcd0] bg-[#f8fbf7] px-5 py-16 text-center">
                <p className="text-lg font-semibold text-[#304136]">Your cart is empty</p>
                <p className="mt-2 text-sm text-[#728176]">Add products from the marketplace to start comparing store prices.</p>
                <a
                  className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                  href="/marketplace/dashboard"
                >
                  Browse Marketplace
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {cartItems.map((item) => (
                <div className="flex flex-col gap-2 rounded-2xl border border-[#e6ede3] p-3" key={item.id}>
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
                      {item.imageUrl ? (
                        <img alt={item.name} className="h-full w-full object-contain p-1" src={item.imageUrl} />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xl text-[#86a28f]">+</div>
                      )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-[#1f2b22]">{item.name}</h3>
                        <p className="text-xs text-[#6d7b70]">
                          {formatCurrency(item.price)} · {item.store ?? 'Store'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="grid h-7 w-7 place-items-center rounded-lg border border-[#d4ddd0] text-sm text-[#516056] transition hover:border-[#9bb49f]"
                          onClick={() => updateQuantity(item.id, -1)}
                          type="button"
                        >
                          -
                        </button>
                        <span className="min-w-[1.5rem] text-center text-sm font-semibold text-[#1f2b22]">{item.quantity}</span>
                        <button
                          className="grid h-7 w-7 place-items-center rounded-lg border border-[#d4ddd0] text-sm text-[#516056] transition hover:border-[#9bb49f]"
                          onClick={() => updateQuantity(item.id, 1)}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-col gap-1 rounded-2xl bg-[#f6faf5] p-2">
                      <button
                        className="inline-flex items-center justify-between gap-2 text-xs font-semibold text-[#2f9f4f]"
                        onClick={() => loadSubstitutions(item.id)}
                        type="button"
                      >
                        <span>
                          {loadingSubFor === item.id
                            ? 'Finding cheaper matches…'
                            : 'Find the same, but cheaper'}
                        </span>
                        <span aria-hidden="true">↓</span>
                      </button>
                      {substitutions[item.id] && substitutions[item.id].length > 0 ? (
                        <div className="space-y-1">
                          {substitutions[item.id].map((suggestion) => (
                            <button
                              className="flex w-full items-center justify-between rounded-xl bg-white px-2 py-1.5 text-left text-xs text-[#314136] shadow-sm ring-1 ring-[#dde8d9] hover:bg-[#f1f7f0]"
                              key={suggestion.priceId}
                              onClick={() => replaceCartItem(item.id, suggestion)}
                              type="button"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">
                                  {suggestion.name}
                                </p>
                                <p className="text-[10px] text-[#6c7c71]">
                                  Save {formatCurrency(suggestion.savingsAmount)}{' '}
                                  {suggestion.savingsPercentage !== null
                                    ? `(${suggestion.savingsPercentage.toFixed(1)}%)`
                                    : ''}
                                </p>
                              </div>
                              <span className="text-[11px] font-semibold text-[#2f9f4f]">Switch</span>
                            </button>
                          ))}
                        </div>
                      ) : loadingSubFor === item.id ? (
                        <p className="text-[11px] text-[#6c7c71]">Looking for alternatives…</p>
                      ) : null}
                    </div>
                  </div>
                ))}

                <div className="flex gap-3 pt-3">
                  <button
                    className="rounded-2xl border border-[#d5ded1] bg-white px-5 py-2.5 text-sm font-semibold text-[#415044] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
                    onClick={clearCart}
                    type="button"
                  >
                    Clear Cart
                  </button>
                  <a
                    className="rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                    href="/marketplace/dashboard"
                  >
                    Add Items
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          {isMatching ? (
            <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-6 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
              <div className="animate-pulse space-y-4">
                <div className="h-5 w-1/2 rounded bg-[#e2e9df]" />
                <div className="h-10 w-2/3 rounded bg-[#e2e9df]" />
                <div className="h-4 w-1/3 rounded bg-[#e2e9df]" />
              </div>
            </div>
          ) : bestMatch ? (
            <>
              <div className="rounded-[28px] border-2 border-[#2f9f4f] bg-[#f0faf2] p-5 shadow-[0_18px_60px_rgba(18,38,24,0.08)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#2f9f4f]">Best Store Match</p>
                    <h2 className="mt-1 text-xl font-bold text-[#1f2b22]">{bestMatch.storeName}</h2>
                    <p className="mt-1 text-sm text-[#617166]">Your smartest grocery choice for maximum savings.</p>
                  </div>
                  <button
                    className="shrink-0 rounded-2xl bg-[#2f9f4f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                    onClick={handlePlaceOrder}
                    type="button"
                    disabled={isPlacingOrder || !selectedStore}
                  >
                    {isPlacingOrder ? 'Placing order…' : 'Place order'}
                  </button>
                </div>
                <div className="mt-4 flex items-end gap-4">
                  <p className="text-3xl font-extrabold text-[#1f2b22]">{formatCurrency(bestMatch.total)}</p>
                  {savings > 0 ? (
                    <span className="mb-1 rounded-full bg-[#dcf5e2] px-3 py-1 text-xs font-semibold text-[#1a7a34]">
                      Save {formatCurrency(savings)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[#6a796f]">
                  Subtotal {formatCurrency(bestMatch.subtotal)} + delivery {formatCurrency(bestMatch.deliveryCost)} · ETA: {bestMatch.eta} · {bestMatch.itemsAvailable}/{bestMatch.itemsRequested} items available
                </p>
              </div>

              <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
                <div className="border-b border-[#e5ece2] px-5 py-4">
                  <h3 className="text-base font-bold text-[#1f2b22]">Matched Stores</h3>
                </div>
                <div className="divide-y divide-[#eef2ec]">
                  {stores.map((store) => (
                    <button
                      className={`flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#f8fbf7] ${
                        store.storeCode === selectedStoreCode ? 'bg-[#f0faf2]' : ''
                      }`}
                      key={store.storeCode}
                      onClick={() => setSelectedStoreCode(store.storeCode)}
                      type="button"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f5ea] text-sm font-bold text-[#2f9f4f]">
                        {store.storeName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1f2b22]">{store.storeName}</p>
                        <p className="text-xs text-[#6d7b70]">
                          ETA: {store.eta} · {store.itemsAvailable} items available
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-[#1f2b22]">{formatCurrency(store.total)}</p>
                        {store.storeCode === bestMatch.storeCode ? (
                          <span className="text-[10px] font-semibold text-[#2f9f4f]">Best price</span>
                        ) : null}
                      </div>
                      <span className="text-xs font-semibold text-[#2f9f4f]">Compare</span>
                    </button>
                  ))}
                </div>
              </div>

              {orderError ? (
                <div className="rounded-[20px] border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-xs text-[#9b2c2c]">
                  {orderError}
                </div>
              ) : null}

              {selectedStore ? (
                <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
                  <div className="border-b border-[#e5ece2] px-5 py-4">
                    <h3 className="text-base font-bold text-[#1f2b22]">
                      Price Breakdown · {selectedStore.storeName}
                    </h3>
                  </div>
                  <div className="divide-y divide-[#eef2ec] px-5">
                    {selectedStore.items.map((item) => (
                      <div className="flex items-center justify-between gap-3 py-3" key={item.catalogProductId}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#1f2b22]">{item.name}</p>
                          <p className="text-xs text-[#6d7b70]">{formatCurrency(item.unitPrice)} x {item.quantity}</p>
                        </div>
                        <p className="text-sm font-semibold text-[#1f2b22]">{formatCurrency(item.lineTotal)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#e5ece2] px-5 py-4">
                    <div className="flex justify-between text-sm text-[#647267]">
                      <span>Subtotal</span>
                      <span className="font-semibold text-[#1f2b22]">{formatCurrency(selectedStore.subtotal)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-sm text-[#647267]">
                      <span>Delivery ({selectedStore.eta})</span>
                      <span className="font-semibold text-[#1f2b22]">{formatCurrency(selectedStore.deliveryCost)}</span>
                    </div>
                    <div className="mt-3 flex justify-between border-t border-[#e5ece2] pt-3 text-base font-bold text-[#1f2b22]">
                      <span>Total</span>
                      <span>{formatCurrency(selectedStore.total)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : cartItems.length > 0 ? (
            <div className="rounded-[28px] border border-dashed border-[#cfd9cb] bg-[#f8fbf7] p-6 text-center">
              <p className="text-sm font-semibold text-[#304136]">No store matches found</p>
              <p className="mt-2 text-xs text-[#6c7c71]">The products in your cart may not be available in the imported catalog yet.</p>
            </div>
          ) : null}
        </section>

      </div>
    </main>
  )
}
