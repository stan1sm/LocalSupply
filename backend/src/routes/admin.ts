import { Router } from 'express'
import { sendVerificationApproved, sendVerificationRejected } from '../lib/email.js'
import { prisma } from '../lib/prisma.js'

type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'
const VALID_STATUSES = new Set<string>(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'])

const router = Router()

// GET /admin/suppliers?status=PENDING
router.get('/suppliers', async (req, res) => {
  const rawStatus = req.query['status']
  const status =
    typeof rawStatus === 'string' && VALID_STATUSES.has(rawStatus)
      ? (rawStatus as VerificationStatus)
      : undefined

  const suppliers = await prisma.supplier.findMany({
    where: status ? { verificationStatus: status } : undefined,
    select: {
      id: true,
      businessName: true,
      contactName: true,
      email: true,
      phoneNumber: true,
      address: true,
      verificationStatus: true,
      verificationRejectedReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  res.json(suppliers)
})

// POST /admin/suppliers/:id/approve
router.post('/suppliers/:id/approve', async (req, res) => {
  const { id } = req.params

  const supplier = await prisma.supplier.findUnique({ where: { id } })
  if (!supplier) {
    res.status(404).json({ error: 'Supplier not found' })
    return
  }

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      verificationStatus: 'VERIFIED' as const,
      verificationRejectedReason: null,
    },
    select: {
      id: true,
      businessName: true,
      email: true,
      verificationStatus: true,
    },
  })

  await sendVerificationApproved(updated.email, updated.businessName)

  res.json(updated)
})

// POST /admin/suppliers/:id/reject
router.post('/suppliers/:id/reject', async (req, res) => {
  const body = req.body as { reason?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (!reason) {
    res.status(400).json({ error: 'A rejection reason is required' })
    return
  }

  if (reason.length > 500) {
    res.status(400).json({ error: 'Reason must be 500 characters or fewer' })
    return
  }

  const { id } = req.params

  const supplier = await prisma.supplier.findUnique({ where: { id } })
  if (!supplier) {
    res.status(404).json({ error: 'Supplier not found' })
    return
  }

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      verificationStatus: 'REJECTED' as const,
      verificationRejectedReason: reason,
    },
    select: {
      id: true,
      businessName: true,
      email: true,
      verificationStatus: true,
      verificationRejectedReason: true,
    },
  })

  await sendVerificationRejected(updated.email, updated.businessName, reason)

  res.json(updated)
})

export default router
