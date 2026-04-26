import { Resend } from 'resend'

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

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!isTruthy(apiKey)) return null
  return new Resend(apiKey)
}

function getFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim()
  if (isTruthy(from)) return from as string
  throw new Error('EMAIL_FROM must be configured to send emails.')
}

type SendParams = {
  to: string
  subject: string
  text: string
  html: string
}

async function send(params: SendParams): Promise<void> {
  const resend = getResendClient()
  if (!resend) return
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  })
  if (error) throw error
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
  const dashboardUrl = new URL('/supplier/orders', getFrontendBaseUrl()).toString()
  const shortId = orderId.slice(-6).toUpperCase()

  const itemLines = items.map((i) => `  • ${i.name} ×${i.quantity} — ${(i.unitPrice * i.quantity).toFixed(2)} kr`).join('\n')
  const itemHtml = items
    .map((i) => `<tr><td>${i.name}</td><td>×${i.quantity}</td><td>${(i.unitPrice * i.quantity).toFixed(2)} kr</td></tr>`)
    .join('')

  try {
    await send({
      to: supplierEmail,
      subject: `New order #${shortId} — LocalSupply`,
      text: [
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
      ].join('\n'),
      html: [
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
      ].join(''),
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

  try {
    await send({
      to: buyerEmail,
      subject: `Order #${shortId} ${statusLabel} — LocalSupply`,
      text: [
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
      ].join('\n'),
      html: [
        `<p>Hi ${buyerName},</p>`,
        `<p>Your order <strong>#${shortId}</strong> from <strong>${supplierName}</strong> has been <strong>${statusLabel}</strong>.</p>`,
        status === 'CONFIRMED'
          ? '<p>Your order is being prepared and will be delivered by Wolt.</p>'
          : '<p>If you have questions, please contact the supplier directly.</p>',
        paymentLine ? `<p>${paymentLine}</p>` : '',
        `<p>Total: ${total.toFixed(2)} kr</p>`,
        `<p><a href="${ordersUrl}">View your orders →</a></p>`,
      ].join(''),
    })
  } catch (error) {
    console.warn(`Failed to send order status email to ${buyerEmail}`, error)
  }
}

export async function sendSupplierVerificationApprovedEmail({
  email,
  businessName,
}: {
  email: string
  businessName: string
}): Promise<void> {
  const loginUrl = new URL('/supplier/login', getFrontendBaseUrl()).toString()

  try {
    await send({
      to: email,
      subject: 'Your LocalSupply supplier account has been approved',
      text: [
        `Hi ${businessName},`,
        '',
        'Great news — your LocalSupply supplier account has been approved.',
        'You can now log in and start listing your products.',
        '',
        `Sign in here: ${loginUrl}`,
        '',
        'Welcome aboard!',
        'The LocalSupply Team',
      ].join('\n'),
      html: [
        `<p>Hi <strong>${businessName}</strong>,</p>`,
        '<p>Great news — your LocalSupply supplier account has been <strong>approved</strong>.</p>',
        '<p>You can now log in and start listing your products.</p>',
        `<p><a href="${loginUrl}">Sign in to your dashboard →</a></p>`,
        '<p>Welcome aboard!<br>The LocalSupply Team</p>',
      ].join(''),
    })
  } catch (error) {
    console.warn(`Failed to send approval email to ${email}`, error)
  }
}

export async function sendSupplierVerificationRejectedEmail({
  email,
  businessName,
  reason,
}: {
  email: string
  businessName: string
  reason: string | null
}): Promise<void> {
  try {
    await send({
      to: email,
      subject: 'Update on your LocalSupply supplier application',
      text: [
        `Hi ${businessName},`,
        '',
        'After reviewing your application, we are unable to approve your LocalSupply supplier account at this time.',
        ...(reason ? [`Reason: ${reason}`, ''] : ['']),
        'If you believe this is a mistake or have questions, please reply to this email.',
        '',
        'The LocalSupply Team',
      ].join('\n'),
      html: [
        `<p>Hi <strong>${businessName}</strong>,</p>`,
        '<p>After reviewing your application, we are unable to approve your LocalSupply supplier account at this time.</p>',
        reason ? `<p><strong>Reason:</strong> ${reason}</p>` : '',
        '<p>If you believe this is a mistake or have questions, please reply to this email.</p>',
        '<p>The LocalSupply Team</p>',
      ].join(''),
    })
  } catch (error) {
    console.warn(`Failed to send rejection email to ${email}`, error)
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
  const resetUrl = new URL('/reset-password', getFrontendBaseUrl())
  resetUrl.searchParams.set('token', resetToken)

  try {
    await send({
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
  const resend = getResendClient()
  const verificationUrl = verificationBaseUrl
    ? buildVerificationUrlFromBaseUrl(verificationToken, verificationBaseUrl)
    : buildVerificationUrl(verificationToken)

  if (!resend) {
    if (allowVerificationFallback()) {
      return { mode: 'fallback', verificationUrl }
    }
    throw new Error('RESEND_API_KEY must be configured to send verification emails.')
  }

  try {
    const { error } = await resend.emails.send({
      from: getFromAddress(),
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

    if (error) {
      if (allowVerificationFallback()) {
        console.warn('Verification email delivery failed, using fallback link instead.', error)
        return { mode: 'fallback', verificationUrl }
      }
      throw error
    }

    return { mode: 'email' }
  } catch (error) {
    if (allowVerificationFallback()) {
      console.warn('Verification email delivery failed, using fallback link instead.', error)
      return { mode: 'fallback', verificationUrl }
    }
    throw error
  }
}
