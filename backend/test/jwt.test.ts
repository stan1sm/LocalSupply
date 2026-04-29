import { describe, expect, it } from 'vitest'
import {
  signAdminToken,
  signBuyerToken,
  signSupplierToken,
  verifyAdminToken,
  verifyBuyerToken,
  verifySupplierToken,
} from '../src/lib/jwt.js'

describe('buyer tokens', () => {
  it('round-trips: sign then verify returns the userId', () => {
    const token = signBuyerToken('user_abc')
    expect(verifyBuyerToken(token)).toEqual({ userId: 'user_abc' })
  })

  it('returns null for a garbage string', () => {
    expect(verifyBuyerToken('not-a-jwt')).toBeNull()
  })

  it('returns null when a supplier token is presented', () => {
    const token = signSupplierToken('sup_123')
    expect(verifyBuyerToken(token)).toBeNull()
  })

  it('returns null when an admin token is presented', () => {
    const token = signAdminToken('admin_123')
    expect(verifyBuyerToken(token)).toBeNull()
  })
})

describe('supplier tokens', () => {
  it('round-trips: sign then verify returns the supplierId', () => {
    const token = signSupplierToken('sup_abc')
    expect(verifySupplierToken(token)).toEqual({ supplierId: 'sup_abc' })
  })

  it('returns null for a garbage string', () => {
    expect(verifySupplierToken('garbage')).toBeNull()
  })

  it('returns null when a buyer token is presented', () => {
    const token = signBuyerToken('user_123')
    expect(verifySupplierToken(token)).toBeNull()
  })

  it('returns null when an admin token is presented', () => {
    const token = signAdminToken('admin_123')
    expect(verifySupplierToken(token)).toBeNull()
  })
})

describe('admin tokens', () => {
  it('round-trips: sign then verify returns the adminId', () => {
    const token = signAdminToken('admin_abc')
    expect(verifyAdminToken(token)).toEqual({ adminId: 'admin_abc' })
  })

  it('returns null for a garbage string', () => {
    expect(verifyAdminToken('invalid')).toBeNull()
  })

  it('returns null when a supplier token is presented', () => {
    const token = signSupplierToken('sup_xyz')
    expect(verifyAdminToken(token)).toBeNull()
  })

  it('returns null when a buyer token is presented', () => {
    const token = signBuyerToken('user_xyz')
    expect(verifyAdminToken(token)).toBeNull()
  })
})
