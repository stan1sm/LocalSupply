import { Router } from 'express'
import { sendBuyerOrderStatusEmail, sendSupplierOrderEmail } from '../lib/email.js'
import { getPrismaClient } from '../lib/prisma.js'
import type { OrderStatus } from '../generated/prisma/enums.js'
import { createDelivery, parseAddressString } from '../lib/woltDrive.js'
import { requireSupplierAuth } from '../middleware/requireSupplierAuth.js'

const ordersRouter = Router()

type CreateOrderItemInput = {
  productId?: string | undefined
  name?: string | undefined
  unit?: string | undefined
  unitPrice?: number | undefined
  quantity: number
}

ordersRouter.post('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}

  const buyerId = typeof body.buyerId === 'string' ? body.buyerId.trim() : ''
  const supplierIdInput = typeof body.supplierId === 'string' ? body.supplierId.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const deliveryFee = typeof body.deliveryFee === 'number' && Number.isFinite(body.deliveryFee) ? body.deliveryFee : 0

  const rawItems: unknown[] = Array.isArray(body.items) ? body.items : []
  const items: CreateOrderItemInput[] = rawItems
    .map((item) => {
      const record = item as Record<string, unknown>
      const quantity = typeof record.quantity === 'number' && record.quantity > 0 ? record.quantity : 0
      const productId = typeof record.productId === 'string' && record.productId.length > 0 ? record.productId : undefined
      const name = typeof record.name === 'string' ? record.name.trim() : undefined
      const unit = typeof record.unit === 'string' ? record.unit.trim() : undefined
      const unitPrice =
        typeof record.unitPrice === 'number' && Number.isFinite(record.unitPrice) && record.unitPrice > 0
          ? record.unitPrice
          : undefined

      return {
        productId,
        name,
        unit,
        unitPrice,
        quantity,
      }
    })
    .filter((item) => {
      if (!item.quantity || item.quantity <= 0) return false
      if (item.productId) return true
      return Boolean(item.name && item.unitPrice && item.unitPrice > 0)
    })

  const errors: Record<string, string> = {}

  if (!buyerId) {
    errors.buyerId = 'buyerId is required.'
  }

  if (items.length === 0) {
    errors.items = 'Provide at least one order item.'
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ message: 'Validation failed.', errors })
    return
  }

  try {
    const prisma = getPrismaClient()
    const [buyer] = await Promise.all([prisma.user.findUnique({ where: { id: buyerId } })])

    if (!buyer) {
      res.status(404).json({ message: 'Buyer not found.' })
      return
    }

    // Resolve supplier. If a specific supplierId is provided and found, use it.
    // Otherwise fall back to a virtual "Marketplace" supplier for grocery orders.
    const marketplaceEmail = 'marketplace@localsupply.local'
    let supplier =
      supplierIdInput.length > 0
        ? await prisma.supplier.findUnique({ where: { id: supplierIdInput } })
        : null

    if (!supplier) {
      supplier = await prisma.supplier.upsert({
        where: { email: marketplaceEmail },
        update: {},
        create: {
          businessName: 'Marketplace Store',
          contactName: 'Marketplace',
          phoneNumber: '00000000',
          email: marketplaceEmail,
          passwordHash: 'not-used',
          address: 'Virtual marketplace',
        },
      })
    }

    const existingProductIds = items
      .map((item) => item.productId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const existingProducts =
      existingProductIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: existingProductIds }, supplierId: supplier.id },
          })
        : []

    const productById = new Map(existingProducts.map((product) => [product.id, product]))

    let subtotal = 0
    const orderItemsData: { productId: string; quantity: number; unitPrice: number }[] = []

    for (const item of items) {
      let product = item.productId ? productById.get(item.productId) : null

      if (!product && item.name && item.unitPrice && item.unitPrice > 0) {
        product = await prisma.product.create({
          data: {
            supplierId: supplier.id,
            name: item.name,
            description: null,
            unit: item.unit && item.unit.length > 0 ? item.unit : 'unit',
            price: item.unitPrice,
            stockQty: 0,
          },
        })
        productById.set(product.id, product)
      }

      if (!product) continue

      const unitPrice = Number(product.price)
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue

      const lineTotal = unitPrice * item.quantity
      subtotal += lineTotal

      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
      })
    }

    if (orderItemsData.length === 0) {
      res.status(400).json({ message: 'No valid products found for this supplier.' })
      return
    }

    const roundedSubtotal = Math.round(subtotal * 100) / 100
    const roundedDeliveryFee = Math.max(0, Math.round(deliveryFee * 100) / 100)
    const total = Math.round((roundedSubtotal + roundedDeliveryFee) * 100) / 100

    const deliveryAddressId = typeof body.deliveryAddressId === 'string' && body.deliveryAddressId.trim().length > 0
      ? body.deliveryAddressId.trim()
      : null

    // Verify the deliveryAddressId belongs to this buyer if provided
    let resolvedAddressPhone: string | null = null
    if (deliveryAddressId) {
      const addr = await prisma.userAddress.findUnique({ where: { id: deliveryAddressId } })
      if (!addr || addr.userId !== buyerId) {
        res.status(400).json({ message: 'Invalid deliveryAddressId.' })
        return
      }
      resolvedAddressPhone = addr.phone
    }

    const order = await prisma.order.create({
      data: {
        buyerId,
        supplierId: supplier.id,
        subtotal: roundedSubtotal,
        deliveryFee: roundedDeliveryFee,
        total,
        notes: notes || null,
        ...(deliveryAddressId ? { deliveryAddressId } : {}),
        items: {
          createMany: {
            data: orderItemsData,
          },
        },
      },
      include: {
        items: { include: { product: true } },
        supplier: true,
        buyer: true,
      },
    })

    // Attempt Wolt delivery creation (best-effort — order is already saved)
    let woltDeliveryId: string | null = null
    let woltTrackingUrl: string | null = null
    let woltStatus: string | null = null

    const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : ''
    const pickupAddress = supplier.address ?? (process.env.WOLT_DEFAULT_PICKUP_ADDRESS ?? '')

    if (deliveryAddress && pickupAddress) {
      const woltResult = await createDelivery({
        orderId: order.id,
        pickup: {
          ...parseAddressString(pickupAddress),
          contactName: supplier.businessName,
          contactPhone: supplier.phoneNumber ?? '00000000',
        },
        dropoff: {
          ...parseAddressString(deliveryAddress),
          contactName: `${order.buyer.firstName} ${order.buyer.lastName}`,
          contactPhone: resolvedAddressPhone ?? '00000000',
        },
        parcels: [{ description: `Order #${order.id.slice(-6)} — ${orderItemsData.length} items`, count: orderItemsData.length }],
        orderReference: order.id,
      })

      if (woltResult.ok) {
        woltDeliveryId = woltResult.deliveryId
        woltTrackingUrl = woltResult.trackingUrl
        woltStatus = woltResult.status

        await prisma.order.update({
          where: { id: order.id },
          data: { woltDeliveryId, woltTrackingUrl, woltStatus },
        })
      } else {
        console.warn(`Wolt delivery creation failed for order ${order.id}: ${woltResult.message}`)
      }
    }

    res.status(201).json({
      id: order.id,
      status: order.status,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      notes: order.notes,
      woltTrackingUrl,
      woltStatus,
      createdAt: order.createdAt,
      supplier: {
        id: order.supplier.id,
        businessName: order.supplier.businessName,
        address: order.supplier.address,
      },
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        unit: item.product.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    })

    // Fire-and-forget — doesn't affect the order response
    sendSupplierOrderEmail({
      supplierEmail: order.supplier.email,
      supplierName: order.supplier.businessName,
      orderId: order.id,
      buyerName: `${order.buyer.firstName} ${order.buyer.lastName}`,
      deliveryAddress: deliveryAddress || 'Not specified',
      items: order.items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      notes: order.notes,
    }).catch(() => { /* already logged inside sendSupplierOrderEmail */ })
  } catch (error) {
    console.error('Failed to create order', error)
    res.status(503).json({ message: 'Unable to create order right now.' })
  }
})

