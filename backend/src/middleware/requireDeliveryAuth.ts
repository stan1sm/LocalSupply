/**
 * @module requireDeliveryAuth
 * Express middleware that guards routes behind delivery person JWT authentication.
 */
import type { NextFunction, Request, Response } from 'express'
import { verifyDeliveryToken } from '../lib/jwt.js'

/**
 * Verifies the Bearer token in the Authorization header as a delivery person JWT and
 * populates `res.locals.deliveryPersonId` for downstream handlers.
 *
 * @param req - Incoming Express request; must carry an `Authorization: Bearer <token>` header.
 * @param res - Express response used to send 401 on failure; sets `res.locals.deliveryPersonId` on success.
 * @param next - Express next function called when authentication succeeds.
 * @returns void — responds with 401 JSON on missing or invalid token, otherwise calls `next()`.
 */
export function requireDeliveryAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  const payload = verifyDeliveryToken(auth.slice(7))
  if (!payload) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  res.locals.deliveryPersonId = payload.deliveryPersonId
  next()
}
