import { Router } from 'express'
import { geocodeAddress, haversineKm, estimateDelivery, isValidCoord } from '../lib/geo.js'

const estimateRouter = Router({ mergeParams: true })

// POST /merchants/:merchantId/delivery-fee
estimateRouter.post('/', async (req, res) => {
  const { pickup, dropoff } = req.body as {
    pickup?: { street?: string; city?: string; lat?: number; lon?: number }
    dropoff?: { street?: string; city?: string; lat?: number; lon?: number }
  }

  if (!dropoff?.street || !dropoff?.city) {
    res.status(400).json({ code: 'INVALID_DROPOFF_ADDRESS', message: 'dropoff.street and dropoff.city are required.' })
    return
  }

  let pickupCoords: { lat: number; lon: number } | null = null
  let dropoffCoords: { lat: number; lon: number } | null = null

  if (isValidCoord(pickup?.lat, pickup?.lon)) {
    pickupCoords = { lat: pickup!.lat!, lon: pickup!.lon! }
  } else if (pickup?.street && pickup?.city) {
    pickupCoords = await geocodeAddress(pickup.street, pickup.city)
  }

  if (isValidCoord(dropoff.lat, dropoff.lon)) {
    dropoffCoords = { lat: dropoff.lat!, lon: dropoff.lon! }
  } else {
    dropoffCoords = await geocodeAddress(dropoff.street, dropoff.city)
  }

  if (!pickupCoords || !dropoffCoords) {
    res.json({ fee: { amount: 4900, currency: 'NOK' }, time_estimate_minutes: 30 })
    return
  }

  const km = haversineKm(pickupCoords.lat, pickupCoords.lon, dropoffCoords.lat, dropoffCoords.lon)
  const estimate = estimateDelivery(km)

  if (!estimate) {
    res.status(400).json({ code: 'DROPOFF_OUTSIDE_OF_DELIVERY_AREA', message: 'Address is outside the delivery area (max 40 km).' })
    return
  }

  res.json({
    fee: { amount: estimate.feeOre, currency: 'NOK' },
    time_estimate_minutes: estimate.etaMinutes,
  })
})

export default estimateRouter
