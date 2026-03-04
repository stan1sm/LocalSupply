import { Router } from 'express'
import { buildEmailVerifiedRedirectUrl, sendUserVerificationEmail } from '../lib/email.js'
import { getPrismaClient } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { validateUserEmailPayload, validateUserLoginPayload, validateUserRegistrationPayload } from '../lib/validation.js'
import { generateEmailVerificationToken, hashEmailVerificationToken, isValidEmailVerificationToken } from '../lib/verification.js'

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

    res.status(200).json({
      message: 'Signed in successfully.',
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

export default authRouter
