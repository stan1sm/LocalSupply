import { createHash, randomBytes } from 'node:crypto'

const EMAIL_VERIFICATION_TOKEN_REGEX = /^[a-f0-9]{64}$/i

export type GeneratedEmailVerificationToken = {
  token: string
  tokenHash: string
}

export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function generateEmailVerificationToken(): GeneratedEmailVerificationToken {
  const token = randomBytes(32).toString('hex')

  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
  }
}

export function isValidEmailVerificationToken(token: string) {
  return EMAIL_VERIFICATION_TOKEN_REGEX.test(token)
}
