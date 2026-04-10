import type { NextFunction, Request, Response } from 'express'

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env['ADMIN_SECRET']
  if (!secret) {
    res.status(503).json({ error: 'Admin access not configured' })
    return
  }

  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  if (token !== secret) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  next()
}
