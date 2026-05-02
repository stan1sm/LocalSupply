/**
 * @module validation
 * Provides input validation functions and typed input/error shapes for buyer and supplier auth payloads.
 */

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

/**
 * Sanitised field values extracted from a buyer registration request body.
 * @property {string} firstName - The buyer's first name (trimmed).
 * @property {string} lastName - The buyer's last name (trimmed).
 * @property {string} email - The buyer's email address (trimmed, lower-cased).
 * @property {string} password - The chosen password (capped at 128 characters).
 * @property {string} confirmPassword - The password confirmation value (capped at 128 characters).
 * @property {boolean} termsAccepted - Whether the buyer explicitly accepted the terms of service.
 */
export type UserRegistrationInput = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
}

/**
 * Field-level validation error messages for a buyer registration form.
 * Each key is optional and present only when the corresponding field failed validation.
 * @type {Partial<Record<keyof UserRegistrationInput, string>>}
 */
export type UserRegistrationErrors = Partial<Record<keyof UserRegistrationInput, string>>

/**
 * Sanitised field values extracted from a buyer login request body.
 * @property {string} email - The buyer's email address (trimmed, lower-cased).
 * @property {string} password - The supplied password (capped at 128 characters).
 */
export type UserLoginInput = {
  email: string
  password: string
}

/**
 * Field-level validation error messages for a buyer login form.
 * Each key is optional and present only when the corresponding field failed validation.
 * @type {Partial<Record<keyof UserLoginInput, string>>}
 */
export type UserLoginErrors = Partial<Record<keyof UserLoginInput, string>>

/**
 * Sanitised field values extracted from a single-email request body (e.g. password-reset or re-send verification).
 * @property {string} email - The email address (trimmed, lower-cased).
 */
export type UserEmailInput = {
  email: string
}

/**
 * Field-level validation error messages for a single-email form.
 * Each key is optional and present only when the corresponding field failed validation.
 * @type {Partial<Record<keyof UserEmailInput, string>>}
 */
export type UserEmailErrors = Partial<Record<keyof UserEmailInput, string>>

/**
 * Sanitised field values extracted from a supplier registration request body.
 * @property {string} businessName - The supplier's trading or legal business name (trimmed).
 * @property {string} contactName - The primary contact person's full name (trimmed).
 * @property {string} phoneNumber - Norwegian phone number in canonical form `+47XXXXXXXX` (trimmed).
 * @property {string} email - The supplier's business email address (trimmed, lower-cased).
 * @property {string} password - The chosen password (capped at 128 characters).
 * @property {string} confirmPassword - The password confirmation value (capped at 128 characters).
 * @property {string} address - The supplier's physical address (trimmed, 5–200 characters).
 */
export type SupplierRegistrationInput = {
  businessName: string
  contactName: string
  phoneNumber: string
  email: string
  password: string
  confirmPassword: string
  address: string
}

/**
 * Field-level validation error messages for a supplier registration form.
 * Each key is optional and present only when the corresponding field failed validation.
 * @type {Partial<Record<keyof SupplierRegistrationInput, string>>}
 */
export type SupplierRegistrationErrors = Partial<Record<keyof SupplierRegistrationInput, string>>

/**
 * Sanitised field values extracted from a supplier login request body.
 * @property {string} email - The supplier's business email address (trimmed, lower-cased).
 * @property {string} password - The supplied password (capped at 128 characters).
 */
export type SupplierLoginInput = {
  email: string
  password: string
}

/**
 * Field-level validation error messages for a supplier login form.
 * Each key is optional and present only when the corresponding field failed validation.
 * @type {Partial<Record<keyof SupplierLoginInput, string>>}
 */
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

/**
 * Validates and sanitises an unknown request body as a buyer registration payload.
 * @param {unknown} payload - The raw request body to validate.
 * @returns {ValidationResult} `{ ok: true, data }` with the sanitised input on success, or `{ ok: false, errors }` with per-field messages on failure.
 */
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

  const passwordError = passwordPolicyError(data.password)
  if (passwordError) {
    errors.password = passwordError
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

/**
 * Validates and sanitises an unknown request body as a buyer login payload.
 * @param {unknown} payload - The raw request body to validate.
 * @returns {LoginValidationResult} `{ ok: true, data }` with the sanitised input on success, or `{ ok: false, errors }` with per-field messages on failure.
 */
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

/**
 * Validates and sanitises an unknown request body containing only an email address field.
 * @param {unknown} payload - The raw request body to validate.
 * @returns {EmailValidationResult} `{ ok: true, data }` with the sanitised input on success, or `{ ok: false, errors }` with a per-field message on failure.
 */
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

/**
 * Validates and sanitises an unknown request body as a supplier registration payload.
 * @param {unknown} payload - The raw request body to validate.
 * @returns {SupplierRegistrationValidationResult} `{ ok: true, data }` with the sanitised input on success, or `{ ok: false, errors }` with per-field messages on failure.
 */
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

/**
 * Validates and sanitises an unknown request body as a supplier login payload.
 * @param {unknown} payload - The raw request body to validate.
 * @returns {SupplierLoginValidationResult} `{ ok: true, data }` with the sanitised input on success, or `{ ok: false, errors }` with per-field messages on failure.
 */
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
