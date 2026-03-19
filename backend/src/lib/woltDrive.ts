const WOLT_API_BASE = (process.env.WOLT_API_BASE_URL ?? 'https://daas-staging.wolt.com').replace(/\/$/, '')
const WOLT_API_KEY = process.env.WOLT_API_KEY ?? ''
const WOLT_MERCHANT_ID = process.env.WOLT_MERCHANT_ID ?? ''

export const WOLT_CONFIGURED = Boolean(WOLT_API_KEY && WOLT_MERCHANT_ID)

export type WoltDeliveryErrorCode =
  | 'DELIVERY_AREA_CLOSED'
  | 'DELIVERY_AREA_CLOSED_TEMPORARILY'
  | 'REQUEST_OUTSIDE_DELIVERY_HOURS'
  | 'DROPOFF_OUTSIDE_OF_DELIVERY_AREA'
  | 'INVALID_DROPOFF_ADDRESS'
  | 'INVALID_PICKUP_ADDRESS'
  | 'VENUE_CLOSED'
  | 'WOLT_UNAVAILABLE'

export type WoltAddress = {
  street: string
  city: string
  lat?: number
  lon?: number
}

export type WoltParcel = {
  description: string
  count?: number
  weight_gram?: number
}

export type WoltEstimateSuccess = {
  ok: true
  fee: number
  etaMinutes: number
  currency: string
}

export type WoltEstimateFailure = {
  ok: false
  errorCode: WoltDeliveryErrorCode
  message: string
}

export type WoltEstimateResult = WoltEstimateSuccess | WoltEstimateFailure

export type WoltDeliverySuccess = {
  ok: true
  deliveryId: string
  trackingUrl: string
  status: string
}

export type WoltDeliveryFailure = {
  ok: false
  errorCode: string
  message: string
}

export type WoltDeliveryResult = WoltDeliverySuccess | WoltDeliveryFailure

