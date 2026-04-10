import { Router } from 'express'
import { buildEmailVerifiedRedirectUrl, sendPasswordResetEmail, sendUserVerificationEmail } from '../lib/email.js'
import { signBuyerToken } from '../lib/jwt.js'
import { getPrismaClient } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { requireBuyerAuth } from '../middleware/requireBuyerAuth.js'
import { validateUserEmailPayload, validateUserLoginPayload, validateUserRegistrationPayload } from '../lib/validation.js'
import { generateEmailVerificationToken, generatePasswordResetToken, hashEmailVerificationToken, hashPasswordResetToken, isValidEmailVerificationToken, isValidPasswordResetToken } from '../lib/verification.js'

const authRouter = Router()
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.'
const EMAIL_NOT_VERIFIED_MESSAGE = 'Please verify your email before signing in.'
const RESEND_VERIFICATION_MESSAGE = 'If an unverified account exists for this email, a verification email has been sent.'

function getRequestBaseUrl(req: { protocol: string; get(name: string): string | undefined }) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = req.get('x-forwarded-host') ?? req.get('host')
  const protocol = forwardedProto || req.protocol

  if (!host) {
    return undefined
  }

  return `${protocol}://${host}`
}

function isValidNorwegianPhone(phone: string): boolean {
  // 8 digits starting with 2-9
  if (/^[2-9]\d{7}$/.test(phone)) return true
  // With country code +47 or 0047
  if (/^(\+47|0047)[2-9]\d{7}$/.test(phone)) return true
  return false
}

authRouter.post('/register', async (req, res) => {
  const validation = validateUserRegistrationPayload(req.body)

  if (!validation.ok) {
    res.status(400).json({
      message: 'Validation failed.',
      errors: validation.errors,
    })
    return
  }

  const { firstName, lastName, email, password } = validation.data
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const accountType = body.accountType === 'BUSINESS' ? 'BUSINESS' as const : 'INDIVIDUAL' as const
  const orgNumber = accountType === 'BUSINESS' && typeof body.orgNumber === 'string' ? body.orgNumber.trim() || null : null

  try {
    const prisma = getPrismaClient()
    const passwordHash = await hashPassword(password)
    const emailVerification = generateEmailVerificationToken()
    let delivery: Awaited<ReturnType<typeof sendUserVerificationEmail>>

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        emailVerified: false,
        passwordHash,
        emailVerificationTokenHash: emailVerification.tokenHash,
        accountType,
        ...(orgNumber ? { orgNumber } : {}),
      },
    })

    try {
      const verificationBaseUrl = getRequestBaseUrl(req)
      delivery = await sendUserVerificationEmail({
        email: user.email,
        firstName: user.firstName,
        verificationToken: emailVerification.token,
        ...(verificationBaseUrl ? { verificationBaseUrl } : {}),
      })
    } catch (error) {
      try {
        await prisma.user.delete({ where: { id: user.id } })
      } catch (deleteError) {
        console.error('User cleanup after verification email failure failed', deleteError)
      }

      throw error
    }

    res.status(201).json({
      message: 'Account created. Check your email to verify it before signing in.',
      deliveryMode: delivery.mode,
      verificationPreviewUrl: delivery.verificationUrl,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''

    if (code === 'P2002') {
      res.status(409).json({
        message: 'An account with this email already exists.',
        errors: {
          email: 'An account with this email already exists.',
        },
      })
      return
    }

    console.error('User registration failed', error)
    res.status(500).json({ message: 'Unable to create account right now.' })
  }
})

authRouter.post('/login', async (req, res) => {
  const validation = validateUserLoginPayload(req.body)

  if (!validation.ok) {
    res.status(400).json({
      message: 'Validation failed.',
      errors: validation.errors,
    })
    return
  }

  const { email, password } = validation.data

  try {
    const user = await getPrismaClient().user.findUnique({
      where: { email },
    })

    if (!user) {
      res.status(401).json({
        message: INVALID_CREDENTIALS_MESSAGE,
      })
      return
    }

    if (!user.passwordHash) {
      res.status(401).json({
        message: INVALID_CREDENTIALS_MESSAGE,
      })
      return
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash)
    if (!isValidPassword) {
      res.status(401).json({
        message: INVALID_CREDENTIALS_MESSAGE,
      })
      return
    }

    if (!user.emailVerified) {
      res.status(403).json({
        message: EMAIL_NOT_VERIFIED_MESSAGE,
        email: user.email,
      })
      return
    }

    const token = signBuyerToken(user.id)

    res.status(200).json({
      message: 'Signed in successfully.',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    })
  } catch (error) {
    console.error('User login failed', error)
    res.status(500).json({ message: 'Unable to sign in right now.' })
  }
})

