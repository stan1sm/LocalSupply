/**
 * @module requireAdminAuth
 * Express middleware that guards routes behind admin JWT authentication.
 */
import type { NextFunction, Request, Response } from 'express'
import { verifyAdminToken } from '../lib/jwt.js'

/**
 * Verifies the Bearer token in the Authorization header as an admin JWT and
 * populates `res.locals.adminId` for downstream handlers.
 *
 * @param req - Incoming Express request; must carry an `Authorization: Bearer <token>` header.
 * @param res - Express response used to send 401 on failure; sets `res.locals.adminId` (string) on success.
 * @param next - Express next function called when authentication succeeds.
 * @returns void — responds with 401 JSON on missing or invalid token, otherwise calls `next()`.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  const payload = verifyAdminToken(auth.slice(7))
  if (!payload) {
    res.status(401).json({ message: 'Unauthorized.' })
    return
  }
  res.locals.adminId = payload.adminId
  next()
}
