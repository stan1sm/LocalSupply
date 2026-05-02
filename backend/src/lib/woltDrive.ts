/**
 * @module woltDrive
 * Wraps the Wolt Drive (DaaS) REST API to request delivery fee estimates, create delivery orders, and map Wolt status codes to application order statuses and human-readable labels.
 */
const WOLT_API_BASE = (process.env.WOLT_API_BASE_URL ?? 'https://daas-staging.wolt.com').replace(/\/$/, '')
const WOLT_API_KEY = process.env.WOLT_API_KEY ?? ''
const WOLT_MERCHANT_ID = process.env.WOLT_MERCHANT_ID ?? ''

/**
 * @type {boolean}
 * `true` when both `WOLT_API_KEY` and `WOLT_MERCHANT_ID` environment variables are non-empty, indicating that Wolt Drive API calls can be made.
 */
export const WOLT_CONFIGURED = Boolean(WOLT_API_KEY && WOLT_MERCHANT_ID)

/**
 * A string literal union of all structured error codes returned by the Wolt Drive API.
 *
 * Variants:
 * - `'DELIVERY_AREA_CLOSED'` — Wolt does not operate in this area.
 * - `'DELIVERY_AREA_CLOSED_TEMPORARILY'` — Area is temporarily out of service.
 * - `'REQUEST_OUTSIDE_DELIVERY_HOURS'` — Request was made outside Wolt operating hours.
 * - `'DROPOFF_OUTSIDE_OF_DELIVERY_AREA'` — The drop-off address is beyond the delivery zone.
 * - `'INVALID_DROPOFF_ADDRESS'` — The drop-off address could not be resolved by Wolt.
 * - `'INVALID_PICKUP_ADDRESS'` — The pickup address could not be resolved by Wolt.
 * - `'VENUE_CLOSED'` — The merchant venue is currently closed.
 * - `'WOLT_UNAVAILABLE'` — Catch-all: Wolt is not configured or an unexpected error occurred.
 */
export type WoltDeliveryErrorCode =
  | 'DELIVERY_AREA_CLOSED'
  | 'DELIVERY_AREA_CLOSED_TEMPORARILY'
  | 'REQUEST_OUTSIDE_DELIVERY_HOURS'
  | 'DROPOFF_OUTSIDE_OF_DELIVERY_AREA'
  | 'INVALID_DROPOFF_ADDRESS'
  | 'INVALID_PICKUP_ADDRESS'
  | 'VENUE_CLOSED'
  | 'WOLT_UNAVAILABLE'

/**
 * A physical address used as a pickup or drop-off location in Wolt Drive API requests.
 * @property {string} street - Street name and house number (e.g. `"Storgata 1"`).
 * @property {string} city - City name (e.g. `"Oslo"`).
 * @property {number} [lat] - Optional latitude coordinate; improves address resolution accuracy when provided.
 * @property {number} [lon] - Optional longitude coordinate; improves address resolution accuracy when provided.
 */
export type WoltAddress = {
  street: string
  city: string
  lat?: number
  lon?: number
}

/**
 * Describes a parcel included in a Wolt Drive delivery order.
 * @property {string} description - Human-readable contents description (e.g. `"Grocery order"`).
 * @property {number} [count] - Number of individual parcels; defaults to `1` when omitted.
 * @property {number} [weight_gram] - Total parcel weight in grams; used by Wolt for courier assignment when provided.
 */
export type WoltParcel = {
  description: string
  count?: number
  weight_gram?: number
}

/**
 * A successful delivery fee estimate from Wolt Drive.
 * @property {true} ok - Discriminant indicating a successful result.
 * @property {number} fee - Delivery fee in the major currency unit (NOK), rounded to two decimal places.
 * @property {number} etaMinutes - Estimated delivery time in minutes.
 * @property {string} currency - ISO 4217 currency code (typically `"NOK"`).
 */
export type WoltEstimateSuccess = {
  ok: true
  fee: number
  etaMinutes: number
  currency: string
}

/**
 * A failed delivery fee estimate from Wolt Drive.
 * @property {false} ok - Discriminant indicating a failed result.
 * @property {WoltDeliveryErrorCode} errorCode - Machine-readable reason for the failure.
 * @property {string} message - Human-readable error description suitable for display.
 */
export type WoltEstimateFailure = {
  ok: false
  errorCode: WoltDeliveryErrorCode
  message: string
}

/**
 * Discriminated union returned by {@link getDeliveryEstimate}.
 * Discriminate on `ok`: `true` for {@link WoltEstimateSuccess}, `false` for {@link WoltEstimateFailure}.
 */
export type WoltEstimateResult = WoltEstimateSuccess | WoltEstimateFailure

