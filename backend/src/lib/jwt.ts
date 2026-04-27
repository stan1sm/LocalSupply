import jwt from 'jsonwebtoken'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production.')
}

const SECRET = process.env.JWT_SECRET ?? 'localsupply-dev-secret'

export function signBuyerToken(userId: string): string {
  return jwt.sign({ userId, type: 'buyer' }, SECRET, { expiresIn: '30d' })
}

export function verifyBuyerToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { userId: string; type: string }
    if (payload.type !== 'buyer') return null
    return { userId: payload.userId }
  } catch {
    return null
  }
}

export function signSupplierToken(supplierId: string): string {
  return jwt.sign({ supplierId, type: 'supplier' }, SECRET, { expiresIn: '30d' })
}

export function verifySupplierToken(token: string): { supplierId: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { supplierId: string; type: string }
    if (payload.type !== 'supplier') return null
    return { supplierId: payload.supplierId }
  } catch {
    return null
  }
}

export function signAdminToken(adminId: string): string {
  return jwt.sign({ adminId, type: 'admin' }, SECRET, { expiresIn: '8h' })
}

export function verifyAdminToken(token: string): { adminId: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { adminId: string; type: string }
    if (payload.type !== 'admin') return null
    return { adminId: payload.adminId }
  } catch {
    return null
  }
}
