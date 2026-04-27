'use client'

import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'
import SupplierSidebar from '../../components/SupplierSidebar'

type SupplierSession = {
  id: string
  businessName: string
  contactName: string
  email: string
  address: string
}

type BuyerSummary = {
  id: string
  firstName: string
  lastName: string
  email: string
}

type OrderSummary = {
  id: string
  status: string
  total: number | string
  createdAt: string
  buyer: BuyerSummary
}

type ProductSummary = {
  id: string
  name: string
  stockQty: number
  price: number | string
}

const SUPPLIER_STORAGE_KEY = 'localsupply-supplier'

function asNumber(value: number | string) {
  return typeof value === 'number' ? value : Number(value)
}

function formatCurrency(value: number | string) {
  const n = asNumber(value)
  if (!Number.isFinite(n)) return `${value} kr`
  return `${n.toFixed(2)} kr`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function SupplierOverviewPage() {
  const [supplier, setSupplier] = useState<SupplierSession | null>(null)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SUPPLIER_STORAGE_KEY) : null
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierSession
        if (parsed && parsed.id) {
          setSupplier(parsed)
        }
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(SUPPLIER_STORAGE_KEY)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const supplierId: string = supplier?.id ?? ''
    if (!supplierId) return

    let cancelled = false

    async function loadData() {
      setErrorMessage('')
      try {
        const [ordersRes, productsRes] = await Promise.all([
          fetch(buildApiUrl(`/api/orders/supplier/${encodeURIComponent(supplierId)}`)),
          fetch(buildApiUrl(`/api/suppliers/${encodeURIComponent(supplierId)}/products`)),
        ])

        const ordersPayload = (await ordersRes.json().catch(() => ({}))) as (OrderSummary & {
          subtotal?: number | string
          deliveryFee?: number | string
          notes?: string | null
        })[] | { message?: string }
        const productsPayload = (await productsRes.json().catch(() => ({}))) as ProductSummary[] | { message?: string }

        if (!ordersRes.ok) {
          throw new Error((ordersPayload as { message?: string }).message ?? 'Unable to load orders right now.')
        }

        if (!productsRes.ok) {
          throw new Error((productsPayload as { message?: string }).message ?? 'Unable to load products right now.')
        }

        if (!cancelled) {
          setOrders(Array.isArray(ordersPayload) ? ordersPayload : [])
          setProducts(Array.isArray(productsPayload) ? productsPayload : [])
        }
      } catch (error) {
        if (!cancelled) {
          setOrders([])
          setProducts([])
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load dashboard data right now.')
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [supplier])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
      </main>
    )
  }

  if (!supplier) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">No supplier session</h1>
          <p className="mt-2 text-sm text-[#5b665f]">
            To use the supplier dashboard, first create a supplier account or sign in, then we&apos;ll remember your
            business on this device.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <a
              className="rounded-2xl bg-[#2f9f4f] px-4 py-2.5 font-semibold text-white transition hover:bg-[#25813f]"
              href="/supplier/register"
            >
              Create Supplier Account
            </a>
            <a
              className="rounded-2xl border border-[#d4ddcf] bg-white px-4 py-2.5 font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
              href="/supplier/login"
            >
              Supplier Sign in
            </a>
          </div>
        </div>
      </main>
    )
  }

  const now = new Date()
  const start7 = new Date(now)
  start7.setDate(now.getDate() - 7)
  const start30 = new Date(now)
  start30.setDate(now.getDate() - 30)

  const todayOrders = orders.filter((order) => isSameDay(new Date(order.createdAt), now))
  const openOrders = orders.filter((order) => !['DELIVERED', 'CANCELLED'].includes(order.status))
  const revenue7Days = orders
    .filter((order) => new Date(order.createdAt) >= start7)
    .reduce((sum, order) => sum + (Number.isFinite(asNumber(order.total)) ? asNumber(order.total) : 0), 0)
  const revenue30Days = orders
    .filter((order) => new Date(order.createdAt) >= start30)
    .reduce((sum, order) => sum + (Number.isFinite(asNumber(order.total)) ? asNumber(order.total) : 0), 0)

  const recentOrders = [...orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5)
  const lowStock = products.filter((p) => p.stockQty >= 0 && p.stockQty <= 5).slice(0, 5)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[260px_minmax(0,1.2fr)]">
        <SupplierSidebar activeId="dashboard" supplier={supplier} />

        <section className="space-y-6">
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="border-b border-[#e5ece2] px-5 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Dashboard</p>
              <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">Supplier overview</h1>
              <p className="mt-1 text-sm text-[#617166]">
                Today&apos;s orders, recent activity, and a quick look at your inventory health.
              </p>
            </div>

            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#d9e3d4] bg-[#f7faf6] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Orders today</p>
                <p className="mt-1 text-2xl font-extrabold text-[#1f2b22]">{todayOrders.length}</p>
              </div>
              <div className="rounded-2xl border border-[#d9e3d4] bg-[#f7faf6] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Open orders</p>
                <p className="mt-1 text-2xl font-extrabold text-[#1f2b22]">{openOrders.length}</p>
              </div>
              <div className="rounded-2xl border border-[#d9e3d4] bg-[#f7faf6] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Revenue (7 days)</p>
                <p className="mt-1 text-xl font-extrabold text-[#1f2b22]">{formatCurrency(revenue7Days)}</p>
              </div>
              <div className="rounded-2xl border border-[#d9e3d4] bg-[#f7faf6] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Revenue (30 days)</p>
                <p className="mt-1 text-xl font-extrabold text-[#1f2b22]">{formatCurrency(revenue30Days)}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
              <div className="border-b border-[#e5ece2] px-5 py-4">
                <h2 className="text-base font-bold text-[#1f2b22]">Recent orders</h2>
              </div>
              <div className="px-5 py-4">
                {recentOrders.length === 0 ? (
                  <p className="py-3 text-sm text-[#6d7b70]">No orders yet. Your first orders will show up here.</p>
                ) : (
                  <div className="space-y-3">
                    {recentOrders.map((order) => (
                      <article
                        className="rounded-2xl border border-[#e5ece2] bg-white px-4 py-3 text-sm text-[#1f2b22]"
                        key={order.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8a7f]">Buyer</p>
                            <p className="mt-1 font-semibold">
                              {order.buyer.firstName} {order.buyer.lastName}
                            </p>
                            <p className="mt-0.5 text-xs text-[#6d7b70]">{order.buyer.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-[#1f2b22]">{formatCurrency(order.total)}</p>
                            <p className="mt-1 text-xs text-[#6d7b70]">{formatDate(order.createdAt)}</p>
                            <span className="mt-1 inline-flex items-center rounded-full bg-[#edf7f0] px-2.5 py-0.5 text-[10px] font-semibold text-[#256c3a]">
                              {order.status}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
              <div className="border-b border-[#e5ece2] px-5 py-4">
                <h2 className="text-base font-bold text-[#1f2b22]">Inventory highlights</h2>
              </div>
              <div className="px-5 py-4">
                {lowStock.length === 0 ? (
                  <p className="py-3 text-sm text-[#6d7b70]">
                    No low-stock alerts. Keep an eye on items with high weekly volume.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lowStock.map((product) => (
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5ece2] px-3 py-2 text-sm" key={product.id}>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#1f2b22]">{product.name}</p>
                          <p className="text-xs text-[#6d7b70]">Stock: {product.stockQty}</p>
                        </div>
                        <p className="text-sm font-semibold text-[#1f2b22]">
                          {formatCurrency(product.price)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <a
                  className="mt-4 inline-flex items-center text-xs font-semibold text-[#2f9f4f] hover:text-[#25813f]"
                  href="/supplier/dashboard"
                >
                  Go to Products
                  <span aria-hidden="true" className="ml-1">
                    →
                  </span>
                </a>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <p className="text-xs text-[#9b2c2c]">Some data could not be loaded: {errorMessage}</p>
          ) : null}
        </section>
      </div>
    </main>
  )
}

