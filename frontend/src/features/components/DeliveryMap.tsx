'use client'

import { useEffect, useRef } from 'react'
import type { Map, Marker, Polyline } from 'leaflet'

type Props = {
  pickupLat: number
  pickupLon: number
  dropoffLat: number
  dropoffLon: number
  pickupLabel: string
  dropoffLabel: string
}

export default function DeliveryMap({ pickupLat, pickupLon, dropoffLat, dropoffLon, pickupLabel, dropoffLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<{ pickup: Marker | null; dropoff: Marker | null; line: Polyline | null }>({
    pickup: null, dropoff: null, line: null,
  })

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
      const refs = markersRef.current

      refs.pickup?.remove()
      refs.dropoff?.remove()
      refs.line?.remove()

      const storeIcon = L.divIcon({
        className: '',
        html: `<div style="background:#2f9f4f;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid #fff">🏪</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      const homeIcon = L.divIcon({
        className: '',
        html: `<div style="background:#1a4a7a;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid #fff">📍</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      refs.pickup = L.marker([pickupLat, pickupLon], { icon: storeIcon })
        .addTo(map)
        .bindPopup(`<b>Pickup</b><br>${pickupLabel}`)

      refs.dropoff = L.marker([dropoffLat, dropoffLon], { icon: homeIcon })
        .addTo(map)
        .bindPopup(`<b>Delivery</b><br>${dropoffLabel}`)

      refs.line = L.polyline(
        [[pickupLat, pickupLon], [dropoffLat, dropoffLon]],
        { color: '#2f9f4f', weight: 2.5, dashArray: '6 6', opacity: 0.7 }
      ).addTo(map)

      const bounds = L.latLngBounds(
        [pickupLat, pickupLon],
        [dropoffLat, dropoffLon],
      )
      map.fitBounds(bounds, { padding: [48, 48] })
    }

    init()
    return () => { mounted = false }
  }, [pickupLat, pickupLon, dropoffLat, dropoffLon, pickupLabel, dropoffLabel])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="h-56 w-full rounded-2xl overflow-hidden" />
}
