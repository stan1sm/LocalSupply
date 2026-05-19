/**
 * @module requireSupplierAuth
 * Express middleware that guards routes behind supplier JWT authentication.
 */
import { type NextFunction, type Request, type Response } from 'express'
import { verifySupplierToken } from '../lib/jwt.js'

/**
 * Verifies the Bearer token in the Authorization header as a supplier JWT and
 * populates `res.locals.supplierId` for downstream handlers.
 *
 * @param req - Incoming Express request; must carry an `Authorization: Bearer <token>` header.
 * @param res - Express response used to send 401 on failure; sets `res.locals.supplierId` (string) on success.
 * @param next - Express next function called when authentication succeeds.
 * @returns void — responds with 401 JSON on missing or invalid token, otherwise calls `next()`.
 */
export function requireSupplierAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  const payload = verifySupplierToken(auth.slice(7))
  if (!payload) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  res.locals.supplierId = payload.supplierId
  next()
}
