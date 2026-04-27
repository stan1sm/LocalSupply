import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_REGEX = /^[a-f0-9]{64}$/i

export type GeneratedToken = {
  token: string
  tokenHash: string
}

/** Returns the SHA-256 hex hash of a verification token, used for safe DB storage. */
export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** Generates a cryptographically random 32-byte email verification token and its SHA-256 hash. */
export function generateEmailVerificationToken(): GeneratedToken {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashEmailVerificationToken(token) }
}

/** Returns true if `token` matches the expected 64-char hex format (32 raw bytes). */
export function isValidEmailVerificationToken(token: string) {
  return TOKEN_REGEX.test(token)
}

/** Generates a cryptographically random 32-byte password reset token and its SHA-256 hash. */
export function generatePasswordResetToken(): GeneratedToken {
  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

/** Returns the SHA-256 hex hash of a password reset token. */
export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** Returns true if `token` is a valid 64-char hex string (same format as the email verification token). */
export function isValidPasswordResetToken(token: string) {
  return TOKEN_REGEX.test(token)
}

/** Compares two hex-encoded token hashes in constant time to prevent timing attacks. */
export function safeCompareTokenHashes(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}
