/**
 * @module requireBuyerAuth
 * Express middleware that guards routes behind buyer JWT authentication.
 */
import type { NextFunction, Request, Response } from 'express'
import { verifyBuyerToken } from '../lib/jwt.js'

/**
 * Verifies the Bearer token in the Authorization header as a buyer JWT and
 * populates `res.locals.buyerId` for downstream handlers.
 *
 * @param req - Incoming Express request; must carry an `Authorization: Bearer <token>` header.
 * @param res - Express response used to send 401 on failure; sets `res.locals.buyerId` (string) on success.
 * @param next - Express next function called when authentication succeeds.
 * @returns void — responds with 401 JSON on missing or invalid token, otherwise calls `next()`.
 */
export function requireBuyerAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  const payload = verifyBuyerToken(auth.slice(7))
  if (!payload) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  res.locals.buyerId = payload.userId
  next()
}
