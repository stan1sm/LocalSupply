import { Router } from 'express'
import { signSupplierToken } from '../lib/jwt.js'
import { getPrismaClient } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { productImageUrl, uploadProductImage } from '../lib/uploadProductImage.js'
import { supplierImageUrl, uploadSupplierImage } from '../lib/uploadSupplierImage.js'
import {
  validateSupplierLoginPayload,
  validateSupplierRegistrationPayload,
} from '../lib/validation.js'
import { requireSupplierAuth } from '../middleware/requireSupplierAuth.js'

const suppliersRouter = Router()

const BRREG_API = 'https://data.brreg.no/enhetsregisteret/api'

suppliersRouter.get('/verify/:orgnr', async (req, res) => {
  const orgnr = String(req.params.orgnr ?? '').trim().replace(/\s/g, '')

  if (!/^\d{9}$/.test(orgnr)) {
    res.status(400).json({ ok: false, message: 'Organisasjonsnummer must be exactly 9 digits.' })
    return
  }

  try {
    const response = await fetch(`${BRREG_API}/enheter/${orgnr}`, {
      headers: { Accept: 'application/json' },
    })

    if (response.status === 404) {
      res.status(404).json({ ok: false, message: 'No company found with that organisation number.' })
      return
    }

    if (!response.ok) {
      res.status(502).json({ ok: false, message: 'Could not reach the company registry right now.' })
      return
    }

    const data = (await response.json()) as Record<string, unknown>

    const inBankruptcy = data.konkurs === true
    const inLiquidation = data.underAvvikling === true
    const forcedDissolution = data.underTvangsavviklingEllerTvangsopplosning === true
    const registeredInBusinessRegister = data.registrertIForetaksregisteret === true

    // registrertIForetaksregisteret is only true for AS and similar entities.
    // ENK and other types are only in Enhetsregisteret — presence in the API response
    // is sufficient proof of existence. Active = no negative flags.
    const isActive = !inBankruptcy && !inLiquidation && !forcedDissolution

    const forretningsadresse = data.forretningsadresse as Record<string, unknown> | undefined
    const adresseLines = Array.isArray(forretningsadresse?.adresse) ? (forretningsadresse.adresse as string[]) : []
    const postnummer = typeof forretningsadresse?.postnummer === 'string' ? forretningsadresse.postnummer : ''
    const poststed = typeof forretningsadresse?.poststed === 'string' ? forretningsadresse.poststed : ''
    const addressString = [
      adresseLines.join(', '),
      postnummer && poststed ? `${postnummer} ${poststed}` : poststed || postnummer,
    ]
      .filter(Boolean)
      .join(', ')

    res.json({
      ok: true,
      orgnr,
      name: typeof data.navn === 'string' ? data.navn : '',
      address: addressString,
      isActive,
      inBankruptcy,
      inLiquidation,
      forcedDissolution,
      registeredInBusinessRegister,
    })
  } catch (error) {
    console.error('Brreg lookup failed', error)
    res.status(502).json({ ok: false, message: 'Could not reach the company registry right now.' })
  }
})

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
      where: {
        showInMarketplace: true,
        isVerified: true,
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
        tagline: supplier.tagline,
        storeType: supplier.storeType,
        badgeText: supplier.badgeText,
        brandColor: supplier.brandColor,
        openingHours: supplier.openingHours,
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
       // Profile fields
      logoUrl: supplier.logoUrl,
      heroImageUrl: supplier.heroImageUrl,
      tagline: supplier.tagline,
      description: supplier.description,
      storeType: supplier.storeType,
      badgeText: supplier.badgeText,
      brandColor: supplier.brandColor,
      serviceRadiusKm: supplier.serviceRadiusKm,
      serviceAreas: supplier.serviceAreas,
      openingHours: supplier.openingHours,
      openingHoursNote: supplier.openingHoursNote,
      websiteUrl: supplier.websiteUrl,
      instagramUrl: supplier.instagramUrl,
      facebookUrl: supplier.facebookUrl,
      preferredContactMethod: supplier.preferredContactMethod,
      orderNotesHint: supplier.orderNotesHint,
      showInMarketplace: supplier.showInMarketplace,
      acceptDirectOrders: supplier.acceptDirectOrders,
      minimumOrderAmount: supplier.minimumOrderAmount,
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

suppliersRouter.post('/:supplierId/products', requireSupplierAuth, (req, res, next) => {
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

  if (res.locals.supplierId !== supplierId) {
    res.status(403).json({ message: 'Forbidden.' })
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

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const rawOrgnr = typeof body.orgnr === 'string' ? body.orgnr.trim().replace(/\s/g, '') : null
  const orgnr = rawOrgnr && /^\d{9}$/.test(rawOrgnr) ? rawOrgnr : null

  // If orgnr provided, verify with Brønnøysund and set status
  let verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED' = 'UNVERIFIED'
  if (orgnr) {
    try {
      const brregRes = await fetch(`${BRREG_API}/enheter/${orgnr}`, { headers: { Accept: 'application/json' } })
      if (brregRes.ok) {
        const brregData = (await brregRes.json()) as Record<string, unknown>
        const inBankruptcy = brregData.konkurs === true
        const inLiquidation = brregData.underAvvikling === true
        const forcedDissolution = brregData.underTvangsavviklingEllerTvangsopplosning === true
        verificationStatus = (!inBankruptcy && !inLiquidation && !forcedDissolution)
          ? 'VERIFIED'
          : 'REJECTED'
      }
    } catch {
      // Brønnøysund unavailable — register as UNVERIFIED, can be verified later
    }
  }

  try {
    const prisma = getPrismaClient()

    const existingBuyer = await prisma.user.findUnique({ where: { email } })
    if (existingBuyer) {
      res.status(409).json({
        message: 'An account already exists with this email address.',
        errors: { email: 'This email is already registered as a buyer account.' },
      })
      return
    }

    const passwordHash = await hashPassword(password)

    const supplier = await prisma.supplier.create({
      data: {
        businessName,
        contactName,
        phoneNumber,
        email,
        passwordHash,
        address,
        orgnr,
        verificationStatus,
        isVerified: verificationStatus === 'VERIFIED',
      },
    })

    res.status(201).json({
      message: 'Supplier account created.',
      token: signSupplierToken(supplier.id),
      supplier: {
        id: supplier.id,
        businessName: supplier.businessName,
        contactName: supplier.contactName,
        email: supplier.email,
        address: supplier.address,
        orgnr: supplier.orgnr,
        isVerified: supplier.isVerified,
        verificationStatus: supplier.verificationStatus,
      },
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code) : ''

    if (code === 'P2002') {
      const meta = (error as any).meta as { target?: string[] } | undefined
      const field = meta?.target?.includes('orgnr') ? 'orgnr' : 'email'
      res.status(409).json({
        message: field === 'orgnr' ? 'A supplier with this organisation number already exists.' : 'A supplier with this email already exists.',
        errors: { [field]: field === 'orgnr' ? 'Organisation number already registered.' : 'A supplier with this email already exists.' },
      })
      return
    }

    console.error('Supplier registration failed', error)
    res.status(500).json({ message: 'Unable to create supplier account right now.' })
  }
})

suppliersRouter.post('/:supplierId/logo', requireSupplierAuth, (req, res, next) => {
  uploadSupplierImage.single('image')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Invalid file upload.'
      return res.status(400).json({ message })
    }
    next()
  })
}, async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()
  if (res.locals.supplierId !== supplierId) {
    res.status(403).json({ message: 'Forbidden.' })
    return
  }
  if (!req.file) {
    res.status(400).json({ message: 'No image file provided.' })
    return
  }
  try {
    const prisma = getPrismaClient()
    const logoUrl = supplierImageUrl(req.file.filename)
    await prisma.supplier.update({ where: { id: supplierId }, data: { logoUrl } })
    res.status(200).json({ logoUrl })
  } catch (error) {
    console.error('Failed to upload supplier logo', error)
    res.status(503).json({ message: 'Unable to upload logo right now.' })
  }
})

