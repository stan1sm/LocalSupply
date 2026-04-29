import { describe, expect, it } from 'vitest'
import {
  validateSupplierLoginPayload,
  validateSupplierRegistrationPayload,
  validateUserEmailPayload,
  validateUserLoginPayload,
  validateUserRegistrationPayload,
} from '../src/lib/validation.js'

const VALID_SUPPLIER_REG = {
  businessName: 'Green Farm AS',
  contactName: 'Ola Nordmann',
  phoneNumber: '+4740012345',
  email: 'green@farm.no',
  password: 'Abcd!123',
  confirmPassword: 'Abcd!123',
  address: 'Storgata 1, 0155 Oslo',
}

describe('validateSupplierRegistrationPayload', () => {
  it('accepts a fully valid payload', () => {
    const result = validateSupplierRegistrationPayload(VALID_SUPPLIER_REG)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.email).toBe('green@farm.no')
      expect(result.data.businessName).toBe('Green Farm AS')
    }
  })

  it('rejects a missing / empty businessName', () => {
    const result = validateSupplierRegistrationPayload({ ...VALID_SUPPLIER_REG, businessName: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.businessName).toBeDefined()
  })

  it('rejects a phone number not in +47XXXXXXXX format', () => {
    const result = validateSupplierRegistrationPayload({ ...VALID_SUPPLIER_REG, phoneNumber: '40012345' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.phoneNumber).toBe('Enter a valid phone number.')
  })

  it('rejects mismatched confirmPassword', () => {
    const result = validateSupplierRegistrationPayload({ ...VALID_SUPPLIER_REG, confirmPassword: 'Different!9' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.confirmPassword).toBe("Passwords don't match.")
  })

  it('rejects an address shorter than 5 characters', () => {
    const result = validateSupplierRegistrationPayload({ ...VALID_SUPPLIER_REG, address: 'A' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.address).toBeDefined()
  })

  it('rejects a password without a special character', () => {
    const result = validateSupplierRegistrationPayload({
      ...VALID_SUPPLIER_REG,
      password: 'Abcd1234',
      confirmPassword: 'Abcd1234',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.password).toBe('Password must include a special character.')
  })

  it('rejects an invalid email address', () => {
    const result = validateSupplierRegistrationPayload({ ...VALID_SUPPLIER_REG, email: 'not-an-email' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.email).toBeDefined()
  })

  it('rejects an invalid contactName (single character)', () => {
    const result = validateSupplierRegistrationPayload({ ...VALID_SUPPLIER_REG, contactName: 'O' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.contactName).toBeDefined()
  })
})

describe('validateSupplierLoginPayload', () => {
  it('accepts valid credentials', () => {
    const result = validateSupplierLoginPayload({ email: 'green@farm.no', password: 'Abcd!123' })
    expect(result.ok).toBe(true)
  })

  it('rejects an empty email', () => {
    const result = validateSupplierLoginPayload({ email: '', password: 'Abcd!123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.email).toBeDefined()
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = validateSupplierLoginPayload({ email: 'green@farm.no', password: 'short' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.password).toBeDefined()
  })
})

describe('validateUserRegistrationPayload', () => {
  const VALID = {
    firstName: 'Ava',
    lastName: 'Johnson',
    email: 'ava@example.com',
    password: 'Abcd!123',
    confirmPassword: 'Abcd!123',
    termsAccepted: true,
  }

  it('accepts a fully valid payload', () => {
    const result = validateUserRegistrationPayload(VALID)
    expect(result.ok).toBe(true)
  })

  it('rejects when terms are not accepted', () => {
    const result = validateUserRegistrationPayload({ ...VALID, termsAccepted: false })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.termsAccepted).toBeDefined()
  })

  it('silently truncates a password longer than 128 characters and accepts it', () => {
    const pw = 'Abcd!1' + 'a'.repeat(130)
    const result = validateUserRegistrationPayload({ ...VALID, password: pw, confirmPassword: pw })
    expect(result.ok).toBe(true)
  })

  it('rejects a password without a number', () => {
    const result = validateUserRegistrationPayload({
      ...VALID,
      password: 'Abcd!def',
      confirmPassword: 'Abcd!def',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.password).toBe('Password must include a number.')
  })

  it('rejects a password without a lowercase letter', () => {
    const result = validateUserRegistrationPayload({
      ...VALID,
      password: 'ABCD!123',
      confirmPassword: 'ABCD!123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.password).toBe('Password must include a lowercase letter.')
  })

  it('rejects mismatched passwords', () => {
    const result = validateUserRegistrationPayload({ ...VALID, confirmPassword: 'Different!9' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.confirmPassword).toBeDefined()
  })

  it('normalises email to lowercase', () => {
    const result = validateUserRegistrationPayload({ ...VALID, email: 'Ava@Example.COM' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.email).toBe('ava@example.com')
  })
})

describe('validateUserLoginPayload', () => {
  it('accepts valid credentials', () => {
    const result = validateUserLoginPayload({ email: 'ava@example.com', password: 'Abcd!123' })
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid email format', () => {
    const result = validateUserLoginPayload({ email: 'bad-email', password: 'Abcd!123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.email).toBe('Enter a valid email address.')
  })

  it('normalises email to lowercase', () => {
    const result = validateUserLoginPayload({ email: 'AVA@EXAMPLE.COM', password: 'Abcd!123' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.email).toBe('ava@example.com')
  })
})

describe('validateUserEmailPayload', () => {
  it('accepts a valid email', () => {
    const result = validateUserEmailPayload({ email: 'ava@example.com' })
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = validateUserEmailPayload({ email: 'not-an-email' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.email).toBeDefined()
  })

  it('handles a non-object payload gracefully', () => {
    const result = validateUserEmailPayload(null)
    expect(result.ok).toBe(false)
  })
})
