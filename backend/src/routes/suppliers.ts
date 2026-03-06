import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { productImageUrl, uploadProductImage } from '../lib/uploadProductImage.js'
import {
  validateSupplierLoginPayload,
  validateSupplierRegistrationPayload,
} from '../lib/validation.js'

const suppliersRouter = Router()

suppliersRouter.get('/', async (_req, res) => {
  try {
    const prisma = getPrismaClient()
    const suppliers = await prisma.supplier.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.status(200).json(
      suppliers.map((supplier) => ({
        id: supplier.id,
        businessName: supplier.businessName,
        contactName: supplier.contactName,
        address: supplier.address,
        email: supplier.email,
        isVerified: supplier.isVerified,
        createdAt: supplier.createdAt,
        productCount: (supplier as any)._count?.products ?? 0,
      })),
    )
  } catch (error) {
    console.error('Failed to load suppliers', error)
    res.status(503).json({ message: 'Unable to load suppliers right now.' })
  }
})

suppliersRouter.get('/:supplierId', async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()

  if (!supplierId) {
    res.status(400).json({ message: 'Supplier id is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        _count: { select: { products: true } },
      },
    })

    if (!supplier) {
      res.status(404).json({ message: 'Supplier not found.' })
      return
    }

    res.status(200).json({
      id: supplier.id,
      businessName: supplier.businessName,
      contactName: supplier.contactName,
      address: supplier.address,
      email: supplier.email,
      isVerified: supplier.isVerified,
      createdAt: supplier.createdAt,
      productCount: (supplier as any)._count?.products ?? 0,
    })
  } catch (error) {
    console.error('Failed to load supplier', error)
    res.status(503).json({ message: 'Unable to load supplier right now.' })
  }
})

suppliersRouter.get('/:supplierId/products', async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()

  if (!supplierId) {
    res.status(400).json({ message: 'Supplier id is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const products = await prisma.product.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
    })

    res.status(200).json(
      products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        unit: product.unit,
        price: product.price,
        stockQty: product.stockQty,
        imageUrl: product.imageUrl ?? null,
        isActive: product.isActive,
        createdAt: product.createdAt,
      })),
    )
  } catch (error) {
    console.error('Failed to load supplier products', error)
    res.status(503).json({ message: 'Unable to load products right now.' })
  }
})

suppliersRouter.post('/:supplierId/products', (req, res, next) => {
  uploadProductImage.single('image')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Invalid file upload.'
      return res.status(400).json({ message })
    }
    next()
  })
}, async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()

  if (!supplierId) {
    res.status(400).json({ message: 'Supplier id is required.' })
    return
  }

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const unit = typeof body.unit === 'string' ? body.unit.trim() : ''
  const price = Number(body.price)
  const stockQty = Number.isFinite(Number(body.stockQty)) ? Number(body.stockQty) : 0

  const errors: Record<string, string> = {}

  if (!name || name.length < 2 || name.length > 120) {
    errors.name = 'Use 2-120 characters for product name.'
  }

  if (!unit || unit.length < 1 || unit.length > 40) {
    errors.unit = 'Unit is required.'
  }

  if (!Number.isFinite(price) || price <= 0) {
    errors.price = 'Enter a valid price greater than 0.'
  }

  if (!Number.isInteger(stockQty) || stockQty < 0) {
    errors.stockQty = 'Stock must be a non-negative integer.'
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ message: 'Validation failed.', errors })
    return
  }

  try {
    const prisma = getPrismaClient()

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) {
      res.status(404).json({ message: 'Supplier not found.' })
      return
    }

    const imageUrl = req.file ? productImageUrl(req.file.filename) : null

    const product = await prisma.product.create({
      data: {
        supplierId,
        name,
        description: description || null,
        unit,
        price,
        stockQty,
        imageUrl,
      },
    })

    res.status(201).json({
      id: product.id,
      name: product.name,
      description: product.description,
      unit: product.unit,
      price: product.price,
      stockQty: product.stockQty,
      imageUrl: product.imageUrl,
      isActive: product.isActive,
      createdAt: product.createdAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create product right now.'
    if (message.includes('images are allowed') || message.includes('file size')) {
      res.status(400).json({ message })
      return
    }
    console.error('Failed to create product', error)
    res.status(503).json({ message: 'Unable to create product right now.' })
  }
})

suppliersRouter.post('/register', async (req, res) => {
  const validation = validateSupplierRegistrationPayload(req.body)

  if (!validation.ok) {
    res.status(400).json({
      message: 'Validation failed.',
      errors: validation.errors,
    })
    return
  }

  const { businessName, contactName, phoneNumber, email, password, address } = validation.data

  try {
    const prisma = getPrismaClient()
    const passwordHash = await hashPassword(password)

    const supplier = await prisma.supplier.create({
      data: {
        businessName,
        contactName,
        phoneNumber,
        email,
        passwordHash,
        address,
      },
    })

    res.status(201).json({
      message: 'Supplier account created.',
      supplier: {
        id: supplier.id,
        businessName: supplier.businessName,
        contactName: supplier.contactName,
        email: supplier.email,
        address: supplier.address,
        isVerified: supplier.isVerified,
      },
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code) : ''

    if (code === 'P2002') {
      res.status(409).json({
        message: 'A supplier with this email already exists.',
        errors: {
          email: 'A supplier with this email already exists.',
        },
      })
      return
    }

    console.error('Supplier registration failed', error)
    res.status(500).json({ message: 'Unable to create supplier account right now.' })
  }
})

suppliersRouter.post('/login', async (req, res) => {
  const validation = validateSupplierLoginPayload(req.body)

  if (!validation.ok) {
    res.status(400).json({
      message: 'Validation failed.',
      errors: validation.errors,
    })
    return
  }

  const { email, password } = validation.data

  try {
    const prisma = getPrismaClient()
    const supplier = await prisma.supplier.findUnique({
      where: { email },
    })

    if (!supplier || !supplier.passwordHash) {
      res.status(401).json({ message: 'Invalid email or password.' })
      return
    }

    const isValidPassword = await verifyPassword(password, supplier.passwordHash)
    if (!isValidPassword) {
      res.status(401).json({ message: 'Invalid email or password.' })
      return
    }

    res.status(200).json({
      message: 'Signed in successfully.',
      supplier: {
        id: supplier.id,
        businessName: supplier.businessName,
        contactName: supplier.contactName,
        email: supplier.email,
        address: supplier.address,
        isVerified: supplier.isVerified,
      },
    })
  } catch (error) {
    console.error('Supplier login failed', error)
    res.status(500).json({ message: 'Unable to sign in right now.' })
  }
})

export default suppliersRouter

