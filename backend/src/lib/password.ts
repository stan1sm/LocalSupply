/**
 * @module password
 * Hashes and verifies user passwords using scrypt with a random salt and optional pepper.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const SCRYPT_KEY_LENGTH = 64
const HASH_HEX_REGEX = /^[a-f0-9]+$/i

function scrypt(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolve(Buffer.from(derivedKey))
    })
  })
}

/**
 * Hashes a plaintext password using scrypt with a random 16-byte salt and an optional pepper from the environment.
 * @param {string} password - The plaintext password to hash.
 * @returns {Promise<string>} A formatted string in the form `scrypt$<salt>$<hex-hash>`.
 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const pepper = process.env.PASSWORD_PEPPER ?? ''
  const derivedKey = await scrypt(`${password}${pepper}`, salt)

  // Format: scrypt$<salt>$<hex-hash>
  return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

/**
 * Verifies a plaintext password against a stored scrypt hash using a timing-safe comparison.
 * @param {string} password - The plaintext password to verify.
 * @param {string} passwordHash - The stored hash string in the form `scrypt$<salt>$<hex-hash>`.
 * @returns {Promise<boolean>} True if the password matches the stored hash, false otherwise.
 */
export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split('$')

  if (algorithm !== 'scrypt' || !salt || !storedHash || !HASH_HEX_REGEX.test(storedHash)) {
    return false
  }

  const pepper = process.env.PASSWORD_PEPPER ?? ''
  const derivedKey = await scrypt(`${password}${pepper}`, salt)
  const storedKey = Buffer.from(storedHash, 'hex')

  if (storedKey.length !== derivedKey.length) {
    return false
  }

  return timingSafeEqual(storedKey, derivedKey)
}
