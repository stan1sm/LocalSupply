import type { NextFunction, Request, Response } from 'express'
import { verifyAdminToken } from '../lib/jwt.js'

/**
 * Express middleware that validates the `Authorization: Bearer <token>` header for admins.
 * Sets `res.locals.adminId` on success; responds 401 otherwise.
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