ordersRouter.get('/buyer/:buyerId', async (req, res) => {
  const buyerId = String(req.params.buyerId ?? '').trim()

  if (!buyerId) {
    res.status(400).json({ message: 'buyerId is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const orders = await prisma.order.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        supplier: true,
      },
    })

    res.status(200).json(
      orders.map((order) => ({
        id: order.id,
        status: order.status,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        notes: order.notes,
        woltTrackingUrl: order.woltTrackingUrl ?? null,
        woltStatus: order.woltStatus ?? null,
        createdAt: order.createdAt,
        supplier: {
          id: order.supplier.id,
          businessName: order.supplier.businessName,
          address: order.supplier.address,
        },
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      })),
    )
  } catch (error) {
    console.error('Failed to load buyer orders', error)
    res.status(503).json({ message: 'Unable to load orders right now.' })
  }
})

ordersRouter.get('/supplier/:supplierId', async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()

  if (!supplierId) {
    res.status(400).json({ message: 'supplierId is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const orders = await prisma.order.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        buyer: true,
      },
    })

    res.status(200).json(
      orders.map((order) => ({
        id: order.id,
        status: order.status,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        notes: order.notes,
        createdAt: order.createdAt,
        buyer: {
          id: order.buyer.id,
          firstName: order.buyer.firstName,
          lastName: order.buyer.lastName,
          email: order.buyer.email,
        },
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      })),
    )
  } catch (error) {
    console.error('Failed to load supplier orders', error)
    res.status(503).json({ message: 'Unable to load orders right now.' })
  }
})