authRouter.get('/me', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  try {
    const user = await getPrismaClient().user.findUnique({ where: { id: buyerId } })
    if (!user) { res.status(404).json({ message: 'User not found.' }); return }
    res.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      accountType: user.accountType,
    })
  } catch (error) {
    console.error('Failed to load user profile', error)
    res.status(500).json({ message: 'Unable to load profile right now.' })
  }
})

authRouter.patch('/profile', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : null
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : null

  if (firstName !== null && firstName.length === 0) {
    res.status(400).json({ message: 'First name cannot be empty.' }); return
  }
  if (lastName !== null && lastName.length === 0) {
    res.status(400).json({ message: 'Last name cannot be empty.' }); return
  }

  try {
    const prisma = getPrismaClient()
    const updated = await prisma.user.update({
      where: { id: buyerId },
      data: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
      },
    })
    res.json({ id: updated.id, firstName: updated.firstName, lastName: updated.lastName, email: updated.email })
  } catch (error) {
    console.error('Profile update failed', error)
    res.status(503).json({ message: 'Unable to update profile right now.' })
  }
})

authRouter.patch('/password', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!currentPassword || !newPassword) {
    res.status(400).json({ message: 'currentPassword and newPassword are required.' }); return
  }
  if (newPassword.length < 8) {
    res.status(400).json({ message: 'New password must be at least 8 characters.' }); return
  }

  try {
    const prisma = getPrismaClient()
    const user = await prisma.user.findUnique({ where: { id: buyerId } })
    if (!user || !user.passwordHash) {
      res.status(404).json({ message: 'User not found.' }); return
    }
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) {
      res.status(401).json({ message: 'Current password is incorrect.' }); return
    }
    const newHash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: buyerId }, data: { passwordHash: newHash } })
    res.json({ message: 'Password updated.' })
  } catch (error) {
    console.error('Password change failed', error)
    res.status(503).json({ message: 'Unable to update password right now.' })
  }
})

authRouter.post('/resend-verification', async (req, res) => {
  const validation = validateUserEmailPayload(req.body)

  if (!validation.ok) {
    res.status(400).json({
      message: 'Validation failed.',
      errors: validation.errors,
    })
    return
  }

  const { email } = validation.data

  try {
    const prisma = getPrismaClient()
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user || user.emailVerified) {
      res.status(200).json({
        message: RESEND_VERIFICATION_MESSAGE,
      })
      return
    }

    const emailVerification = generateEmailVerificationToken()
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: emailVerification.tokenHash,
      },
    })

    const verificationBaseUrl = getRequestBaseUrl(req)
    const delivery = await sendUserVerificationEmail({
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      verificationToken: emailVerification.token,
      ...(verificationBaseUrl ? { verificationBaseUrl } : {}),
    })

    res.status(200).json({
      message: RESEND_VERIFICATION_MESSAGE,
      deliveryMode: delivery.mode,
      verificationPreviewUrl: delivery.verificationUrl,
    })
  } catch (error) {
    console.error('Resending verification email failed', error)
    res.status(500).json({ message: 'Unable to resend verification email right now.' })
  }
})

authRouter.get('/verify-email', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : ''

  if (!isValidEmailVerificationToken(token)) {
    res.redirect(303, buildEmailVerifiedRedirectUrl('invalid'))
    return
  }

  try {
    const prisma = getPrismaClient()
    const tokenHash = hashEmailVerificationToken(token)
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
      },
    })

    if (!user) {
      res.redirect(303, buildEmailVerifiedRedirectUrl('invalid'))
      return
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
      },
    })

    res.redirect(303, buildEmailVerifiedRedirectUrl('success'))
  } catch (error) {
    console.error('Email verification failed', error)
    res.redirect(303, buildEmailVerifiedRedirectUrl('invalid'))
  }
})

