import jwt from 'jsonwebtoken'

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
