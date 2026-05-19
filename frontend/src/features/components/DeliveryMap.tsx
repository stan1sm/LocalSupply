'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { Map, Marker, Polyline } from 'leaflet'

export type StoreMarker = {
  chain: string
  name: string
  lat: number
  lon: number
  color: string
  isSelected: boolean
  distanceKm?: number
  feeNok?: number
  etaMinutes?: number
}

type Props = {
  dropoffLat: number
  dropoffLon: number
  dropoffLabel: string
  stores?: StoreMarker[]
}

export default function DeliveryMap({ dropoffLat, dropoffLon, dropoffLabel, stores = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const layersRef = useRef<(Marker | Polyline)[]>([])

  // Stable key so the effect only re-runs when data actually changes
  const storesKey = useMemo(
    () => stores.map((s) => `${s.chain}:${s.lat}:${s.lon}:${Number(s.isSelected)}`).join('|'),
    [stores],
  )

  useEffect(() => {
    let L: typeof import('leaflet')
    let mounted = true

    async function init() {
      if (!containerRef.current) return
      L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css' as string)
      if (!mounted || !containerRef.current) return

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 18,
        }).addTo(mapRef.current)
      }

      const map = mapRef.current

      for (const layer of layersRef.current) layer.remove()
      layersRef.current = []

      const homeIcon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#1a4a7a;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      layersRef.current.push(
        L.marker([dropoffLat, dropoffLon], { icon: homeIcon })
          .addTo(map)
          .bindPopup(`<b>Delivery address</b><br>${dropoffLabel}`),
      )

      const allPoints: [number, number][] = [[dropoffLat, dropoffLon]]
      const selected = stores.find((s) => s.isSelected)
      const unselected = stores.filter((s) => !s.isSelected)

      for (const store of unselected) {
        allPoints.push([store.lat, store.lon])
        layersRef.current.push(
          L.polyline([[store.lat, store.lon], [dropoffLat, dropoffLon]], {
            color: store.color,
            weight: 1.5,
            dashArray: '4 6',
            opacity: 0.25,
          }).addTo(map),
        )
      }

      if (selected) {
        allPoints.push([selected.lat, selected.lon])
        layersRef.current.push(
          L.polyline([[selected.lat, selected.lon], [dropoffLat, dropoffLon]], {
            color: selected.color,
            weight: 3,
            dashArray: '6 6',
            opacity: 0.85,
          }).addTo(map),
        )
      }

      for (const store of unselected) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:10px;height:10px;border-radius:50%;background:${store.color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);opacity:0.6"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        })
        layersRef.current.push(L.marker([store.lat, store.lon], { icon }).addTo(map).bindPopup(buildPopup(store)))
      }

      if (selected) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${selected.color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
        layersRef.current.push(
          L.marker([selected.lat, selected.lon], { icon }).addTo(map).bindPopup(buildPopup(selected)),
        )
      }

      if (allPoints.length > 1) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [48, 48] })
      } else {
        map.setView([dropoffLat, dropoffLon], 14)
      }
    }

    init()
    return () => { mounted = false }
    // storesKey is a stable string derived from stores — avoids object reference issues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropoffLat, dropoffLon, dropoffLabel, storesKey])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="h-64 w-full rounded-2xl overflow-hidden" />
}

function buildPopup(store: StoreMarker): string {
  return [
    `<b>${store.name}</b>`,
    store.distanceKm != null ? `${store.distanceKm} km away` : '',
    store.feeNok != null ? `~${store.feeNok.toFixed(0)} kr delivery` : '',
    store.etaMinutes != null ? `~${store.etaMinutes} min ETA` : '',
  ]
    .filter(Boolean)
    .join('<br>')
}
