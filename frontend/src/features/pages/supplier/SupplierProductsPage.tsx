'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'

type Supplier = {
  id: string
  businessName: string
  address: string
}

type Product = {
  id: string
  name: string
  description: string | null
  unit: string
  price: number
  stockQty: number
  imageUrl?: string | null
}

const BUYER_STORAGE_KEY = 'localsupply-user'

export default function SupplierProductsPage() {
  const params = useParams<{ supplierId: string }>()
  const supplierId = typeof params?.supplierId === 'string' ? params.supplierId : ''
  const searchParams = useSearchParams()
  const preselectProductId = searchParams?.get('buy') ?? null

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState('')

  useEffect(() => {
    if (!supplierId) {
      setIsLoading(false)
      setErrorMessage('Missing supplier id.')
      return
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      setErrorMessage('')
      try {
        const [supplierRes, productsRes] = await Promise.all([
          fetch(buildApiUrl(`/api/suppliers/${encodeURIComponent(supplierId)}`)),
          fetch(buildApiUrl(`/api/suppliers/${encodeURIComponent(supplierId)}/products`)),
        ])
        const supplierPayload = (await supplierRes.json().catch(() => ({}))) as Supplier | { message?: string }
        const productsPayload = (await productsRes.json().catch(() => ({}))) as Product[] | { message?: string }

        if (!supplierRes.ok) {
          throw new Error((supplierPayload as { message?: string }).message ?? 'Unable to load supplier.')
        }

        if (!Array.isArray(productsPayload) && !productsRes.ok) {
          throw new Error((productsPayload as { message?: string }).message ?? 'Unable to load products.')
        }

        if (!cancelled) {
          setSupplier(supplierPayload as Supplier)
          setProducts(Array.isArray(productsPayload) ? productsPayload : [])
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load supplier.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [supplierId])

  function updateQuantity(productId: string, delta: number) {
    setQuantities((current) => {
      const next = { ...current }
      const existing = next[productId] ?? 0
      const updated = existing + delta
      if (updated <= 0) {
        delete next[productId]
      } else {
        next[productId] = updated
      }
      return next
    })
  }

  const hasSelectedItems = Object.values(quantities).some((q) => q > 0)

  useEffect(() => {
    if (!preselectProductId) return
    if (!products.some((product) => product.id === preselectProductId)) return
    setQuantities((current) => {
      if (current[preselectProductId]) return current
      return { ...current, [preselectProductId]: 1 }
    })
  }, [preselectProductId, products])

  async function handlePlaceOrder() {
    if (!supplier || !hasSelectedItems || isPlacingOrder) return

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

    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity }))

    if (items.length === 0) return

    setIsPlacingOrder(true)
    try {
      const response = await fetch(buildApiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId,
          supplierId: supplier.id,
          deliveryFee: 0,
          items,
          notes: `Order from ${supplier.businessName}`,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { message?: string; id?: string }

      if (!response.ok) {
        const message = payload.message ?? 'Unable to place order right now.'
        setOrderError(message)
        return
      }

      setQuantities({})
      window.location.href = '/orders'
    } catch {
      setOrderError('Unable to place order right now.')
    } finally {
      setIsPlacingOrder(false)
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
      </main>
    )
  }

  if (errorMessage || !supplier) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <h1 className="text-xl font-bold text-[#1b2a1f]">Supplier not available</h1>
          <p className="mt-2 text-sm text-[#5b665f]">
            {errorMessage || 'We could not load this supplier at the moment. Please try again later.'}
          </p>
          <a
            className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
            href="/suppliers"
          >
            Back to Supplier Marketplace
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1100px] rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
        <header className="border-b border-[#e5ece2] px-5 py-5 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Supplier</p>
          <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">{supplier.businessName}</h1>
          <p className="mt-1 text-sm text-[#617166]">{supplier.address}</p>
        </header>
        <div className="px-5 py-5 sm:px-6">
          {orderError ? (
            <div className="mb-3 rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-2 text-xs text-[#9b2c2c]">
              {orderError}
            </div>
          ) : null}
          {products.length === 0 ? (
            <p className="py-4 text-sm text-[#6d7b70]">This supplier hasn&apos;t published any products yet.</p>
          ) : (
            <>
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((product) => {
                const imgSrc = product.imageUrl
                  ? (product.imageUrl.startsWith('/') ? buildApiUrl(product.imageUrl) : product.imageUrl)
                  : null
                const quantity = quantities[product.id] ?? 0
                return (
                <article className="rounded-2xl border border-[#e5ece2] bg-white p-4 shadow-[0_12px_24px_rgba(18,38,24,0.06)]" key={product.id}>
                  <div className="flex gap-3">
                    {imgSrc ? (
                      <img alt="" className="h-16 w-16 shrink-0 rounded-xl border border-[#e2e9df] object-cover" src={imgSrc} />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#e2e9df] bg-[#f7faf6] text-[#9db5a4]">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-[#1f2b22]">{product.name}</h2>
                  {product.description ? (
                    <p className="mt-1 text-xs text-[#6d7b70]">{product.description}</p>
                  ) : (
                    <p className="mt-1 text-xs text-[#6d7b70]">{product.unit}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#2f9f4f]">
                        {product.price.toFixed ? `${product.price.toFixed(2)} kr` : `${Number(product.price).toFixed(2)} kr`}
                      </p>
                      <p className="text-xs text-[#6d7b70]">Stock: {product.stockQty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="grid h-7 w-7 place-items-center rounded-lg border border-[#d4ddd0] text-sm text-[#516056] transition hover:border-[#9bb49f]"
                        onClick={() => updateQuantity(product.id, -1)}
                        type="button"
                        disabled={quantity <= 0}
                      >
                        -
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-semibold text-[#1f2b22]">
                        {quantity}
                      </span>
                      <button
                        className="grid h-7 w-7 place-items-center rounded-lg border border-[#d4ddd0] text-sm text-[#516056] transition hover:border-[#9bb49f]"
                        onClick={() => updateQuantity(product.id, 1)}
                        type="button"
                        disabled={product.stockQty <= 0}
                      >
                        +
                      </button>
                    </div>
                  </div>
                    </div>
                  </div>
                </article>
              );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-[#6d7b70]">
                {hasSelectedItems ? 'Ready to place an order with this supplier.' : 'Select quantities to create an order.'}
              </p>
              <button
                className="rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6]"
                disabled={!hasSelectedItems || isPlacingOrder}
                onClick={handlePlaceOrder}
                type="button"
              >
                {isPlacingOrder ? 'Placing order…' : 'Place order'}
              </button>
            </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

