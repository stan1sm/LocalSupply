'use client'

import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

const BUYER_STORAGE_KEY = 'localsupply-user'

type BuyerSession = {
  id: string
  firstName: string
  lastName: string
  email: string
}

type OrderItem = {
  id: string
  productId: string
  name: string
  unit: string
  quantity: number
  unitPrice: number
}

type SupplierSummary = {
  id: string
  businessName: string
  address: string
}

type OrderSummary = {
  id: string
  status: string
  subtotal: number
  deliveryFee: number
  total: number
  notes: string | null
  createdAt: string
  supplier: SupplierSummary
  items: OrderItem[]
}

function formatCurrency(value: number | string) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    return `${value} kr`
  }
  return `${n.toFixed(2)} kr`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function BuyerOrdersPage() {
  const [buyer, setBuyer] = useState<BuyerSession | null>(null)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(BUYER_STORAGE_KEY) : null
      if (stored) {
        const parsed = JSON.parse(stored) as BuyerSession
        if (parsed && parsed.id) {
          setBuyer(parsed)
        }
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(BUYER_STORAGE_KEY)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const buyerId = buyer?.id
    if (!buyerId) return

    let cancelled = false

    async function loadOrders() {
      setErrorMessage('')
      try {
        const response = await fetch(buildApiUrl(`/api/orders/buyer/${encodeURIComponent(buyerId)}`))
        const payload = (await response.json().catch(() => ({}))) as OrderSummary[] | { message?: string }

        if (!response.ok) {
          throw new Error((payload as { message?: string }).message ?? 'Unable to load orders right now.')
        }

        if (!cancelled && Array.isArray(payload)) {
          setOrders(payload)
        }
      } catch (error) {
        if (!cancelled) {
          setOrders([])
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load orders right now.')
        }
      }
    }

    loadOrders()

    return () => {
      cancelled = true
    }
  }, [buyer])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
      </main>
    )
  }

  if (!buyer) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Orders</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">Sign in to view your orders</h1>
          <p className="mt-2 text-sm text-[#5b665f]">
            Use your LocalSupply account to see your recent and past orders, including basic delivery status.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <a
              className="rounded-2xl bg-[#2f9f4f] px-4 py-2.5 font-semibold text-white transition hover:bg-[#25813f]"
              href="/login"
            >
              Go to Login
            </a>
            <a
              className="rounded-2xl border border-[#d4ddcf] bg-white px-4 py-2.5 font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
              href="/register"
            >
              Create Account
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
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
          <nav aria-label="Orders navigation" className="space-y-1">
            {[
              { id: 'marketplace', label: 'Marketplace', icon: 'M', href: '/marketplace/dashboard' },
              { id: 'suppliers', label: 'Suppliers', icon: 'S', href: '/suppliers' },
              { id: 'my-cart', label: 'My Cart', icon: 'C', href: '/cart' },
              { id: 'orders', label: 'Orders', icon: 'O', href: '/orders' },
              { id: 'delivery', label: 'Delivery Tracking', icon: 'T', href: '#' },
            ].map((item) => {
              const isActive = item.id === 'orders'
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
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Orders</p>
            <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">Your order history</h1>
            <p className="mt-1 text-sm text-[#617166]">
              Review recent orders placed with local suppliers, along with basic delivery status.
            </p>
          </div>

          <div className="px-5 py-5">
            {errorMessage ? (
              <div className="mb-4 rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
                {errorMessage}
              </div>
            ) : null}

            {orders.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#d2dcd0] bg-[#f8fbf7] px-5 py-16 text-center">
                <p className="text-lg font-semibold text-[#304136]">No orders yet</p>
                <p className="mt-2 text-sm text-[#728176]">
                  When you place your first order with a local supplier, it will appear here with a basic status.
                </p>
                <a
                  className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                  href="/marketplace/dashboard"
                >
                  Browse Marketplace
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <article
                    className="rounded-3xl border border-[#e5ece2] bg-white p-4 shadow-[0_12px_24px_rgba(18,38,24,0.06)]"
                    key={order.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a8a7f]">
                          {order.supplier.businessName}
                        </p>
                        <p className="mt-1 text-xs text-[#6d7b70]">{order.supplier.address}</p>
                        <p className="mt-1 text-xs text-[#6d7b70]">Placed {formatDate(order.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#1f2b22]">{formatCurrency(order.total)}</p>
                        <p className="mt-1 inline-flex items-center rounded-full bg-[#edf7f0] px-2.5 py-0.5 text-[11px] font-semibold text-[#256c3a]">
                          {order.status}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-[#eef2ec] pt-3 text-xs text-[#6d7b70]">
                      <p>
                        Subtotal {formatCurrency(order.subtotal)} · Delivery {formatCurrency(order.deliveryFee)}
                        {order.notes ? <> · Note: {order.notes}</> : null}
                      </p>
                    </div>
                    {order.items.length > 0 ? (
                      <div className="mt-3 divide-y divide-[#eef2ec] border-t border-[#eef2ec] pt-2">
                        {order.items.map((item) => (
                          <div className="flex items-center justify-between gap-3 py-2" key={item.id}>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[#1f2b22]">{item.name}</p>
                              <p className="text-xs text-[#6d7b70]">
                                {item.unit} · {item.quantity} × {formatCurrency(item.unitPrice)}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-[#1f2b22]">
                              {formatCurrency(item.unitPrice * item.quantity)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

