import type { NextFunction, Request, Response } from 'express'
import { verifyAdminToken } from '../lib/jwt.js'

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