export async function getDeliveryEstimate(params: {
  pickup: WoltAddress
  dropoff: WoltAddress
  parcels?: WoltParcel[]
}): Promise<WoltEstimateResult> {
  if (!WOLT_CONFIGURED) {
    return { ok: false, errorCode: 'WOLT_UNAVAILABLE', message: 'Wolt not configured.' }
  }

  try {
    const body: Record<string, unknown> = {
      pickup: buildAddressPayload(params.pickup),
      dropoff: buildAddressPayload(params.dropoff),
    }
    if (params.parcels?.length) body.parcels = params.parcels

    const response = await fetch(`${WOLT_API_BASE}/merchants/${WOLT_MERCHANT_ID}/delivery-fee`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WOLT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (!response.ok) {
      const code = (typeof data.code === 'string' ? data.code : 'WOLT_UNAVAILABLE') as WoltDeliveryErrorCode
      return { ok: false, errorCode: code, message: labelForErrorCode(code) }
    }

    const fee = data.fee as { amount?: number; currency?: string } | undefined
    // Wolt returns fee in lowest denomination (øre): 1 NOK = 100 øre
    const feeNok = typeof fee?.amount === 'number' ? fee.amount / 100 : 0
    const etaMinutes = typeof data.time_estimate_minutes === 'number' ? data.time_estimate_minutes : 45

    return { ok: true, fee: Math.round(feeNok * 100) / 100, etaMinutes, currency: fee?.currency ?? 'NOK' }
  } catch (err) {
    console.error('Wolt estimate error', err)
    return { ok: false, errorCode: 'WOLT_UNAVAILABLE', message: 'Wolt delivery service is unavailable.' }
  }
}

export async function createDelivery(params: {
  orderId: string
  pickup: WoltAddress & { contactName: string; contactPhone: string }
  dropoff: WoltAddress & { contactName: string; contactPhone: string }
  parcels?: WoltParcel[]
  orderReference?: string
}): Promise<WoltDeliveryResult> {
  if (!WOLT_CONFIGURED) {
    return { ok: false, errorCode: 'WOLT_UNAVAILABLE', message: 'Wolt not configured.' }
  }

  try {
    const body = {
      pickup: {
        ...buildAddressPayload(params.pickup),
        contact_name: params.pickup.contactName,
        contact_phone: params.pickup.contactPhone,
      },
      dropoff: {
        ...buildAddressPayload(params.dropoff),
        contact_name: params.dropoff.contactName,
        contact_phone: params.dropoff.contactPhone,
      },
      merchant_order_reference_id: params.orderReference ?? params.orderId,
      parcels: params.parcels ?? [{ description: 'Grocery order', count: 1 }],
    }

    const response = await fetch(`${WOLT_API_BASE}/merchants/${WOLT_MERCHANT_ID}/delivery-order`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WOLT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (!response.ok) {
      const code = typeof data.code === 'string' ? data.code : 'WOLT_UNAVAILABLE'
      return { ok: false, errorCode: code, message: labelForErrorCode(code) }
    }

    const tracking = data.tracking as { url?: string } | undefined
    return {
      ok: true,
      deliveryId: typeof data.id === 'string' ? data.id : '',
      trackingUrl: tracking?.url ?? '',
      status: typeof data.status === 'string' ? data.status : 'CREATED',
    }
  } catch (err) {
    console.error('Wolt create delivery error', err)
    return { ok: false, errorCode: 'WOLT_UNAVAILABLE', message: 'Could not create Wolt delivery.' }
  }
}

function buildAddressPayload(addr: WoltAddress): Record<string, unknown> {
  const payload: Record<string, unknown> = { street: addr.street, city: addr.city }
  if (addr.lat !== undefined) payload.lat = addr.lat
  if (addr.lon !== undefined) payload.lon = addr.lon
  return payload
}

export function labelForErrorCode(code: string): string {
  switch (code) {
    case 'DELIVERY_AREA_CLOSED': return 'Wolt delivery is closed in this area right now.'
    case 'DELIVERY_AREA_CLOSED_TEMPORARILY': return 'Wolt delivery is temporarily unavailable in this area.'
    case 'REQUEST_OUTSIDE_DELIVERY_HOURS': return 'Wolt delivery is outside operating hours right now.'
    case 'DROPOFF_OUTSIDE_OF_DELIVERY_AREA': return 'Your address is outside the Wolt delivery area.'
    case 'INVALID_DROPOFF_ADDRESS': return 'Wolt could not recognise your delivery address.'
    case 'INVALID_PICKUP_ADDRESS': return 'Pickup address is not valid for Wolt.'
    case 'VENUE_CLOSED': return 'The store is currently closed for Wolt deliveries.'
    default: return 'Wolt delivery is not available right now.'
  }
}

export function parseAddressString(address: string): WoltAddress {
  // "Storgata 1, 0182 Oslo" → { street: "Storgata 1", city: "Oslo" }
  const parts = address.split(',').map((p) => p.trim())
  const street = parts[0] ?? address
  const cityRaw = parts.slice(1).join(', ')
  const city = cityRaw.replace(/^\d{4,5}\s*/, '').trim() || 'Oslo'
  return { street, city }
}

export function woltStatusToOrderStatus(woltStatus: string): 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | null {
  switch (woltStatus.toUpperCase()) {
    case 'CREATED':
    case 'PICKUP_STARTED':
    case 'ARRIVED_AT_PICKUP':
      return 'CONFIRMED'
    case 'PICKED_UP':
    case 'DROPOFF_STARTED':
    case 'ARRIVED_AT_DROPOFF':
      return 'IN_TRANSIT'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
    case 'RETURNED':
      return 'CANCELLED'
    default:
      return null
  }
}

export function woltStatusLabel(woltStatus: string): string {
  switch (woltStatus.toUpperCase()) {
    case 'CREATED': return 'Delivery arranged'
    case 'PICKUP_STARTED': return 'Courier heading to store'
    case 'ARRIVED_AT_PICKUP': return 'Courier at store'
    case 'PICKED_UP': return 'Order picked up'
    case 'DROPOFF_STARTED': return 'On the way to you'
    case 'ARRIVED_AT_DROPOFF': return 'Courier nearby'
    case 'DELIVERED': return 'Delivered'
    case 'CANCELLED': return 'Delivery cancelled'
    case 'RETURNED': return 'Order returned'
    default: return woltStatus
  }
}
