import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signAdminToken } from '../lib/jwt.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'
import { sendSupplierVerificationApprovedEmail, sendSupplierVerificationRejectedEmail } from '../lib/email.js'

const adminRouter = Router()

// POST /api/admin/login
adminRouter.post('/login', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const admin = await prisma.admin.findUnique({ where: { email } })

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      res.status(401).json({ message: 'Invalid email or password.' })
      return
    }

    const token = signAdminToken(admin.id)
    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } })
  } catch (error) {
    console.error('Admin login failed', error)
    res.status(503).json({ message: 'Unable to sign in right now.' })
  }
})

// POST /api/admin/seed — create first admin (only works if no admin exists)
adminRouter.post('/seed', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name.trim() : 'Admin'

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const existing = await prisma.admin.findFirst()
    if (existing) {
      res.status(409).json({ message: 'Admin already exists. Use login.' })
      return
    }

    const passwordHash = await hashPassword(password)
    const admin = await prisma.admin.create({ data: { email, name, passwordHash } })
    res.status(201).json({ admin: { id: admin.id, email: admin.email, name: admin.name } })
  } catch (error) {
    console.error('Admin seed failed', error)
    res.status(503).json({ message: 'Unable to create admin right now.' })
  }
})

// GET /api/admin/suppliers
adminRouter.get('/suppliers', requireAdminAuth, async (_req, res) => {
  try {
    const prisma = getPrismaClient()
    const suppliers = await prisma.supplier.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { products: true, orders: true } } },
    })

    res.json(suppliers.map((s) => ({
      id: s.id,
      businessName: s.businessName,
      contactName: s.contactName,
      email: s.email,
      address: s.address,
      orgnr: s.orgnr,
      isVerified: s.isVerified,
      verificationStatus: s.verificationStatus,
      verificationRejectedReason: s.verificationRejectedReason,
      showInMarketplace: s.showInMarketplace,
      createdAt: s.createdAt,
      productCount: (s as any)._count.products,
      orderCount: (s as any)._count.orders,
    })))
  } catch (error) {
    console.error('Admin get suppliers failed', error)
    res.status(503).json({ message: 'Unable to load suppliers right now.' })
  }
})

// PATCH /api/admin/suppliers/:id — update verification status
adminRouter.patch('/suppliers/:id', requireAdminAuth, async (req, res) => {
  const supplierId = String(req.params.id ?? '').trim()
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}

  const validStatuses = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']
  const verificationStatus = typeof body.verificationStatus === 'string' && validStatuses.includes(body.verificationStatus)
    ? (body.verificationStatus as 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED')
    : null
  const verificationRejectedReason = typeof body.verificationRejectedReason === 'string'
    ? body.verificationRejectedReason.trim() || null
    : undefined
  const showInMarketplace = typeof body.showInMarketplace === 'boolean' ? body.showInMarketplace : undefined

  if (!supplierId) {
    res.status(400).json({ message: 'Supplier id is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const data: Record<string, unknown> = {}
    if (verificationStatus !== null) {
      data.verificationStatus = verificationStatus
      data.isVerified = verificationStatus === 'VERIFIED'
      if (verificationStatus !== 'REJECTED') data.verificationRejectedReason = null
    }
    if (verificationRejectedReason !== undefined) data.verificationRejectedReason = verificationRejectedReason
    if (showInMarketplace !== undefined) data.showInMarketplace = showInMarketplace

    const supplier = await prisma.supplier.update({ where: { id: supplierId }, data })
    res.json({ id: supplier.id, verificationStatus: supplier.verificationStatus, isVerified: supplier.isVerified, showInMarketplace: supplier.showInMarketplace })

    if (verificationStatus === 'VERIFIED') {
      sendSupplierVerificationApprovedEmail({ email: supplier.email, businessName: supplier.businessName })
        .catch(() => { /* already logged inside */ })
    } else if (verificationStatus === 'REJECTED') {
      sendSupplierVerificationRejectedEmail({ email: supplier.email, businessName: supplier.businessName, reason: supplier.verificationRejectedReason })
        .catch(() => { /* already logged inside */ })
    }
  } catch (error) {
    console.error('Admin update supplier failed', error)
    res.status(503).json({ message: 'Unable to update supplier right now.' })
  }
})

// DELETE /api/admin/suppliers/:id
adminRouter.delete('/suppliers/:id', requireAdminAuth, async (req, res) => {
  const supplierId = String(req.params.id ?? '').trim()
  if (!supplierId) {
    res.status(400).json({ message: 'Supplier id is required.' })
    return
  }
  try {
    const prisma = getPrismaClient()
    await prisma.supplier.delete({ where: { id: supplierId } })
    res.json({ ok: true })
  } catch (error) {
    console.error('Admin delete supplier failed', error)
    res.status(503).json({ message: 'Unable to delete supplier right now.' })
  }
})

// GET /api/admin/users
adminRouter.get('/users', requireAdminAuth, async (_req, res) => {
  try {
    const prisma = getPrismaClient()
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true } } },
    })

    res.json(users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      orderCount: (u as any)._count.orders,
    })))
  } catch (error) {
    console.error('Admin get users failed', error)
    res.status(503).json({ message: 'Unable to load users right now.' })
  }
})

// DELETE /api/admin/users/:id
adminRouter.delete('/users/:id', requireAdminAuth, async (req, res) => {
  const userId = String(req.params.id ?? '').trim()
  if (!userId) {
    res.status(400).json({ message: 'User id is required.' })
    return
  }
  try {
    const prisma = getPrismaClient()
    await prisma.user.delete({ where: { id: userId } })
    res.json({ ok: true })
  } catch (error) {
    console.error('Admin delete user failed', error)
    res.status(503).json({ message: 'Unable to delete user right now.' })
  }
})

// GET /api/admin/orders
adminRouter.get('/orders', requireAdminAuth, async (_req, res) => {
  try {
    const prisma = getPrismaClient()
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        buyer: { select: { firstName: true, lastName: true, email: true } },
        supplier: { select: { businessName: true } },
        _count: { select: { items: true } },
      },
    })

    res.json(orders.map((o) => ({
      id: o.id,
      status: o.status,
      total: o.total,
      createdAt: o.createdAt,
      buyer: o.buyer,
      supplierName: o.supplier.businessName,
      itemCount: (o as any)._count.items,
      woltStatus: o.woltStatus,
    })))
  } catch (error) {
    console.error('Admin get orders failed', error)
    res.status(503).json({ message: 'Unable to load orders right now.' })
  }
})

export default adminRouter
