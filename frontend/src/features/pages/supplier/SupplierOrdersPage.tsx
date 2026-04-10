'use client'

import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'
import { ToastContainer } from '../../components/Toast'
import { useToast } from '../../components/useToast'

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

type OrderItem = {
  id: string
  productId: string
  name: string
  unit: string
  quantity: number
  unitPrice: number | string
}

type OrderSummary = {
  id: string
  status: string
  subtotal: number | string
  deliveryFee: number | string
  total: number | string
  notes: string | null
  createdAt: string
  buyer: BuyerSummary
  items: OrderItem[]
}

const SUPPLIER_STORAGE_KEY = 'localsupply-supplier'
const SUPPLIER_TOKEN_KEY = 'localsupply-supplier-token'

function formatCurrency(value: number | string) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return `${value} kr`
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

function statusStyle(status: string): { badge: string; label: string } {
  switch (status) {
    case 'CONFIRMED': return { badge: 'bg-[#dcf5e2] text-[#1a5e30]', label: 'Confirmed' }
    case 'CANCELLED': return { badge: 'bg-[#fde8e8] text-[#9b2c2c]', label: 'Cancelled' }
    case 'IN_TRANSIT': return { badge: 'bg-[#e0f0ff] text-[#1a4a7a]', label: 'In transit' }
    case 'DELIVERED': return { badge: 'bg-[#eef7ef] text-[#256c3a]', label: 'Delivered' }
    default: return { badge: 'bg-[#fef9ec] text-[#7a5500]', label: 'Pending' }
  }
}

