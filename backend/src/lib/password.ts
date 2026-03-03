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

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const pepper = process.env.PASSWORD_PEPPER ?? ''
  const derivedKey = await scrypt(`${password}${pepper}`, salt)

  // Format: scrypt$<salt>$<hex-hash>
  return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

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
