/**
 * @module DeliveryDashboardPage
 * Lists CONFIRMED orders with no delivery person assigned. Allows claiming an order.
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

type AvailableOrder = {
  id: string
  status: string
  total: number
  createdAt: string
  supplier: { id: string; businessName: string; address: string }
  buyer: { firstName: string; lastName: string; email: string }
  deliveryAddress: { address: string; phone: string | null } | null
  items: OrderItem[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' })
}

function OrderCard({
  order,
  onClaim,
  claiming,
}: {
  order: AvailableOrder
  onClaim: (id: string) => void
  claiming: boolean
}) {
  return (
    <div className="rounded-2xl border border-[#dce5d7] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2f9f4f]">Order #{order.id.slice(-8)}</p>
          <p className="mt-0.5 text-xs text-[#6d7b70]">{formatDate(order.createdAt)}</p>
        </div>
        <p className="shrink-0 text-lg font-bold text-[#1f2b22]">{Number(order.total).toFixed(2)} kr</p>
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

      <button
        className="mt-4 w-full rounded-xl bg-[#2f9f4f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={claiming}
        onClick={() => onClaim(order.id)}
        type="button"
      >
        {claiming ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Claiming…
          </span>
        ) : 'Pick up for delivery'}
      </button>
    </div>
  )
}

export default function DeliveryDashboardPage() {
  const router = useRouter()
  const [person, setPerson] = useState<DeliveryPersonInfo | null>(null)
  const [orders, setOrders] = useState<AvailableOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimError, setClaimError] = useState('')

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

    fetch(buildApiUrl('/api/delivery-person/available-orders'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 403) return Promise.reject('not_approved')
        if (!r.ok) return Promise.reject('fetch_failed')
        return r.json() as Promise<AvailableOrder[]>
      })
      .then((data) => { setOrders(data); setLoading(false) })
      .catch((reason) => {
        if (reason === 'not_approved') {
          setError('Your account is pending admin approval. Check back soon.')
        } else {
          setError('Unable to load orders. Please try again.')
        }
        setLoading(false)
      })
  }, [router])

  async function handleClaim(orderId: string) {
    const token = window.localStorage.getItem('localsupply-delivery-token')
    if (!token) return
    setClaimingId(orderId)
    setClaimError('')
    try {
      const r = await fetch(buildApiUrl(`/api/delivery-person/orders/${orderId}/claim`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string }
        setClaimError(body.message ?? 'Failed to claim order.')
        return
      }
      router.push('/delivery/my-orders')
    } catch {
      setClaimError('Unable to reach the server. Please try again.')
    } finally {
      setClaimingId(null)
    }
  }

  if (!person) return null

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <div className="mx-auto flex max-w-6xl gap-6 p-4 sm:p-6 lg:p-8">
        <div className="hidden w-64 shrink-0 lg:block">
          <DeliverySidebar activeId="dashboard" person={person} />
        </div>

        <main className="flex-1 min-w-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#1f2b22]">Available Orders</h1>
            <p className="mt-1 text-sm text-[#6d7b70]">Orders ready for pickup — claim one to start delivering.</p>
          </div>

          {/* Mobile nav */}
          <div className="mb-4 flex gap-2 lg:hidden">
            <a href="/delivery/dashboard" className="rounded-lg bg-[#eef6f0] px-3 py-1.5 text-sm font-medium text-[#1a7a34]">Available</a>
            <a href="/delivery/my-orders" className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#4f5d52] hover:bg-[#f6faf5]">My Deliveries</a>
          </div>

          {claimError ? (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{claimError}</div>
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
              <svg className="mx-auto mb-4 h-12 w-12 text-[#9ca3af]" fill="none" stroke="currentColor" strokeWidth={1.25} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
              <p className="text-sm font-medium text-[#6d7b70]">No orders available right now.</p>
              <p className="mt-1 text-xs text-[#9ca3af]">Check back soon — confirmed orders will appear here.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onClaim={handleClaim}
                  claiming={claimingId === order.id}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