export default function SupplierOrdersPage() {
  const [supplier, setSupplier] = useState<SupplierSession | null>(null)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const { toasts, addToast } = useToast()

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SUPPLIER_STORAGE_KEY) : null
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierSession
        if (parsed && parsed.id) setSupplier(parsed)
      }
    } catch {
      if (typeof window !== 'undefined') window.localStorage.removeItem(SUPPLIER_STORAGE_KEY)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const supplierId: string = supplier?.id ?? ''
    if (!supplierId) return

    let cancelled = false

    async function loadOrders() {
      setErrorMessage('')
      try {
        const response = await fetch(buildApiUrl(`/api/orders/supplier/${encodeURIComponent(supplierId)}`))
        const payload = (await response.json().catch(() => ({}))) as OrderSummary[] | { message?: string }
        if (!response.ok) throw new Error((payload as { message?: string }).message ?? 'Unable to load orders right now.')
        if (!cancelled && Array.isArray(payload)) setOrders(payload)
      } catch (error) {
        if (!cancelled) {
          setOrders([])
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load orders right now.')
        }
      }
    }

    loadOrders()
    return () => { cancelled = true }
  }, [supplier])

  async function handleUpdateStatus(orderId: string, status: string) {
    if (!supplier || updatingId) return
    setUpdatingId(orderId)
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem(SUPPLIER_TOKEN_KEY) : null
      const res = await fetch(buildApiUrl(`/api/orders/${orderId}/status`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; message?: string }
      if (res.ok && data.status) {
        setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: data.status! } : o))
        const toastMsg: Record<string, string> = {
          CONFIRMED: 'Order confirmed',
          CANCELLED: 'Order cancelled',
          IN_TRANSIT: 'Order marked as in transit',
          DELIVERED: 'Order marked as delivered',
        }
        addToast(toastMsg[status] ?? 'Order updated', status === 'CANCELLED' ? 'info' : 'success')
      } else {
        addToast(data.message ?? 'Unable to update order.', 'error')
      }
    } catch {
      addToast('Unable to reach the server.', 'error')
    } finally {
      setUpdatingId(null)
    }
  }

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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier Orders</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">No supplier session</h1>
          <p className="mt-2 text-sm text-[#5b665f]">
            To view and manage orders, first create a supplier account or sign in from this device.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <a className="rounded-2xl bg-[#2f9f4f] px-4 py-2.5 font-semibold text-white transition hover:bg-[#25813f]" href="/supplier/register">
              Create Supplier Account
            </a>
            <a className="rounded-2xl border border-[#d4ddcf] bg-white px-4 py-2.5 font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]" href="/supplier/login">
              Supplier Sign in
            </a>
          </div>
        </div>
      </main>
    )
  }

  const pendingCount = orders.filter((o) => o.status === 'PENDING').length

  const NEXT_STATUSES: Record<string, { value: string; label: string }[]> = {
    PENDING:    [
      { value: 'CONFIRMED',  label: 'Confirmed — accepted by supplier' },
      { value: 'IN_TRANSIT', label: 'In transit — courier on the way' },
      { value: 'DELIVERED',  label: 'Delivered — order complete' },
      { value: 'CANCELLED',  label: 'Cancelled' },
    ],
    CONFIRMED:  [
      { value: 'IN_TRANSIT', label: 'In transit — courier on the way' },
      { value: 'DELIVERED',  label: 'Delivered — order complete' },
      { value: 'CANCELLED',  label: 'Cancelled' },
    ],
    IN_TRANSIT: [
      { value: 'DELIVERED',  label: 'Delivered — order complete' },
      { value: 'CANCELLED',  label: 'Cancelled' },
    ],
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[260px_minmax(0,1.2fr)]">
        <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="px-2 pb-4">
            <a className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]" href="/">
              <span aria-hidden="true">←</span>
              <span>LocalSupply</span>
            </a>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier</p>
            <h2 className="mt-2 text-xl font-bold text-[#1f2b22]">{supplier.businessName}</h2>
            <p className="mt-1 text-xs text-[#6d7b70]">{supplier.address}</p>
          </div>
          <nav aria-label="Supplier dashboard navigation" className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'D', href: '/supplier/dashboard' },
              { id: 'products', label: 'Products', icon: 'P', href: '/supplier/dashboard' },
              { id: 'orders', label: 'Orders', icon: 'O', href: '/supplier/orders' },
            ].map((item) => {
              const isActive = item.id === 'orders'
              return (
                <a
                  key={item.id}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                    isActive ? 'bg-[#f0f4ef] text-[#1f2b22]' : 'text-[#4f5d52] hover:bg-[#f6faf5] hover:text-[#1f2b22]'
                  }`}
                  href={item.href}
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Supplier Orders</p>
                <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">Incoming orders</h1>
                <p className="mt-1 text-sm text-[#617166]">
                  Confirm or cancel pending orders. Wolt handles delivery once confirmed.
                </p>
              </div>
              {pendingCount > 0 ? (
                <span className="shrink-0 rounded-full bg-[#fef9ec] px-3 py-1 text-sm font-semibold text-[#7a5500]">
                  {pendingCount} pending
                </span>
              ) : null}
            </div>
          </div>

          <div className="px-5 py-5">
            {errorMessage ? (
              <div className="mb-4 rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
                {errorMessage}
              </div>
            ) : null}
            <ToastContainer toasts={toasts} />

            {orders.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#d2dcd0] bg-[#f8fbf7] px-5 py-16 text-center">
                <p className="text-lg font-semibold text-[#304136]">No orders yet</p>
                <p className="mt-2 text-sm text-[#728176]">
                  When buyers place orders that include your products, they will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const { badge, label } = statusStyle(order.status)
                  const isUpdating = updatingId === order.id
                  const nextOptions = NEXT_STATUSES[order.status] ?? []

                  return (
                    <article
                      className="rounded-3xl border border-[#e5ece2] bg-white p-4 shadow-[0_12px_24px_rgba(18,38,24,0.06)]"
                      key={order.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a8a7f]">Buyer</p>
                          <p className="mt-1 text-sm font-semibold text-[#1f2b22]">
                            {order.buyer.firstName} {order.buyer.lastName}
                          </p>
                          <p className="mt-1 text-xs text-[#6d7b70]">{order.buyer.email}</p>
                          <p className="mt-1 text-xs text-[#6d7b70]">Placed {formatDate(order.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-[#1f2b22]">{formatCurrency(order.total)}</p>
                          <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge}`}>
                            {label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-[#eef2ec] pt-3 text-xs text-[#6d7b70]">
                        <p>
                          Subtotal {formatCurrency(order.subtotal)} · Delivery {formatCurrency(order.deliveryFee)}
                          {order.notes ? <> · {order.notes}</> : null}
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
                                {formatCurrency(
                                  (typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.unitPrice)) * item.quantity,
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {nextOptions.length > 0 ? (
                        <div className="mt-4 flex items-center gap-2 border-t border-[#eef2ec] pt-4">
                          <label className="shrink-0 text-xs font-semibold text-[#6b7b70]">Set status:</label>
                          <select
                            className="flex-1 rounded-xl border border-[#d4ddd0] bg-white px-3 py-2 text-sm text-[#1f2b22] outline-none focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/30 disabled:opacity-50"
                            defaultValue=""
                            disabled={isUpdating}
                            onChange={(e) => {
                              if (e.target.value) {
                                handleUpdateStatus(order.id, e.target.value)
                                e.target.value = ''
                              }
                            }}
                          >
                            <option value="" disabled>Select new status…</option>
                            {nextOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {isUpdating ? (
                            <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#2f9f4f]/30 border-t-[#2f9f4f]" />
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
