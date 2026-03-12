const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const HUMAN_NAME_REGEX = /^[A-Za-z][A-Za-z '-]{1,49}$/
const BUSINESS_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9 '&().,-]{1,79}$/
// Norwegian phone numbers, canonical form +47XXXXXXXX
const PHONE_REGEX = /^\+47[0-9]{8}$/
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/
const PASSWORD_LOWERCASE_REGEX = /[a-z]/
const PASSWORD_NUMBER_REGEX = /[0-9]/
const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()[\]{}\-_=+\\|;:'",<.>/?`~]/
const PASSWORD_MIN_LENGTH = 8

export type UserRegistrationInput = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
}

export type UserRegistrationErrors = Partial<Record<keyof UserRegistrationInput, string>>

export type UserLoginInput = {
  email: string
  password: string
}

export type UserLoginErrors = Partial<Record<keyof UserLoginInput, string>>

export type UserEmailInput = {
  email: string
}

export type UserEmailErrors = Partial<Record<keyof UserEmailInput, string>>

export type SupplierRegistrationInput = {
  businessName: string
  contactName: string
  phoneNumber: string
  email: string
  password: string
  confirmPassword: string
  address: string
}

export type SupplierRegistrationErrors = Partial<Record<keyof SupplierRegistrationInput, string>>

export type SupplierLoginInput = {
  email: string
  password: string
}

export type SupplierLoginErrors = Partial<Record<keyof SupplierLoginInput, string>>

type ValidationResult =
  | { ok: true; data: UserRegistrationInput }
  | { ok: false; errors: UserRegistrationErrors }

type LoginValidationResult =
  | { ok: true; data: UserLoginInput }
  | { ok: false; errors: UserLoginErrors }

type EmailValidationResult =
  | { ok: true; data: UserEmailInput }
  | { ok: false; errors: UserEmailErrors }

type SupplierRegistrationValidationResult =
  | { ok: true; data: SupplierRegistrationInput }
  | { ok: false; errors: SupplierRegistrationErrors }

type SupplierLoginValidationResult =
  | { ok: true; data: SupplierLoginInput }
  | { ok: false; errors: SupplierLoginErrors }

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getPasswordRequirementStatus(password: string) {
  return {
    hasUppercase: PASSWORD_UPPERCASE_REGEX.test(password),
    hasLowercase: PASSWORD_LOWERCASE_REGEX.test(password),
    hasNumber: PASSWORD_NUMBER_REGEX.test(password),
    hasSpecial: PASSWORD_SPECIAL_REGEX.test(password),
  }
}

function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > 128) return 'Password must be 128 characters or fewer.'
  const requirements = getPasswordRequirementStatus(password)

  if (!requirements.hasUppercase) return 'Password must include an uppercase letter.'
  if (!requirements.hasLowercase) return 'Password must include a lowercase letter.'
  if (!requirements.hasNumber) return 'Password must include a number.'
  if (!requirements.hasSpecial) return 'Password must include a special character.'
  return null
}

export function validateUserRegistrationPayload(payload: unknown): ValidationResult {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}

  const data: UserRegistrationInput = {
    firstName: asTrimmedString(body.firstName),
    lastName: asTrimmedString(body.lastName),
    email: asTrimmedString(body.email).toLowerCase(),
    password: typeof body.password === 'string' ? body.password.slice(0, 128) : '',
    confirmPassword: typeof body.confirmPassword === 'string' ? body.confirmPassword.slice(0, 128) : '',
    termsAccepted: body.termsAccepted === true,
  }

  const errors: UserRegistrationErrors = {}

  if (!HUMAN_NAME_REGEX.test(data.firstName)) {
    errors.firstName = 'Use 2-50 letters, spaces, apostrophes, or hyphens.'
  }

  if (!HUMAN_NAME_REGEX.test(data.lastName)) {
    errors.lastName = 'Use 2-50 letters, spaces, apostrophes, or hyphens.'
  }

  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (data.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }

  if (data.confirmPassword !== data.password) {
    errors.confirmPassword = "Passwords don't match."
  }

  if (!data.termsAccepted) {
    errors.termsAccepted = 'You must accept the terms to continue.'
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, data }
}

export function validateUserLoginPayload(payload: unknown): LoginValidationResult {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}

  const data: UserLoginInput = {
    email: asTrimmedString(body.email).toLowerCase(),
    password: typeof body.password === 'string' ? body.password.slice(0, 128) : '',
  }

  const errors: UserLoginErrors = {}

  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = 'Enter a valid email address.'
  }

  const passwordError = passwordPolicyError(data.password)
  if (passwordError) {
    errors.password = passwordError
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, data }
}

export function validateUserEmailPayload(payload: unknown): EmailValidationResult {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}

  const data: UserEmailInput = {
    email: asTrimmedString(body.email).toLowerCase(),
  }

  const errors: UserEmailErrors = {}

  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, data }
}

export function validateSupplierRegistrationPayload(payload: unknown): SupplierRegistrationValidationResult {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}

  const data: SupplierRegistrationInput = {
    businessName: asTrimmedString(body.businessName),
    contactName: asTrimmedString(body.contactName),
    phoneNumber: asTrimmedString(body.phoneNumber),
    email: asTrimmedString(body.email).toLowerCase(),
    password: typeof body.password === 'string' ? body.password.slice(0, 128) : '',
    confirmPassword: typeof body.confirmPassword === 'string' ? body.confirmPassword.slice(0, 128) : '',
    address: asTrimmedString(body.address),
  }

  const errors: SupplierRegistrationErrors = {}

  if (!BUSINESS_NAME_REGEX.test(data.businessName)) {
    errors.businessName = 'Use 2-80 valid business name characters.'
  }

  if (!HUMAN_NAME_REGEX.test(data.contactName)) {
    errors.contactName = 'Use 2-50 letters, spaces, apostrophes, or hyphens.'
  }

  if (!PHONE_REGEX.test(data.phoneNumber)) {
    errors.phoneNumber = 'Enter a valid phone number.'
  }

  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = 'Enter a valid business email address.'
  }

  const passwordError = passwordPolicyError(data.password)
  if (passwordError) {
    errors.password = passwordError
  }

  if (data.confirmPassword !== data.password) {
    errors.confirmPassword = "Passwords don't match."
  }

  if (data.address.length < 5 || data.address.length > 200) {
    errors.address = 'Use a full address (5-200 characters).'
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, data }
}

export function validateSupplierLoginPayload(payload: unknown): SupplierLoginValidationResult {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}

  const data: SupplierLoginInput = {
    email: asTrimmedString(body.email).toLowerCase(),
    password: typeof body.password === 'string' ? body.password.slice(0, 128) : '',
  }

  const errors: SupplierLoginErrors = {}

  if (!EMAIL_REGEX.test(data.email)) {
    errors.email = 'Enter a valid business email address.'
  }

  const passwordError = passwordPolicyError(data.password)
  if (passwordError) {
    errors.password = passwordError
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, data }
}
