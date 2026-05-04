import crypto from 'crypto'

const secret = process.env.WOLT_WEBHOOK_SECRET
if (!secret) throw new Error('WOLT_WEBHOOK_SECRET env var is required')
const _secret: string = secret

export function signPayload(body: string): string {
  return crypto.createHmac('sha256', _secret).update(body).digest('hex')
}

export function verifySignature(body: string, receivedSig: string): boolean {
  const expected = signPayload(body)
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(receivedSig, 'hex'))
  } catch {
    return false
  }
}
