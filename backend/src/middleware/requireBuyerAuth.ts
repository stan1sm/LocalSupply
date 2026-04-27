import type { NextFunction, Request, Response } from 'express'
import { verifyBuyerToken } from '../lib/jwt.js'

/**
 * Express middleware that validates the `Authorization: Bearer <token>` header for buyers.
 * Sets `res.locals.buyerId` on success; responds 401 otherwise.
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