ordersRouter.patch('/:id/status', requireSupplierAuth, async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const supplierId = res.locals.supplierId as string
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : ''

  // State machine for order progression.
  // IN_TRANSIT and DELIVERED will eventually be driven by Wolt webhook events;
  // until Wolt keys are active they remain manually advanceable by the supplier.
  const VALID_TRANSITIONS: Record<string, string[]> = {
    PENDING:    ['CONFIRMED', 'CANCELLED'],
    CONFIRMED:  ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['DELIVERED'],
  }

  const ALL_ALLOWED = new Set(Object.values(VALID_TRANSITIONS).flat())
  if (!ALL_ALLOWED.has(status)) {
    res.status(400).json({ message: 'Invalid status value.' })
    return
  }

  try {
    const prisma = getPrismaClient()
    const order = await prisma.order.findUnique({
      where: { id },
      include: { buyer: true, supplier: true },
    })

    if (!order || order.supplierId !== supplierId) {
      res.status(404).json({ message: 'Order not found.' })
      return
    }

    const allowed = VALID_TRANSITIONS[order.status] ?? []
    if (!allowed.includes(status)) {
      res.status(409).json({
        message: `Cannot move order from ${order.status} to ${status}.`,
      })
      return
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: status as OrderStatus },
    })

    res.json({ id: updated.id, status: updated.status })

    if (status === 'CONFIRMED' || status === 'CANCELLED') {
      sendBuyerOrderStatusEmail({
        buyerEmail: order.buyer.email,
        buyerName: `${order.buyer.firstName} ${order.buyer.lastName}`,
        orderId: order.id,
        status: status as 'CONFIRMED' | 'CANCELLED',
        supplierName: order.supplier.businessName,
        total: Number(order.total),
      }).catch(() => { /* already logged inside sendBuyerOrderStatusEmail */ })
    }
  } catch (error) {
    console.error('Order status update failed', error)
    res.status(503).json({ message: 'Unable to update order right now.' })
  }
})

export default ordersRouter

