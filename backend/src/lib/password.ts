import { randomBytes, scrypt as scryptCallback } from 'node:crypto'

const SCRYPT_KEY_LENGTH = 64

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
