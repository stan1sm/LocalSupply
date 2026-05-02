/**
 * @module verification
 * Generates, hashes, validates, and safely compares tokens used for email verification and password reset flows.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_REGEX = /^[a-f0-9]{64}$/i

/**
 * A plaintext token paired with its SHA-256 hex digest for safe database storage.
 * @typedef {Object} GeneratedToken
 * @property {string} token - The raw hex token to be sent to the user (e.g. via email).
 * @property {string} tokenHash - The SHA-256 hex hash of the token, safe to store in the database.
 */
export type GeneratedToken = {
  token: string
  tokenHash: string
}

/**
 * Computes the SHA-256 hex hash of an email verification token.
 * @param {string} token - The raw hex token to hash.
 * @returns {string} The SHA-256 hex digest of the token.
 */
export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Generates a cryptographically random email verification token and its SHA-256 hash.
 * @returns {GeneratedToken} An object containing the raw token and its hash.
 */
export function generateEmailVerificationToken(): GeneratedToken {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashEmailVerificationToken(token) }
}

/**
 * Checks whether a string matches the expected 64-character lowercase hex format of an email verification token.
 * @param {string} token - The token string to validate.
 * @returns {boolean} True if the token matches the expected hex format, false otherwise.
 */
export function isValidEmailVerificationToken(token: string) {
  return TOKEN_REGEX.test(token)
}

/**
 * Generates a cryptographically random password reset token and its SHA-256 hash.
 * @returns {GeneratedToken} An object containing the raw token and its hash.
 */
export function generatePasswordResetToken(): GeneratedToken {
  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

/**
 * Computes the SHA-256 hex hash of a password reset token.
 * @param {string} token - The raw hex token to hash.
 * @returns {string} The SHA-256 hex digest of the token.
 */
export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Checks whether a string matches the expected 64-character lowercase hex format of a password reset token.
 * @param {string} token - The token string to validate.
 * @returns {boolean} True if the token matches the expected hex format, false otherwise.
 */
export function isValidPasswordResetToken(token: string) {
  return TOKEN_REGEX.test(token)
}

/**
 * Compares two hex-encoded token hashes in constant time to prevent timing attacks.
 * @param {string} a - The first hex hash string to compare.
 * @param {string} b - The second hex hash string to compare.
 * @returns {boolean} True if both hashes are identical, false if they differ or if either is not valid hex.
 */
export function safeCompareTokenHashes(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}
