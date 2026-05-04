import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { simulateDelivery } from '../lib/simulator.js'
import { geocodeAddress, haversineKm, estimateDelivery, isValidCoord } from '../lib/geo.js'

export const deliveryRouter = Router({ mergeParams: true })

const DELIVERY_BASE_URL = process.env.DELIVERY_BASE_URL ?? 'http://localhost:3002'

// POST /merchants/:merchantId/delivery-order
deliveryRouter.post('/', async (req, res) => {
  const {
    pickup,
    dropoff,
    merchant_order_reference_id: orderRef,
    parcels,
  } = req.body as {
    pickup?: { street?: string; city?: string; lat?: number; lon?: number; contact_name?: string; contact_phone?: string }
    dropoff?: { street?: string; city?: string; lat?: number; lon?: number; contact_name?: string; contact_phone?: string }
    merchant_order_reference_id?: string
    parcels?: unknown[]
  }

  if (!pickup?.street || !dropoff?.street || !orderRef) {
    res.status(400).json({
      code: 'INVALID_REQUEST',
      message: 'pickup.street, dropoff.street, and merchant_order_reference_id are required.',
    })
    return
  }

  let etaMinutes = 30
  let distanceKm: number | null = null

  try {
    const pickupCoords = isValidCoord(pickup.lat, pickup.lon)
      ? { lat: pickup.lat!, lon: pickup.lon! }
      : await geocodeAddress(pickup.street, pickup.city ?? 'Oslo')

    const dropoffCoords = isValidCoord(dropoff.lat, dropoff.lon)
      ? { lat: dropoff.lat!, lon: dropoff.lon! }
      : await geocodeAddress(dropoff.street, dropoff.city ?? 'Oslo')

    if (pickupCoords && dropoffCoords) {
      distanceKm = haversineKm(pickupCoords.lat, pickupCoords.lon, dropoffCoords.lat, dropoffCoords.lon)
      const est = estimateDelivery(distanceKm)
      if (est) etaMinutes = est.etaMinutes
    }
  } catch {
    // Non-fatal — proceed with default ETA
  }

  try {
    const prisma = getPrismaClient()
    const merchantId = (req.params as { merchantId: string }).merchantId

    const delivery = await prisma.delivery.create({
      data: {
        merchantId,
        merchantOrderReference: orderRef,
        pickupStreet: pickup.street,
        pickupCity: pickup.city ?? 'Oslo',
        pickupContactName: pickup.contact_name ?? '',
        pickupContactPhone: pickup.contact_phone ?? '',
        dropoffStreet: dropoff.street,
        dropoffCity: dropoff.city ?? 'Oslo',
        dropoffContactName: dropoff.contact_name ?? '',
        dropoffContactPhone: dropoff.contact_phone ?? '',
        parcels: (parcels ?? [{ description: 'Grocery order', count: 1 }]) as object,
        trackingUrl: '',
        etaMinutes,
        distanceKm,
      },
    })

    const trackingUrl = `${DELIVERY_BASE_URL}/track/${delivery.id}`
    await prisma.delivery.update({ where: { id: delivery.id }, data: { trackingUrl } })

    simulateDelivery(delivery.id, etaMinutes)

    res.status(201).json({
      id: delivery.id,
      status: 'CREATED',
      tracking: { url: trackingUrl },
    })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      res.status(409).json({ code: 'DUPLICATE_ORDER', message: 'Order already has a delivery.' })
      return
    }
    console.error('Create delivery failed', err)
    res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'Could not create delivery.' })
  }
})
