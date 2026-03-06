const DISALLOWED_TEXT_REGEX = /[<>`]/g
const PASSWORD_LOWERCASE_REGEX = /[a-z]/
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/
const PASSWORD_NUMBER_REGEX = /[0-9]/
const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()[\]{}\-_=+\\|;:'",<.>/?`~]/
export const PASSWORD_MIN_LENGTH = 8

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const HUMAN_NAME_REGEX = /^[A-Za-z][A-Za-z '-]{1,49}$/
export const BUSINESS_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9 '&().,-]{1,79}$/
// Norwegian phone numbers: we canonicalize to +47XXXXXXXX before validation
export const PHONE_REGEX = /^\+47[0-9]{8}$/
export const ADDRESS_REGEX = /^[A-Za-z0-9][A-Za-z0-9 '#&().,\-/]{5,120}$/

function removeControlChars(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}

export function sanitizeTextInput(value: string, maxLength: number) {
  return removeControlChars(value)
    .replace(DISALLOWED_TEXT_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength)
}

export function sanitizeEmailInput(value: string) {
  return removeControlChars(value).replace(/\s+/g, '').slice(0, 254)
}

export function sanitizePhoneInput(value: string) {
  return removeControlChars(value).replace(/[^0-9()+\-.\s]/g, '').slice(0, 20)
}

export type PasswordRequirementStatus = {
  hasMinLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecial: boolean
}

export function getPasswordRequirementStatus(password: string): PasswordRequirementStatus {
  return {
    hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: PASSWORD_UPPERCASE_REGEX.test(password),
    hasLowercase: PASSWORD_LOWERCASE_REGEX.test(password),
    hasNumber: PASSWORD_NUMBER_REGEX.test(password),
    hasSpecial: PASSWORD_SPECIAL_REGEX.test(password),
  }
}

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
