import nodemailer from 'nodemailer'

type VerificationEmailInput = {
  email: string
  firstName: string
  verificationToken: string
  verificationBaseUrl?: string
}

export type VerificationDeliveryResult =
  | { mode: 'email'; verificationUrl?: undefined }
  | { mode: 'fallback'; verificationUrl: string }

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

export function buildVerificationUrlFromBaseUrl(token: string, baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const url = new URL('/api/auth/verify-email', normalizedBaseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function allowVerificationFallback() {
  return (process.env.EMAIL_VERIFICATION_ALLOW_FALLBACK ?? 'false').toLowerCase() === 'true'
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

type OrderNotificationInput = {
  supplierEmail: string
  supplierName: string
  orderId: string
  buyerName: string
  deliveryAddress: string
  items: { name: string; quantity: number; unitPrice: number }[]
  subtotal: number
  deliveryFee: number
  total: number
  notes: string | null
}

export async function sendSupplierOrderEmail({
  supplierEmail,
  supplierName,
  orderId,
  buyerName,
  deliveryAddress,
  items,
  subtotal,
  deliveryFee,
  total,
  notes,
}: OrderNotificationInput): Promise<void> {
  const transport = getMailTransport()
  if (!transport) return // silently skip if SMTP not configured

  const dashboardUrl = new URL('/supplier/orders', getFrontendBaseUrl()).toString()
  const shortId = orderId.slice(-6).toUpperCase()

  const itemLines = items.map((i) => `  • ${i.name} ×${i.quantity} — ${(i.unitPrice * i.quantity).toFixed(2)} kr`).join('\n')
  const itemHtml = items
    .map((i) => `<tr><td>${i.name}</td><td>×${i.quantity}</td><td>${(i.unitPrice * i.quantity).toFixed(2)} kr</td></tr>`)
    .join('')

  const textBody = [
    `Hi ${supplierName},`,
    '',
    `You have a new order (#${shortId}) from ${buyerName}.`,
    '',
    'Items:',
    itemLines,
    '',
    `Subtotal: ${subtotal.toFixed(2)} kr`,
    `Delivery fee: ${deliveryFee.toFixed(2)} kr`,
    `Total: ${total.toFixed(2)} kr`,
    '',
    `Delivery to: ${deliveryAddress}`,
    ...(notes ? [`Notes: ${notes}`] : []),
    '',
    `View in dashboard: ${dashboardUrl}`,
  ].join('\n')

  const htmlBody = [
    `<p>Hi ${supplierName},</p>`,
    `<p>You have a new order <strong>#${shortId}</strong> from <strong>${buyerName}</strong>.</p>`,
    '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">',
    '<thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead>',
    `<tbody>${itemHtml}</tbody>`,
    '</table>',
    `<p>Subtotal: ${subtotal.toFixed(2)} kr<br>Delivery: ${deliveryFee.toFixed(2)} kr<br><strong>Total: ${total.toFixed(2)} kr</strong></p>`,
    `<p>Deliver to: ${deliveryAddress}</p>`,
    ...(notes ? [`<p>Notes: ${notes}</p>`] : []),
    `<p><a href="${dashboardUrl}">View order in your dashboard →</a></p>`,
  ].join('')

  try {
    await transport.sendMail({
      from: getMailFromAddress(),
      to: supplierEmail,
      subject: `New order #${shortId} — LocalSupply`,
      text: textBody,
      html: htmlBody,
    })
  } catch (error) {
    console.warn(`Failed to send order notification to ${supplierEmail}`, error)
  }
}

type BuyerOrderStatusInput = {
  buyerEmail: string
  buyerName: string
  orderId: string
  status: 'CONFIRMED' | 'CANCELLED'
  supplierName: string
  total: number
  paymentMethod?: string
}

export async function sendBuyerOrderStatusEmail({
  buyerEmail,
  buyerName,
  orderId,
  status,
  supplierName,
  total,
  paymentMethod,
}: BuyerOrderStatusInput): Promise<void> {
  const transport = getMailTransport()
  if (!transport) return

  const shortId = orderId.slice(-6).toUpperCase()
  const ordersUrl = new URL('/orders', getFrontendBaseUrl()).toString()
  const statusLabel = status === 'CONFIRMED' ? 'confirmed' : 'cancelled'

  function paymentMethodLine(): string {
    if (status !== 'CONFIRMED') return ''
    if (paymentMethod === 'invoice') return 'Payment terms: 30 days from order date'
    if (paymentMethod === 'vipps') return 'Payment via Vipps — you will receive a payment request on your phone'
    if (paymentMethod === 'card') return 'Payment by card'
    return ''
  }

  const paymentLine = paymentMethodLine()

  const textBody = [
    `Hi ${buyerName},`,
    '',
    `Your order #${shortId} from ${supplierName} has been ${statusLabel}.`,
    '',
    status === 'CONFIRMED'
      ? 'Your order is being prepared and will be delivered by Wolt.'
      : 'If you have questions, please contact the supplier directly.',
    ...(paymentLine ? [paymentLine] : []),
    '',
    `Total: ${total.toFixed(2)} kr`,
    '',
    `View your orders: ${ordersUrl}`,
  ].join('\n')

  const htmlBody = [
    `<p>Hi ${buyerName},</p>`,
    `<p>Your order <strong>#${shortId}</strong> from <strong>${supplierName}</strong> has been <strong>${statusLabel}</strong>.</p>`,
    status === 'CONFIRMED'
      ? '<p>Your order is being prepared and will be delivered by Wolt.</p>'
      : '<p>If you have questions, please contact the supplier directly.</p>',
    paymentLine ? `<p>${paymentLine}</p>` : '',
    `<p>Total: ${total.toFixed(2)} kr</p>`,
    `<p><a href="${ordersUrl}">View your orders →</a></p>`,
  ].join('')

  try {
    await transport.sendMail({
      from: getMailFromAddress(),
      to: buyerEmail,
      subject: `Order #${shortId} ${statusLabel} — LocalSupply`,
      text: textBody,
      html: htmlBody,
    })
  } catch (error) {
    console.warn(`Failed to send order status email to ${buyerEmail}`, error)
  }
}

export async function sendPasswordResetEmail({
  email,
  firstName,
  resetToken,
}: {
  email: string
  firstName: string
  resetToken: string
}): Promise<void> {
  const transport = getMailTransport()
  if (!transport) return

  const resetUrl = new URL('/reset-password', getFrontendBaseUrl())
  resetUrl.searchParams.set('token', resetToken)

  try {
    await transport.sendMail({
      from: getMailFromAddress(),
      to: email,
      subject: 'Reset your LocalSupply password',
      text: [
        `Hi ${firstName},`,
        '',
        'We received a request to reset your password.',
        'Click the link below to set a new password:',
        resetUrl.toString(),
        '',
        'This link expires in 1 hour.',
        'If you did not request a password reset, you can ignore this email.',
      ].join('\n'),
      html: [
        `<p>Hi ${firstName},</p>`,
        '<p>We received a request to reset your password.</p>',
        `<p><a href="${resetUrl.toString()}">Reset your password</a></p>`,
        '<p>This link expires in 1 hour.</p>',
        '<p>If you did not request a password reset, you can ignore this email.</p>',
      ].join(''),
    })
  } catch (error) {
    console.warn(`Failed to send password reset email to ${email}`, error)
  }
}

export async function sendUserVerificationEmail({
  email,
  firstName,
  verificationToken,
  verificationBaseUrl,
}: VerificationEmailInput): Promise<VerificationDeliveryResult> {
  const transport = getMailTransport()
  const verificationUrl = verificationBaseUrl
    ? buildVerificationUrlFromBaseUrl(verificationToken, verificationBaseUrl)
    : buildVerificationUrl(verificationToken)

  if (!transport) {
    if (allowVerificationFallback()) {
      return {
        mode: 'fallback',
        verificationUrl,
      }
    }

    throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured to send verification emails.')
  }

  try {
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

    return { mode: 'email' }
  } catch (error) {
    if (allowVerificationFallback()) {
      console.warn('Verification email delivery failed, using fallback link instead.', error)
      return {
        mode: 'fallback',
        verificationUrl,
      }
    }

    throw error
  }
}
