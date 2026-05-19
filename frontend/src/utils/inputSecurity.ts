/**
 * @module inputSecurity
 * Sanitisation helpers and validation patterns for all user-supplied text inputs.
 */

const DISALLOWED_TEXT_REGEX = /[<>`]/g
const PASSWORD_LOWERCASE_REGEX = /[a-z]/
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/
const PASSWORD_NUMBER_REGEX = /[0-9]/
const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()[\]{}\-_=+\\|;:'",<.>/?`~]/

/**
 * Minimum number of characters required for a valid password.
 * @type {number}
 */
export const PASSWORD_MIN_LENGTH = 8

/**
 * Validates a basic email address: local-part, `@`, domain, and a TLD of at least two characters.
 * Does not allow whitespace anywhere in the address.
 * @type {RegExp}
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Validates a human personal name.
 * Must start with a letter; allows letters, spaces, apostrophes, and hyphens; 2–50 characters total.
 * @type {RegExp}
 */
export const HUMAN_NAME_REGEX = /^[A-Za-z][A-Za-z '-]{1,49}$/

/**
 * Validates a business or organisation name.
 * Must start with an alphanumeric character; allows letters, digits, spaces, and common punctuation; 2–80 characters total.
 * @type {RegExp}
 */
export const BUSINESS_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9 '&().,-]{1,79}$/

/**
 * Validates a Norwegian mobile/landline number in canonicalised form.
 * Expects the number to have been prefixed with `+47` before validation, followed by exactly 8 digits.
 * @type {RegExp}
 */
export const PHONE_REGEX = /^\+47[0-9]{8}$/

/**
 * Validates a physical address string.
 * Must start with an alphanumeric character; allows letters, digits, spaces, and address punctuation; 6–121 characters total.
 * @type {RegExp}
 */
export const ADDRESS_REGEX = /^[A-Za-z0-9][A-Za-z0-9 '#&().,\-/]{5,120}$/

function removeControlChars(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}

/**
 * Sanitises a general text input by stripping control characters, angle brackets,
 * backticks, and collapsing consecutive whitespace, then truncating to `maxLength`.
 *
 * @param {string} value - The raw string provided by the user.
 * @param {number} maxLength - Maximum number of characters allowed in the result.
 * @returns {string} The cleaned and truncated string.
 */
export function sanitizeTextInput(value: string, maxLength: number) {
  return removeControlChars(value)
    .replace(DISALLOWED_TEXT_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength)
}

/**
 * Sanitises an email address input by stripping control characters and all whitespace,
 * then truncating to the RFC 5321 maximum address length of 254 characters.
 *
 * @param {string} value - The raw email string provided by the user.
 * @returns {string} The cleaned and truncated email string.
 */
export function sanitizeEmailInput(value: string) {
  return removeControlChars(value).replace(/\s+/g, '').slice(0, 254)
}

/**
 * Sanitises a phone number input by stripping control characters and any character
 * that is not a digit, parenthesis, plus sign, hyphen, dot, or space, then
 * truncating to 20 characters.
 *
 * @param {string} value - The raw phone number string provided by the user.
 * @returns {string} The cleaned and truncated phone string.
 */
export function sanitizePhoneInput(value: string) {
  return removeControlChars(value).replace(/[^0-9()+\-.\s]/g, '').slice(0, 20)
}

/**
 * Describes which individual password policy requirements a candidate password satisfies.
 *
 * @property {boolean} hasMinLength - `true` when the password meets the minimum length (`PASSWORD_MIN_LENGTH`).
 * @property {boolean} hasUppercase - `true` when the password contains at least one uppercase letter.
 * @property {boolean} hasLowercase - `true` when the password contains at least one lowercase letter.
 * @property {boolean} hasNumber - `true` when the password contains at least one digit.
 * @property {boolean} hasSpecial - `true` when the password contains at least one special character.
 */
export type PasswordRequirementStatus = {
  hasMinLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecial: boolean
}

/**
 * Evaluates a password against each individual policy requirement and returns a
 * status object that can be used to render live requirement feedback in the UI.
 *
 * @param {string} password - The candidate password to evaluate.
 * @returns {PasswordRequirementStatus} An object with a boolean flag for each requirement.
 */
export function getPasswordRequirementStatus(password: string): PasswordRequirementStatus {
  return {
    hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: PASSWORD_UPPERCASE_REGEX.test(password),
    hasLowercase: PASSWORD_LOWERCASE_REGEX.test(password),
    hasNumber: PASSWORD_NUMBER_REGEX.test(password),
    hasSpecial: PASSWORD_SPECIAL_REGEX.test(password),
  }
}

/**
 * Validates a password against the full password policy and returns a
 * human-readable error message for the first failing rule, or `null` when
 * the password is fully compliant.
 *
 * Rules checked in order: minimum length, maximum length (128), uppercase,
 * lowercase, digit, and special character.
 *
 * @param {string} password - The candidate password to validate.
 * @returns {string | null} An error message string, or `null` if the password is valid.
 */
export function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > 128) return 'Password must be 128 characters or fewer.'
  const requirements = getPasswordRequirementStatus(password)
  if (!requirements.hasUppercase) return 'Password must include an uppercase letter.'
  if (!requirements.hasLowercase) return 'Password must include a lowercase letter.'
  if (!requirements.hasNumber) return 'Password must include a number.'
  if (!requirements.hasSpecial) return 'Password must include a special character.'
  return null
}
