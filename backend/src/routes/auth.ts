import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { hashPassword } from '../lib/password.js'
import { validateUserRegistrationPayload } from '../lib/validation.js'

const authRouter = Router()

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
    const passwordHash = await hashPassword(password)

    const user = await getPrismaClient().user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
      },
    })

    res.status(201).json({
      message: 'Account created successfully.',
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

export default authRouter
