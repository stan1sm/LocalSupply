import nodemailer from 'nodemailer'

function createTransport() {
  const host = process.env['SMTP_HOST']
  const port = parseInt(process.env['SMTP_PORT'] ?? '587', 10)
  const user = process.env['SMTP_USER']
  const pass = process.env['SMTP_PASS']

  if (!host || !user || !pass) return null

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

const FROM = process.env['EMAIL_FROM'] ?? 'LocalSupply <noreply@localsupply.app>'

export async function sendVerificationApproved(to: string, businessName: string): Promise<void> {
  const transport = createTransport()
  if (!transport) return

  await transport.sendMail({
    from: FROM,
    to,
    subject: 'Your supplier account has been approved',
    text: [
      `Hi ${businessName},`,
      '',
      'Your LocalSupply supplier account has been approved. You can now log in and start listing your products.',
      '',
      'Welcome aboard!',
      'The LocalSupply Team',
    ].join('\n'),
    html: `
      <p>Hi <strong>${businessName}</strong>,</p>
      <p>Your LocalSupply supplier account has been <strong>approved</strong>. You can now log in and start listing your products.</p>
      <p>Welcome aboard!<br>The LocalSupply Team</p>
    `,
  })
}

export async function sendVerificationRejected(to: string, businessName: string, reason: string): Promise<void> {
  const transport = createTransport()
  if (!transport) return

  await transport.sendMail({
    from: FROM,
    to,
    subject: 'Update on your LocalSupply supplier application',
    text: [
      `Hi ${businessName},`,
      '',
      'We reviewed your LocalSupply supplier application and were unable to approve it at this time.',
      '',
      `Reason: ${reason}`,
      '',
      'If you believe this was a mistake or would like to re-apply, please contact support.',
      '',
      'The LocalSupply Team',
    ].join('\n'),
    html: `
      <p>Hi <strong>${businessName}</strong>,</p>
      <p>We reviewed your LocalSupply supplier application and were unable to approve it at this time.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>If you believe this was a mistake or would like to re-apply, please contact support.</p>
      <p>The LocalSupply Team</p>
    `,
  })
}