/**
 * A successfully created Wolt Drive delivery order.
 * @property {true} ok - Discriminant indicating a successful result.
 * @property {string} deliveryId - The Wolt-assigned delivery UUID.
 * @property {string} trackingUrl - Public URL where the buyer can track the courier in real time.
 * @property {string} status - The initial Wolt delivery status string (e.g. `"CREATED"`).
 */
export type WoltDeliverySuccess = {
  ok: true
  deliveryId: string
  trackingUrl: string
  status: string
}

/**
 * A failed Wolt Drive delivery creation attempt.
 * @property {false} ok - Discriminant indicating a failed result.
 * @property {string} errorCode - Machine-readable reason for the failure (may be a {@link WoltDeliveryErrorCode} or an unexpected code from the API).
 * @property {string} message - Human-readable error description suitable for display.
 */
export type WoltDeliveryFailure = {
  ok: false
  errorCode: string
  message: string
}

/**
 * Discriminated union returned by {@link createDelivery}.
 * Discriminate on `ok`: `true` for {@link WoltDeliverySuccess}, `false` for {@link WoltDeliveryFailure}.
 */
export type WoltDeliveryResult = WoltDeliverySuccess | WoltDeliveryFailure

/**
 * Requests a delivery fee estimate from the Wolt Drive API for a given pickup–drop-off pair.
 * @param {{ pickup: WoltAddress; dropoff: WoltAddress; parcels?: WoltParcel[] }} params - Estimate request parameters.
 * @param {WoltAddress} params.pickup - The merchant pickup address.
 * @param {WoltAddress} params.dropoff - The buyer drop-off address.
 * @param {WoltParcel[]} [params.parcels] - Optional parcel details; omitted from the request when empty.
 * @returns {Promise<WoltEstimateResult>} A {@link WoltEstimateSuccess} with fee and ETA, or a {@link WoltEstimateFailure} with an error code.
 */
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

/**
 * Creates a live delivery order with Wolt Drive and returns the delivery ID and tracking URL.
 * @param {{ orderId: string; pickup: WoltAddress & { contactName: string; contactPhone: string }; dropoff: WoltAddress & { contactName: string; contactPhone: string }; parcels?: WoltParcel[]; orderReference?: string }} params - Delivery creation parameters.
 * @param {string} params.orderId - The internal application order ID used as a fallback merchant reference.
 * @param {WoltAddress & { contactName: string; contactPhone: string }} params.pickup - Pickup address extended with the supplier contact name and phone number.
 * @param {WoltAddress & { contactName: string; contactPhone: string }} params.dropoff - Drop-off address extended with the buyer contact name and phone number.
 * @param {WoltParcel[]} [params.parcels] - Optional parcel descriptors; defaults to a single generic grocery parcel when omitted.
 * @param {string} [params.orderReference] - Optional merchant order reference sent to Wolt; falls back to `orderId` when not provided.
 * @returns {Promise<WoltDeliveryResult>} A {@link WoltDeliverySuccess} with the Wolt delivery ID and tracking URL, or a {@link WoltDeliveryFailure} with an error code.
 */
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

/**
 * Maps a Wolt Drive error code to a user-friendly English message.
 * @param {string} code - A Wolt error code string (see {@link WoltDeliveryErrorCode}); unrecognised codes return a generic unavailability message.
 * @returns {string} A human-readable description of why the delivery request failed.
 */
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

/**
 * Parses a comma-separated address string into a {@link WoltAddress} object, stripping any leading postal code from the city segment.
 * @param {string} address - A formatted address string such as `"Storgata 1, 0182 Oslo"`.
 * @returns {WoltAddress} An object with `street` and `city` fields; city defaults to `"Oslo"` when it cannot be extracted.
 */
export function parseAddressString(address: string): WoltAddress {
  // "Storgata 1, 0182 Oslo" → { street: "Storgata 1", city: "Oslo" }
  const parts = address.split(',').map((p) => p.trim())
  const street = parts[0] ?? address
  const cityRaw = parts.slice(1).join(', ')
  const city = cityRaw.replace(/^\d{4,5}\s*/, '').trim() || 'Oslo'
  return { street, city }
}

/**
 * Converts a Wolt Drive status string to the corresponding application order status.
 * @param {string} woltStatus - The raw Wolt delivery status (case-insensitive); e.g. `"PICKUP_STARTED"`, `"DELIVERED"`, `"CANCELLED"`.
 * @returns {'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | null} The mapped application status, or `null` when the Wolt status is unrecognised.
 */
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

/**
 * Returns a short, user-facing label for a Wolt Drive delivery status.
 * @param {string} woltStatus - The raw Wolt delivery status (case-insensitive); e.g. `"PICKED_UP"`, `"DELIVERED"`.
 * @returns {string} A human-readable status label (e.g. `"On the way to you"`); returns the original status string when unrecognised.
 */
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
