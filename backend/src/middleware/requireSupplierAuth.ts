import { type NextFunction, type Request, type Response } from 'express'
import { verifySupplierToken } from '../lib/jwt.js'

/**
 * Express middleware that validates the `Authorization: Bearer <token>` header for suppliers.
 * Sets `res.locals.supplierId` on success; responds 401 otherwise.
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
