/**
 * @module routes/deliveryPerson
 * Express router for delivery person order management.
 * All routes are mounted under /api/delivery-person.
 */
import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { requireDeliveryAuth } from '../middleware/requireDeliveryAuth.js'

const deliveryPersonRouter = Router()

const ORDER_INCLUDE = {
  supplier: { select: { id: true, businessName: true, address: true } },
  buyer: { select: { firstName: true, lastName: true, email: true } },
  deliveryAddress: { select: { address: true, phone: true } },
  items: {
    include: {
      product: { select: { name: true, unit: true } },
    },
  },
} as const

function formatOrder(o: {
  id: string
  status: string
  total: unknown
  createdAt: Date
  deliveryPersonId: string | null
  supplier: { id: string; businessName: string; address: string }
  buyer: { firstName: string; lastName: string; email: string }
  deliveryAddress: { address: string; phone: string | null } | null
  items: Array<{ id: string; quantity: number; unitPrice: unknown; product: { name: string; unit: string } }>
}) {
  return {
    id: o.id,
    status: o.status,
    total: Number(o.total),
    createdAt: o.createdAt,
    deliveryPersonId: o.deliveryPersonId,
    supplier: o.supplier,
    buyer: { firstName: o.buyer.firstName, lastName: o.buyer.lastName, email: o.buyer.email },
    deliveryAddress: o.deliveryAddress,
    items: o.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      productName: i.product.name,
      productUnit: i.product.unit,
    })),
  }
}

/**
 * List all CONFIRMED orders that have no delivery person assigned yet.
 *
 * @route {GET} /available-orders
 * @access delivery-authenticated, isActive required
 */
deliveryPersonRouter.get('/available-orders', requireDeliveryAuth, async (req, res) => {
  const deliveryPersonId = res.locals.deliveryPersonId as string
  try {
    const prisma = getPrismaClient()
    const person = await prisma.deliveryPerson.findUnique({ where: { id: deliveryPersonId } })
    if (!person || !person.isActive) {
      res.status(403).json({ message: 'Your account is pending admin approval.' })
      return
    }

    const orders = await prisma.order.findMany({
      where: { status: 'CONFIRMED', deliveryPersonId: null },
      orderBy: { createdAt: 'asc' },
      include: ORDER_INCLUDE,
    })

    res.json(orders.map(formatOrder))
  } catch (error) {
    console.error('Failed to list available orders', error)
    res.status(503).json({ message: 'Unable to load orders right now.' })
  }
})

/**
 * Claim an available order. Sets deliveryPersonId, status → IN_TRANSIT, woltStatus → PICKED_UP.
 *
 * @route {POST} /orders/:id/claim
 * @access delivery-authenticated, isActive required
 */
deliveryPersonRouter.post('/orders/:id/claim', requireDeliveryAuth, async (req, res) => {
  const deliveryPersonId = res.locals.deliveryPersonId as string
  const orderId = String(req.params.id ?? '').trim()

  try {
    const prisma = getPrismaClient()
    const person = await prisma.deliveryPerson.findUnique({ where: { id: deliveryPersonId } })
    if (!person || !person.isActive) {
      res.status(403).json({ message: 'Your account is pending admin approval.' })
      return
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      res.status(404).json({ message: 'Order not found.' })
      return
    }
    if (order.status !== 'CONFIRMED') {
      res.status(409).json({ message: 'Order is not available for pickup.' })
      return
    }
    if (order.deliveryPersonId !== null) {
      res.status(409).json({ message: 'Order has already been claimed by another delivery person.' })
      return
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPersonId,
        status: 'IN_TRANSIT',
        woltStatus: 'PICKED_UP',
      },
      include: ORDER_INCLUDE,
    })

    res.json(formatOrder(updated))
  } catch (error) {
    console.error('Failed to claim order', error)
    res.status(503).json({ message: 'Unable to claim order right now.' })
  }
})

/**
 * Mark an IN_TRANSIT order as delivered. Sets status → DELIVERED, woltStatus → DELIVERED.
 *
 * @route {POST} /orders/:id/complete
 * @access delivery-authenticated, isActive required
 */
deliveryPersonRouter.post('/orders/:id/complete', requireDeliveryAuth, async (req, res) => {
  const deliveryPersonId = res.locals.deliveryPersonId as string
  const orderId = String(req.params.id ?? '').trim()

  try {
    const prisma = getPrismaClient()
    const person = await prisma.deliveryPerson.findUnique({ where: { id: deliveryPersonId } })
    if (!person || !person.isActive) {
      res.status(403).json({ message: 'Your account is pending admin approval.' })
      return
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      res.status(404).json({ message: 'Order not found.' })
      return
    }
    if (order.deliveryPersonId !== deliveryPersonId) {
      res.status(403).json({ message: 'This order is not assigned to you.' })
      return
    }
    if (order.status !== 'IN_TRANSIT') {
      res.status(409).json({ message: 'Order is not in transit.' })
      return
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        woltStatus: 'DELIVERED',
      },
      include: ORDER_INCLUDE,
    })

    res.json(formatOrder(updated))
  } catch (error) {
    console.error('Failed to complete order', error)
    res.status(503).json({ message: 'Unable to complete order right now.' })
  }
})

/**
 * List all orders currently assigned to the authenticated delivery person.
 *
 * @route {GET} /my-orders
 * @access delivery-authenticated
 */
deliveryPersonRouter.get('/my-orders', requireDeliveryAuth, async (req, res) => {
  const deliveryPersonId = res.locals.deliveryPersonId as string
  try {
    const prisma = getPrismaClient()
    const orders = await prisma.order.findMany({
      where: { deliveryPersonId },
      orderBy: { updatedAt: 'desc' },
      include: ORDER_INCLUDE,
    })
    res.json(orders.map(formatOrder))
  } catch (error) {
    console.error('Failed to list my orders', error)
    res.status(503).json({ message: 'Unable to load orders right now.' })
  }
})

export default deliveryPersonRouter