// ── Addresses ────────────────────────────────────────────────────────────────

authRouter.get('/addresses', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const prisma = getPrismaClient()
  const addresses = await prisma.userAddress.findMany({ where: { userId: buyerId }, orderBy: { createdAt: 'asc' } })
  res.json(addresses)
})

authRouter.post('/addresses', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const label = typeof body.label === 'string' ? body.label.trim() : null
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : null
  const makeDefault = body.isDefault === true

  if (!address) { res.status(400).json({ message: 'address is required.' }); return }

  if (rawPhone && !isValidNorwegianPhone(rawPhone)) {
    res.status(400).json({ message: 'Invalid phone number. Use a Norwegian number (e.g. 40012345 or +4740012345).' })
    return
  }

  const prisma = getPrismaClient()
  const existing = await prisma.userAddress.count({ where: { userId: buyerId } })

  if (makeDefault || existing === 0) {
    await prisma.userAddress.updateMany({ where: { userId: buyerId, isDefault: true }, data: { isDefault: false } })
  }

  const created = await prisma.userAddress.create({
    data: { userId: buyerId, address, label: label || null, phone: rawPhone || null, isDefault: makeDefault || existing === 0 },
  })
  res.status(201).json(created)
})

authRouter.patch('/addresses/:id', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}

  const prisma = getPrismaClient()
  const existing = await prisma.userAddress.findUnique({ where: { id } })
  if (!existing || existing.userId !== buyerId) { res.status(404).json({ message: 'Address not found.' }); return }

  if (typeof body.phone === 'string') {
    const rawPhone = body.phone.trim()
    if (rawPhone && !isValidNorwegianPhone(rawPhone)) {
      res.status(400).json({ message: 'Invalid phone number. Use a Norwegian number (e.g. 40012345 or +4740012345).' })
      return
    }
  }

  if (body.isDefault === true) {
    await prisma.userAddress.updateMany({ where: { userId: buyerId, isDefault: true }, data: { isDefault: false } })
  }

  const updated = await prisma.userAddress.update({
    where: { id },
    data: {
      ...(typeof body.address === 'string' ? { address: body.address.trim() } : {}),
      ...(typeof body.label === 'string' ? { label: body.label.trim() || null } : {}),
      ...(typeof body.phone === 'string' ? { phone: body.phone.trim() || null } : {}),
      ...(body.isDefault === true ? { isDefault: true } : {}),
    },
  })
  res.json(updated)
})

authRouter.delete('/addresses/:id', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const id = typeof req.params.id === 'string' ? req.params.id : ''

  const prisma = getPrismaClient()
  const existing = await prisma.userAddress.findUnique({ where: { id } })
  if (!existing || existing.userId !== buyerId) { res.status(404).json({ message: 'Address not found.' }); return }

  await prisma.userAddress.delete({ where: { id } })

  if (existing.isDefault) {
    const next = await prisma.userAddress.findFirst({ where: { userId: buyerId }, orderBy: { createdAt: 'asc' } })
    if (next) await prisma.userAddress.update({ where: { id: next.id }, data: { isDefault: true } })
  }

  res.status(204).end()
})

// ── Payment methods ───────────────────────────────────────────────────────────

authRouter.get('/payment-methods', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const prisma = getPrismaClient()
  const methods = await prisma.userPaymentMethod.findMany({ where: { userId: buyerId }, orderBy: { createdAt: 'asc' } })
  res.json(methods)
})

