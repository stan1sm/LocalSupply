/**
 * @module DeliveryMyOrdersPage
 * Lists orders claimed by this delivery person. IN_TRANSIT orders have a "Mark as delivered" button.
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'
import DeliverySidebar, { type DeliveryPersonInfo } from '../../components/DeliverySidebar'

type OrderItem = {
  id: string
  quantity: number
  unitPrice: number
  productName: string
  productUnit: string
}

type MyOrder = {
  id: string
  status: string
  total: number
  createdAt: string
  supplier: { id: string; businessName: string; address: string }
  buyer: { firstName: string; lastName: string; email: string }
  deliveryAddress: { address: string; phone: string | null } | null
  items: OrderItem[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  IN_TRANSIT: { label: 'In Transit', color: 'bg-blue-100 text-blue-700' },
  DELIVERED: { label: 'Delivered', color: 'bg-green-100 text-green-700' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' })
}

function MyOrderCard({
  order,
  onComplete,
  completing,
}: {
  order: MyOrder
  onComplete: (id: string) => void
  completing: boolean
}) {
  const badge = STATUS_LABELS[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="rounded-2xl border border-[#dce5d7] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2f9f4f]">Order #{order.id.slice(-8)}</p>
          <p className="mt-0.5 text-xs text-[#6d7b70]">{formatDate(order.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-lg font-bold text-[#1f2b22]">{Number(order.total).toFixed(2)} kr</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[#f6faf5] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#2f9f4f]">Pickup</p>
          <p className="mt-1 text-sm font-semibold text-[#1f2b22]">{order.supplier.businessName}</p>
          <p className="text-xs text-[#6d7b70]">{order.supplier.address}</p>
        </div>
        <div className="rounded-xl bg-[#f6faf5] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#2f9f4f]">Dropoff</p>
          <p className="mt-1 text-sm font-semibold text-[#1f2b22]">
            {order.buyer.firstName} {order.buyer.lastName}
          </p>
          <p className="text-xs text-[#6d7b70]">{order.deliveryAddress?.address ?? 'No address provided'}</p>
          {order.deliveryAddress?.phone ? (
            <p className="text-xs text-[#6d7b70]">{order.deliveryAddress.phone}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">Items</p>
        <ul className="mt-1 space-y-0.5">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-xs text-[#4f5d52]">
              <span>{item.quantity}× {item.productName} ({item.productUnit})</span>
              <span>{(item.quantity * item.unitPrice).toFixed(2)} kr</span>
            </li>
          ))}
        </ul>
      </div>

      {order.status === 'IN_TRANSIT' ? (
        <button
          className="mt-4 w-full rounded-xl bg-[#1a7a34] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#145f29] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={completing}
          onClick={() => onComplete(order.id)}
          type="button"
        >
          {completing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Completing…
            </span>
          ) : 'Mark as delivered'}
        </button>
      ) : null}
    </div>
  )
}

export default function DeliveryMyOrdersPage() {
  const router = useRouter()
  const [person, setPerson] = useState<DeliveryPersonInfo | null>(null)
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState('')

  useEffect(() => {
    const token = window.localStorage.getItem('localsupply-delivery-token')
    const raw = window.localStorage.getItem('localsupply-delivery-person')
    if (!token || !raw) {
      router.replace('/delivery/login')
      return
    }
    try {
      setPerson(JSON.parse(raw) as DeliveryPersonInfo)
    } catch { /* ignore */ }

    fetch(buildApiUrl('/api/delivery-person/my-orders'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MyOrder[]) => { setOrders(data); setLoading(false) })
      .catch(() => { setError('Unable to load your orders. Please try again.'); setLoading(false) })
  }, [router])

  async function handleComplete(orderId: string) {
    const token = window.localStorage.getItem('localsupply-delivery-token')
    if (!token) return
    setCompletingId(orderId)
    setCompleteError('')
    try {
      const r = await fetch(buildApiUrl(`/api/delivery-person/orders/${orderId}/complete`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string }
        setCompleteError(body.message ?? 'Failed to complete order.')
        return
      }
      const updated = (await r.json()) as MyOrder
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)))
    } catch {
      setCompleteError('Unable to reach the server. Please try again.')
    } finally {
      setCompletingId(null)
    }
  }

  if (!person) return null

  const inTransit = orders.filter((o) => o.status === 'IN_TRANSIT')
  const delivered = orders.filter((o) => o.status === 'DELIVERED')

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <div className="mx-auto flex max-w-6xl gap-6 p-4 sm:p-6 lg:p-8">
        <div className="hidden w-64 shrink-0 lg:block">
          <DeliverySidebar activeId="my-orders" person={person} />
        </div>

        <main className="flex-1 min-w-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#1f2b22]">My Deliveries</h1>
            <p className="mt-1 text-sm text-[#6d7b70]">Your claimed orders — mark them as delivered when done.</p>
          </div>

          {/* Mobile nav */}
          <div className="mb-4 flex gap-2 lg:hidden">
            <a href="/delivery/dashboard" className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#4f5d52] hover:bg-[#f6faf5]">Available</a>
            <a href="/delivery/my-orders" className="rounded-lg bg-[#eef6f0] px-3 py-1.5 text-sm font-medium text-[#1a7a34]">My Deliveries</a>
          </div>

          {completeError ? (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{completeError}</div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#fecdd3] bg-red-50 p-6 text-center">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-[#dce5d7] bg-white p-12 text-center">
              <p className="text-sm font-medium text-[#6d7b70]">No deliveries yet.</p>
              <p className="mt-1 text-xs text-[#9ca3af]">
                <a href="/delivery/dashboard" className="text-[#2f9f4f] hover:underline">Pick up an order</a> to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {inTransit.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-[#4f5d52]">In Transit ({inTransit.length})</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {inTransit.map((order) => (
                      <MyOrderCard
                        key={order.id}
                        order={order}
                        onComplete={handleComplete}
                        completing={completingId === order.id}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
              {delivered.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-[#4f5d52]">Delivered ({delivered.length})</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {delivered.map((order) => (
                      <MyOrderCard
                        key={order.id}
                        order={order}
                        onComplete={handleComplete}
                        completing={false}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
