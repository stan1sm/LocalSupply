/**
 * @module jwt
 * Signs and verifies role-scoped JSON Web Tokens for buyers, suppliers, and admins.
 */

import jwt from 'jsonwebtoken'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production.')
}
const SECRET = process.env.JWT_SECRET ?? 'localsupply-dev-secret'
const DELIVERY_SECRET = process.env.DELIVERY_JWT_SECRET ?? 'localsupply-delivery-dev-secret'

/**
 * Signs a JWT for an authenticated buyer, valid for 30 days.
 * @param {string} userId - The unique identifier of the buyer.
 * @returns {string} A signed JWT string containing the buyer's userId and type claim.
 */
export function signBuyerToken(userId: string): string {
  return jwt.sign({ userId, type: 'buyer' }, SECRET, { expiresIn: '30d' })
}

/**
 * Verifies a buyer JWT and returns its payload if valid.
 * @param {string} token - The JWT string to verify.
 * @returns {{ userId: string } | null} The decoded payload containing userId, or null if the token is invalid or not a buyer token.
 */
export function verifyBuyerToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { userId: string; type: string }
    if (payload.type !== 'buyer') return null
    return { userId: payload.userId }
  } catch {
    return null
  }
}

/**
 * Signs a JWT for an authenticated supplier, valid for 30 days.
 * @param {string} supplierId - The unique identifier of the supplier.
 * @returns {string} A signed JWT string containing the supplier's supplierId and type claim.
 */
export function signSupplierToken(supplierId: string): string {
  return jwt.sign({ supplierId, type: 'supplier' }, SECRET, { expiresIn: '30d' })
}

/**
 * Verifies a supplier JWT and returns its payload if valid.
 * @param {string} token - The JWT string to verify.
 * @returns {{ supplierId: string } | null} The decoded payload containing supplierId, or null if the token is invalid or not a supplier token.
 */
export function verifySupplierToken(token: string): { supplierId: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { supplierId: string; type: string }
    if (payload.type !== 'supplier') return null
    return { supplierId: payload.supplierId }
  } catch {
    return null
  }
}

/**
 * Signs a JWT for an authenticated admin, valid for 8 hours.
 * @param {string} adminId - The unique identifier of the admin.
 * @returns {string} A signed JWT string containing the admin's adminId and type claim.
 */
export function signAdminToken(adminId: string): string {
  return jwt.sign({ adminId, type: 'admin' }, SECRET, { expiresIn: '8h' })
}

/**
 * Verifies an admin JWT and returns its payload if valid.
 * @param {string} token - The JWT string to verify.
 * @returns {{ adminId: string } | null} The decoded payload containing adminId, or null if the token is invalid or not an admin token.
 */
export function verifyAdminToken(token: string): { adminId: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { adminId: string; type: string }
    if (payload.type !== 'admin') return null
    return { adminId: payload.adminId }
  } catch {
    return null
  }
}

/**
 * Signs a JWT for an authenticated delivery person, valid for 30 days.
 * @param {string} deliveryPersonId - The unique identifier of the delivery person.
 * @returns {string} A signed JWT string containing the deliveryPersonId and type claim.
 */
export function signDeliveryToken(deliveryPersonId: string): string {
  return jwt.sign({ deliveryPersonId, type: 'delivery' }, DELIVERY_SECRET, { expiresIn: '30d' })
}

/**
 * Verifies a delivery person JWT and returns its payload if valid.
 * @param {string} token - The JWT string to verify.
 * @returns {{ deliveryPersonId: string } | null} The decoded payload, or null if invalid or not a delivery token.
 */
export function verifyDeliveryToken(token: string): { deliveryPersonId: string } | null {
  try {
    const payload = jwt.verify(token, DELIVERY_SECRET) as { deliveryPersonId: string; type: string }
    if (payload.type !== 'delivery') return null
    return { deliveryPersonId: payload.deliveryPersonId }
  } catch {
    return null
  }
}