authRouter.post('/payment-methods', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const cardholderName = typeof body.cardholderName === 'string' ? body.cardholderName.trim() : ''
  const lastFour = typeof body.lastFour === 'string' ? body.lastFour.trim() : ''
  const maskedNumber = typeof body.maskedNumber === 'string' ? body.maskedNumber.trim() : ''
  const expiry = typeof body.expiry === 'string' ? body.expiry.trim() : ''
  const cardType = typeof body.cardType === 'string' ? body.cardType.trim() : null
  const makeDefault = body.isDefault === true

  if (!cardholderName || !lastFour || !expiry) {
    res.status(400).json({ message: 'cardholderName, lastFour, and expiry are required.' })
    return
  }

  const prisma = getPrismaClient()
  const existing = await prisma.userPaymentMethod.count({ where: { userId: buyerId } })

  if (makeDefault || existing === 0) {
    await prisma.userPaymentMethod.updateMany({ where: { userId: buyerId, isDefault: true }, data: { isDefault: false } })
  }

  const created = await prisma.userPaymentMethod.create({
    data: {
      userId: buyerId,
      cardholderName,
      lastFour,
      maskedNumber: maskedNumber || `•••• •••• •••• ${lastFour}`,
      expiry,
      cardType: cardType || null,
      isDefault: makeDefault || existing === 0,
    },
  })
  res.status(201).json(created)
})

authRouter.patch('/payment-methods/:id', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}

  const prisma = getPrismaClient()
  const existing = await prisma.userPaymentMethod.findUnique({ where: { id } })
  if (!existing || existing.userId !== buyerId) { res.status(404).json({ message: 'Payment method not found.' }); return }

  if (body.isDefault === true) {
    await prisma.userPaymentMethod.updateMany({ where: { userId: buyerId, isDefault: true }, data: { isDefault: false } })
  }

  const updated = await prisma.userPaymentMethod.update({
    where: { id },
    data: { ...(body.isDefault === true ? { isDefault: true } : {}) },
  })
  res.json(updated)
})

authRouter.delete('/payment-methods/:id', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  const id = typeof req.params.id === 'string' ? req.params.id : ''

  const prisma = getPrismaClient()
  const existing = await prisma.userPaymentMethod.findUnique({ where: { id } })
  if (!existing || existing.userId !== buyerId) { res.status(404).json({ message: 'Payment method not found.' }); return }

  await prisma.userPaymentMethod.delete({ where: { id } })

  if (existing.isDefault) {
    const next = await prisma.userPaymentMethod.findFirst({ where: { userId: buyerId }, orderBy: { createdAt: 'asc' } })
    if (next) await prisma.userPaymentMethod.update({ where: { id: next.id }, data: { isDefault: true } })
  }

  res.status(204).end()
})

// POST /api/auth/forgot-password
authRouter.post('/forgot-password', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  // Always return success to prevent email enumeration
  res.json({ message: 'If an account exists for this email, a password reset link has been sent.' })

  if (!email) return

  try {
    const prisma = getPrismaClient()
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.emailVerified) return

    const { token, tokenHash } = generatePasswordResetToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: expiresAt },
    })

    await sendPasswordResetEmail({ email: user.email, firstName: user.firstName, resetToken: token })
  } catch (error) {
    console.error('Forgot password error', error)
  }
})

// POST /api/auth/reset-password
authRouter.post('/reset-password', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!isValidPasswordResetToken(token)) {
    res.status(400).json({ message: 'Invalid or expired reset link.' })
    return
  }

  const passwordError = password.length < 8 ? 'Password must be at least 8 characters.' : null
  if (passwordError) {
    res.status(400).json({ message: passwordError })
    return
  }

  try {
    const prisma = getPrismaClient()
    const tokenHash = hashPasswordResetToken(token)
    const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash } })

    if (!user || !user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt < new Date()) {
      res.status(400).json({ message: 'Invalid or expired reset link.' })
      return
    }

    const newHash = await hashPassword(password)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordResetTokenHash: null, passwordResetTokenExpiresAt: null },
    })

    res.json({ message: 'Password updated successfully. You can now sign in.' })
  } catch (error) {
    console.error('Reset password error', error)
    res.status(503).json({ message: 'Unable to reset password right now.' })
  }
})

authRouter.delete('/account', requireBuyerAuth, async (req, res) => {
  const buyerId = res.locals.buyerId as string
  try {
    await getPrismaClient().user.delete({ where: { id: buyerId } })
    res.status(204).end()
  } catch (error) {
    console.error('Account deletion failed', error)
    res.status(503).json({ message: 'Unable to delete account right now.' })
  }
})

export default authRouter
