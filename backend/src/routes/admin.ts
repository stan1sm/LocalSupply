/**
 * @module routes/admin
 * Express router for admin panel operations including authentication,
 * supplier verification management, user management, and order overview.
 * All routes are mounted under /api/admin.
 */

import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signAdminToken } from '../lib/jwt.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'
import { sendSupplierVerificationApprovedEmail, sendSupplierVerificationRejectedEmail } from '../lib/email.js'
import { MARKETPLACE_SUPPLIER_EMAIL } from '../lib/marketplaceSupplier.js'

/**
 * Express router providing admin panel endpoints.
 */
const adminRouter = Router()

/**
 * Authenticate an admin user and return a signed JWT token.
 * The token must be passed as a Bearer token in the Authorization header
 * for all subsequent admin-protected routes.
 *
 * @route {POST} /login
 * @access {public}
 * @param req.body.email    - Admin account email address.
 * @param req.body.password - Admin account password.
 */
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

/**
 * Bootstrap the first admin account. Succeeds only when no admin record
 * exists in the database; returns 409 Conflict if one is already present.
 * This endpoint should be called once during initial deployment and is not
 * protected by admin authentication.
 *
 * @route {POST} /seed
 * @access {public}
 * @param req.body.email    - Email address for the new admin account.
 * @param req.body.password - Password for the new admin account.
 * @param req.body.name     - Display name for the admin (defaults to "Admin").
 */
adminRouter.post('/seed', async (req, res) => {
  const seedSecret = process.env.ADMIN_SEED_SECRET?.trim()
  if (!seedSecret) {
    res.status(403).json({ message: 'Seed endpoint is disabled. Set ADMIN_SEED_SECRET to enable it.' })
    return
  }
  const providedSecret = req.get('x-seed-secret')?.trim() ?? ''
  if (providedSecret !== seedSecret) {
    res.status(403).json({ message: 'Invalid seed secret.' })
    return
  }

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
    const passwordHash = await hashPassword(password)
    const admin = await prisma.$transaction(async (tx) => {
      const existing = await tx.admin.findFirst()
      if (existing) return null
      return tx.admin.create({ data: { email, name, passwordHash } })
    }, { isolationLevel: 'Serializable' })

    if (!admin) {
      res.status(409).json({ message: 'Admin already exists. Use login.' })
      return
    }
    res.status(201).json({ admin: { id: admin.id, email: admin.email, name: admin.name } })
  } catch (error) {
    console.error('Admin seed failed', error)
    res.status(503).json({ message: 'Unable to create admin right now.' })
  }
})

/**
 * Retrieve all supplier accounts ordered by registration date (newest first).
 * Each entry includes aggregated product and order counts.
 *
 * @route {GET} /suppliers
 * @access {authenticated}
 */
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
      productCount: s._count.products,
      orderCount: s._count.orders,
    })))
  } catch (error) {
    console.error('Admin get suppliers failed', error)
    res.status(503).json({ message: 'Unable to load suppliers right now.' })
  }
})

/**
 * Update a supplier's verification status and/or marketplace visibility.
 * When the status is set to VERIFIED or REJECTED, a transactional email is
 * fired to the supplier after the database update completes. Setting
 * verificationStatus to VERIFIED also sets the isVerified flag to true and
 * clears any existing rejection reason.
 *
 * @route {PATCH} /suppliers/:id
 * @access {authenticated}
 * @param req.params.id                           - Supplier record ID.
 * @param req.body.verificationStatus             - New status: UNVERIFIED | PENDING | VERIFIED | REJECTED.
 * @param req.body.verificationRejectedReason     - Reason text shown to the supplier on rejection (optional).
 * @param req.body.showInMarketplace              - Whether the supplier appears in the public marketplace (optional).
 */
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

/**
 * Permanently delete a supplier account and all its associated data.
 * This action is irreversible.
 *
 * @route {DELETE} /suppliers/:id
 * @access {authenticated}
 * @param req.params.id - Supplier record ID.
 */
