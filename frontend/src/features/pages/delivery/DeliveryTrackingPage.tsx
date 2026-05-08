'use client'

import { lazy, Suspense, useEffect, useState } from 'react'
import BuyerSidebar from '../../components/BuyerSidebar'
import { buildApiUrl } from '../../../lib/api'
import { geocodeAddress } from '../../../lib/geonorgeAdresser'
import type { StoreMarker } from '../../components/DeliveryMap'

const DeliveryMap = lazy(() => import('../../components/DeliveryMap'))

type Order = {
  id: string
  status: string
  woltDeliveryId: string | null
  woltStatus: string | null
  woltTrackingUrl: string | null
  createdAt: string
  supplier: { id: string; businessName: string; address: string }
  notes: string | null
}

type TrackingData = {
  id: string
  status: string
  etaMinutes: number
  distanceKm: number | null
  updatedAt: string
  pickupAddress: string
  dropoffAddress: string
}

type DeliveryEntry = {
  order: Order
  tracking: TrackingData | null
  dropoffCoords: { lat: number; lon: number } | null
  pickupCoords: { lat: number; lon: number } | null
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  CREATED:   { label: 'Finding a courier',  badge: 'bg-[#fff4e0] text-[#92600a]' },
  PICKED_UP: { label: 'On the way',         badge: 'bg-[#dcf5e2] text-[#1a7a34]' },
  DELIVERED: { label: 'Delivered',          badge: 'bg-[#dcf5e2] text-[#1a7a34]' },
  CANCELLED: { label: 'Cancelled',          badge: 'bg-[#fef0ef] text-[#9b2c2c]' },
}

