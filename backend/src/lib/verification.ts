import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_REGEX = /^[a-f0-9]{64}$/i

export type GeneratedToken = {
  token: string
  tokenHash: string
}

export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function generateEmailVerificationToken(): GeneratedToken {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashEmailVerificationToken(token) }
}

export function isValidEmailVerificationToken(token: string) {
  return TOKEN_REGEX.test(token)
}

export function generatePasswordResetToken(): GeneratedToken {
  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function isValidPasswordResetToken(token: string) {
  return TOKEN_REGEX.test(token)
}

export function safeCompareTokenHashes(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}
