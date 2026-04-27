import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const SCRYPT_KEY_LENGTH = 64
const HASH_HEX_REGEX = /^[a-f0-9]+$/i

/** Promisifies Node's callback-based `scrypt` with a 64-byte output key. */
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
 * Hashes a password with scrypt + random 16-byte salt (and optional `PASSWORD_PEPPER` env var).
 * Returns a string in the format `scrypt$<salt>$<hex-hash>`.
 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const pepper = process.env.PASSWORD_PEPPER ?? ''
  const derivedKey = await scrypt(`${password}${pepper}`, salt)

  // Format: scrypt$<salt>$<hex-hash>
  return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

/**
 * Verifies a plaintext password against a stored scrypt hash.
 * Uses `timingSafeEqual` to prevent timing attacks; returns false for any malformed hash.
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
