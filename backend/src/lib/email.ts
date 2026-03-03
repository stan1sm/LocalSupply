import nodemailer from 'nodemailer'

type VerificationEmailInput = {
  email: string
  firstName: string
  verificationToken: string
  verificationBaseUrl?: string
}

function isTruthy(value: string | undefined) {
  return Boolean(value && value.trim().length > 0)
}

function getBackendBaseUrl() {
  return (process.env.BACKEND_BASE_URL ?? 'http://localhost:3001').trim().replace(/\/+$/, '')
}

export function getFrontendBaseUrl() {
  return (process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '')
}

function buildVerificationUrl(token: string) {
  const url = new URL('/api/auth/verify-email', getBackendBaseUrl())
  url.searchParams.set('token', token)
  return url.toString()
}

function buildVerificationUrlFromBaseUrl(token: string, baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const url = new URL('/api/auth/verify-email', normalizedBaseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

export function buildEmailVerifiedRedirectUrl(status: 'success' | 'invalid' = 'success') {
  const url = new URL('/email-verified', getFrontendBaseUrl())
  if (status !== 'success') {
    url.searchParams.set('status', status)
  }
  return url.toString()
}

function getMailTransport() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS ?? ''
  const port = Number(process.env.SMTP_PORT ?? '587')
  const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true'

  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  })
}

function getMailFromAddress() {
  const from = process.env.SMTP_FROM?.trim()
  if (isTruthy(from)) {
    return from as string
  }

  const user = process.env.SMTP_USER?.trim()
  if (isTruthy(user)) {
    return user as string
  }

  throw new Error('SMTP_FROM or SMTP_USER must be configured to send verification emails.')
}

export async function sendUserVerificationEmail({ email, firstName, verificationToken, verificationBaseUrl }: VerificationEmailInput) {
  const transport = getMailTransport()
  const verificationUrl = verificationBaseUrl
    ? buildVerificationUrlFromBaseUrl(verificationToken, verificationBaseUrl)
    : buildVerificationUrl(verificationToken)

  if (!transport) {
    throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured to send verification emails.')
  }

  await transport.sendMail({
    from: getMailFromAddress(),
    to: email,
    subject: 'Verify your LocalSupply email',
    text: [
      `Hi ${firstName},`,
      '',
      'Thanks for registering with LocalSupply.',
      'Verify your email by opening this link:',
      verificationUrl,
      '',
      'This link expires in 24 hours.',
    ].join('\n'),
    html: [
      `<p>Hi ${firstName},</p>`,
      '<p>Thanks for registering with LocalSupply.</p>',
      `<p><a href="${verificationUrl}">Verify your email address</a></p>`,
      '<p>This link expires in 24 hours.</p>',
    ].join(''),
  })
}