function StatusStep({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${done || active ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#d4ddd0] bg-white'} ${active ? 'shadow-[0_0_0_4px_#d4eddb]' : ''}`}>
        {done ? (
          <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : null}
      </div>
      <span className={`text-xs font-medium ${done || active ? 'text-[#1f2b22]' : 'text-[#8a9e8f]'}`}>{label}</span>
    </div>
  )
}

function DeliveryCard({ entry }: { entry: DeliveryEntry }) {
  const { order, tracking, dropoffCoords, pickupCoords } = entry
  const status = tracking?.status ?? order.woltStatus ?? 'CREATED'
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.CREATED!
  const isActive = status !== 'DELIVERED' && status !== 'CANCELLED'

  const isPickedUp = status === 'PICKED_UP' || status === 'DELIVERED'
  const isDelivered = status === 'DELIVERED'

  const pickupStore: StoreMarker | null = pickupCoords
    ? {
        chain: 'store',
        name: tracking?.pickupAddress ?? order.supplier.address,
        lat: pickupCoords.lat,
        lon: pickupCoords.lon,
        color: '#2f9f4f',
        isSelected: true,
        etaMinutes: tracking?.etaMinutes,
        distanceKm: tracking?.distanceKm ?? undefined,
      }
    : null

  return (
    <div className="rounded-[20px] border border-[#dce5d7] bg-white shadow-[0_8px_24px_rgba(18,38,24,0.06)]">
      <div className="flex items-center justify-between border-b border-[#eef2ec] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2f9f4f]">{order.supplier.businessName}</p>
          <p className="mt-0.5 text-xs text-[#8a9e8f]">
            {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.badge}`}>{cfg.label}</span>
      </div>

      <div className="px-5 py-4">
        {tracking ? (
          <>
            <div className="flex items-center gap-6 text-xs text-[#6d7b70]">
              {tracking.distanceKm != null ? (
                <span><span className="font-semibold text-[#1f2b22]">{tracking.distanceKm.toFixed(1)} km</span> distance</span>
              ) : null}
              <span><span className="font-semibold text-[#1f2b22]">~{tracking.etaMinutes} min</span> ETA</span>
              {tracking.dropoffAddress ? (
                <span className="truncate"><span className="font-semibold text-[#1f2b22]">To:</span> {tracking.dropoffAddress}</span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <StatusStep done label="Order received" active={false} />
              <div className="ml-2.5 h-4 w-px bg-[#e5ece2]" />
              <StatusStep done={isPickedUp} active={!isPickedUp && status === 'CREATED'} label="Courier picked up order" />
              <div className="ml-2.5 h-4 w-px bg-[#e5ece2]" />
              <StatusStep done={isDelivered} active={isPickedUp && !isDelivered} label="Delivered" />
            </div>
          </>
        ) : (
          <p className="text-xs text-[#8a9e8f]">Tracking details unavailable.</p>
        )}

        {isActive && dropoffCoords ? (
          <div className="mt-4 h-56 overflow-hidden rounded-xl border border-[#e5ece2]">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-[#8a9e8f]">Loading map…</div>}>
              <DeliveryMap
                dropoffLat={dropoffCoords.lat}
                dropoffLon={dropoffCoords.lon}
                dropoffLabel={tracking?.dropoffAddress ?? 'Delivery address'}
                stores={pickupStore ? [pickupStore] : []}
              />
            </Suspense>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function DeliveryTrackingPage() {
  const [entries, setEntries] = useState<DeliveryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const token = typeof window !== 'undefined' ? window.localStorage.getItem('localsupply-token') : null
        const buyerRaw = typeof window !== 'undefined' ? window.localStorage.getItem('localsupply-user') : null
        const buyerId: string = buyerRaw ? ((JSON.parse(buyerRaw) as { id?: string }).id ?? '') : ''
        if (!token || !buyerId) { window.location.href = '/login'; return }
        const headers = { Authorization: `Bearer ${token}` }

        const res = await fetch(buildApiUrl(`/api/orders/buyer/${encodeURIComponent(buyerId)}`), { headers })
        if (!res.ok) {
          if (res.status === 401) { window.location.href = '/login'; return }
          throw new Error('Failed to load orders')
        }

        const orders = (await res.json()) as Order[]
        const withDelivery = orders.filter((o) => o.woltDeliveryId)

        const results = await Promise.all(
          withDelivery.map(async (order): Promise<DeliveryEntry> => {
            try {
              const r = await fetch(buildApiUrl(`/api/delivery/track/${encodeURIComponent(order.woltDeliveryId!)}`), { headers })
              if (!r.ok) return { order, tracking: null, dropoffCoords: null, pickupCoords: null }
              const tracking = (await r.json()) as TrackingData
              const [dropoffCoords, pickupCoords] = await Promise.all([
                tracking.dropoffAddress ? geocodeAddress(tracking.dropoffAddress) : Promise.resolve(null),
                tracking.pickupAddress ? geocodeAddress(tracking.pickupAddress) : Promise.resolve(null),
              ])
              return { order, tracking, dropoffCoords, pickupCoords }
            } catch {
              return { order, tracking: null, dropoffCoords: null, pickupCoords: null }
            }
          }),
        )

        if (!cancelled) setEntries(results)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load deliveries.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(45,155,79,0.12),transparent_30%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[220px_1fr] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <BuyerSidebar />

        <main className="min-w-0">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#1f2b22]">Delivery Tracking</h1>
              <p className="mt-0.5 text-sm text-[#6d7b70]">Live status of your active deliveries</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#9b2c2c]">{error}</div>
          ) : entries.length === 0 ? (
            <div className="rounded-[20px] border border-[#dce5d7] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(18,38,24,0.06)]">
              <svg className="mx-auto mb-3 h-10 w-10 text-[#c8d8c8]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
              <p className="font-semibold text-[#1f2b22]">No active deliveries</p>
              <p className="mt-1 text-sm text-[#6d7b70]">Orders with delivery will appear here once dispatched.</p>
              <a className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#25813f]" href="/orders">
                View orders
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {entries.map((entry) => (
                <DeliveryCard entry={entry} key={entry.order.id} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