suppliersRouter.post('/:supplierId/banner', requireSupplierAuth, (req, res, next) => {
  uploadSupplierImage.single('image')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Invalid file upload.'
      return res.status(400).json({ message })
    }
    next()
  })
}, async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()
  if (res.locals.supplierId !== supplierId) {
    res.status(403).json({ message: 'Forbidden.' })
    return
  }
  if (!req.file) {
    res.status(400).json({ message: 'No image file provided.' })
    return
  }
  try {
    const prisma = getPrismaClient()
    const heroImageUrl = supplierImageUrl(req.file.filename)
    await prisma.supplier.update({ where: { id: supplierId }, data: { heroImageUrl } })
    res.status(200).json({ heroImageUrl })
  } catch (error) {
    console.error('Failed to upload supplier banner', error)
    res.status(503).json({ message: 'Unable to upload banner right now.' })
  }
})

suppliersRouter.put('/:supplierId/profile', requireSupplierAuth, async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()

  if (!supplierId) {
    res.status(400).json({ message: 'Supplier id is required.' })
    return
  }

  if (res.locals.supplierId !== supplierId) {
    res.status(403).json({ message: 'Forbidden.' })
    return
  }

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}

  function asString(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, maxLength)
  }

  const data: Record<string, unknown> = {
    logoUrl: asString(body.logoUrl, 2048),
    heroImageUrl: asString(body.heroImageUrl, 2048),
    tagline: asString(body.tagline, 160),
    description: asString(body.description, 4000),
    storeType: asString(body.storeType, 80),
    badgeText: asString(body.badgeText, 40),
    brandColor: asString(body.brandColor, 32),
    serviceRadiusKm:
      typeof body.serviceRadiusKm === 'number' && Number.isInteger(body.serviceRadiusKm) && body.serviceRadiusKm > 0
        ? body.serviceRadiusKm
        : null,
    serviceAreas: asString(body.serviceAreas, 400),
    openingHours: asString(body.openingHours, 2000),
    openingHoursNote: asString(body.openingHoursNote, 400),
    websiteUrl: asString(body.websiteUrl, 2048),
    instagramUrl: asString(body.instagramUrl, 2048),
    facebookUrl: asString(body.facebookUrl, 2048),
    preferredContactMethod: asString(body.preferredContactMethod, 80),
    orderNotesHint: asString(body.orderNotesHint, 400),
    showInMarketplace: typeof body.showInMarketplace === 'boolean' ? body.showInMarketplace : undefined,
    acceptDirectOrders: typeof body.acceptDirectOrders === 'boolean' ? body.acceptDirectOrders : undefined,
    minimumOrderAmount:
      typeof body.minimumOrderAmount === 'number' && Number.isFinite(body.minimumOrderAmount) && body.minimumOrderAmount > 0
        ? body.minimumOrderAmount
        : null,
  }

  // Remove undefined keys so Prisma doesn't overwrite with undefined.
  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) {
      delete data[key]
    }
  })

  try {
    const prisma = getPrismaClient()
    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data,
    })

    res.status(200).json({
      id: supplier.id,
      businessName: supplier.businessName,
      contactName: supplier.contactName,
      address: supplier.address,
      email: supplier.email,
      isVerified: supplier.isVerified,
      logoUrl: supplier.logoUrl,
      heroImageUrl: supplier.heroImageUrl,
      tagline: supplier.tagline,
      description: supplier.description,
      storeType: supplier.storeType,
      badgeText: supplier.badgeText,
      brandColor: supplier.brandColor,
      serviceRadiusKm: supplier.serviceRadiusKm,
      serviceAreas: supplier.serviceAreas,
      openingHours: supplier.openingHours,
      openingHoursNote: supplier.openingHoursNote,
      websiteUrl: supplier.websiteUrl,
      instagramUrl: supplier.instagramUrl,
      facebookUrl: supplier.facebookUrl,
      preferredContactMethod: supplier.preferredContactMethod,
      orderNotesHint: supplier.orderNotesHint,
      showInMarketplace: supplier.showInMarketplace,
      acceptDirectOrders: supplier.acceptDirectOrders,
      minimumOrderAmount: supplier.minimumOrderAmount,
    })
  } catch (error) {
    console.error('Failed to update supplier profile', error)
    res.status(503).json({ message: 'Unable to update supplier profile right now.' })
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
      token: signSupplierToken(supplier.id),
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

suppliersRouter.delete('/account', requireSupplierAuth, async (req, res) => {
  const supplierId = res.locals.supplierId as string
  try {
    await getPrismaClient().supplier.delete({ where: { id: supplierId } })
    res.status(204).end()
  } catch (error) {
    console.error('Supplier account deletion failed', error)
    res.status(503).json({ message: 'Unable to delete account right now.' })
  }
})

export default suppliersRouter

