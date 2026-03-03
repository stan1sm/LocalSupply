import { createHash, randomBytes } from 'node:crypto'

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const EMAIL_VERIFICATION_TOKEN_REGEX = /^[a-f0-9]{64}$/i

export type GeneratedEmailVerificationToken = {
  token: string
  tokenHash: string
  expiresAt: Date
}

export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function generateEmailVerificationToken(): GeneratedEmailVerificationToken {
  const token = randomBytes(32).toString('hex')

  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  }
}

export function isValidEmailVerificationToken(token: string) {
  return EMAIL_VERIFICATION_TOKEN_REGEX.test(token)
}