adminRouter.delete('/suppliers/:id', requireAdminAuth, async (req, res) => {
  const supplierId = String(req.params.id ?? '').trim()
  if (!supplierId) {
    res.status(400).json({ message: 'Supplier id is required.' })
    return
  }
  try {
    const prisma = getPrismaClient()
    // onDelete: Restrict on Order→Supplier and OrderItem→Product means we must
    // delete order items and orders before deleting the supplier and their products.
    await prisma.$transaction(async (tx) => {
      const supplierProducts = await tx.product.findMany({
        where: { supplierId },
        select: { id: true },
      })
      const productIds = supplierProducts.map((p) => p.id)
      if (productIds.length > 0) {
        await tx.orderItem.deleteMany({ where: { productId: { in: productIds } } })
      }
      await tx.order.deleteMany({ where: { supplierId } })
      await tx.supplier.delete({ where: { id: supplierId } })
    })
    res.json({ ok: true })
  } catch (error) {
    console.error('Admin delete supplier failed', error)
    res.status(503).json({ message: 'Unable to delete supplier right now.' })
  }
})

/**
 * Retrieve all buyer/user accounts ordered by registration date (newest first).
 * Each entry includes an aggregated order count.
 *
 * @route {GET} /users
 * @access {authenticated}
 */
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
      orderCount: u._count.orders,
    })))
  } catch (error) {
    console.error('Admin get users failed', error)
    res.status(503).json({ message: 'Unable to load users right now.' })
  }
})

/**
 * Permanently delete a buyer/user account and all its associated data.
 * This action is irreversible.
 *
 * @route {DELETE} /users/:id
 * @access {authenticated}
 * @param req.params.id - User record ID.
 */
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

/**
 * Retrieve the 200 most recent orders across all suppliers, ordered by
 * creation date (newest first). Each entry includes buyer details,
 * supplier name, item count, and the current Wolt delivery status.
 *
 * @route {GET} /orders
 * @access {authenticated}
 */
adminRouter.get('/orders', requireAdminAuth, async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? ''), 10) || 200, 1000)
  const offset = parseInt(String(req.query.offset ?? ''), 10) || 0
  try {
    const prisma = getPrismaClient()
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
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
      itemCount: o._count.items,
      woltStatus: o.woltStatus,
    })))
  } catch (error) {
    console.error('Admin get orders failed', error)
    res.status(503).json({ message: 'Unable to load orders right now.' })
  }
})

adminRouter.get('/products', requireAdminAuth, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : ''
  const limit = Math.min(parseInt(String(req.query.limit ?? ''), 10) || 200, 1000)
  const offset = parseInt(String(req.query.offset ?? ''), 10) || 0
  try {
    const prisma = getPrismaClient()
    const approvalFilter = status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
      ? (status as 'PENDING' | 'APPROVED' | 'REJECTED')
      : null
    // Kassal catalog checkout creates Product stubs under the synthetic marketplace supplier;
    // those are not supplier-submitted listings and must not appear in the moderation queue.
    const where =
      approvalFilter === 'PENDING'
        ? { approvalStatus: 'PENDING' as const, supplier: { email: { not: MARKETPLACE_SUPPLIER_EMAIL } } }
        : approvalFilter
          ? { approvalStatus: approvalFilter }
          : {}
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { supplier: { select: { id: true, businessName: true } } },
      take: limit,
      skip: offset,
    })
    res.json(products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      unit: p.unit,
      price: Number(p.price),
      imageUrl: p.imageUrl,
      approvalStatus: p.approvalStatus,
      createdAt: p.createdAt,
      supplier: (p as typeof p & { supplier: { id: string; businessName: string } }).supplier,
    })))
  } catch (error) {
    console.error('Admin get products failed', error)
    res.status(503).json({ message: 'Unable to load products right now.' })
  }
})

adminRouter.patch('/products/:productId/approve', requireAdminAuth, async (req, res) => {
  const productId = String(req.params['productId'] ?? '')
  try {
    const prisma = getPrismaClient()
    await prisma.product.update({ where: { id: productId }, data: { approvalStatus: 'APPROVED' } })
    res.json({ ok: true })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ message: 'Product not found.' })
      return
    }
    console.error('Admin approve product failed', error)
    res.status(503).json({ message: 'Unable to approve product right now.' })
  }
})

adminRouter.patch('/products/:productId/reject', requireAdminAuth, async (req, res) => {
  const productId = String(req.params['productId'] ?? '')
  try {
    const prisma = getPrismaClient()
    await prisma.product.update({ where: { id: productId }, data: { approvalStatus: 'REJECTED' } })
    res.json({ ok: true })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ message: 'Product not found.' })
      return
    }
    console.error('Admin reject product failed', error)
    res.status(503).json({ message: 'Unable to reject product right now.' })
  }
})

export default adminRouter
