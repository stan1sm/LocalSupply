import { Router } from 'express'
import { sendBuyerOrderStatusEmail, sendSupplierOrderEmail } from '../lib/email.js'
import { getPrismaClient } from '../lib/prisma.js'
import type { OrderStatus } from '../generated/prisma/enums.js'
import { createDelivery, parseAddressString } from '../lib/woltDrive.js'
import { requireSupplierAuth } from '../middleware/requireSupplierAuth.js'
import { requireBuyerAuth } from '../middleware/requireBuyerAuth.js'

const ordersRouter = Router()

type CreateOrderItemInput = {
  productId?: string | undefined
  catalogProductId?: string | undefined
  name?: string | undefined
  unit?: string | undefined
  unitPrice?: number | undefined
  quantity: number
}

ordersRouter.post('/', requireBuyerAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}

  const buyerId = res.locals.buyerId as string
  const supplierIdInput = typeof body.supplierId === 'string' ? body.supplierId.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const deliveryFee = typeof body.deliveryFee === 'number' && Number.isFinite(body.deliveryFee) ? body.deliveryFee : 0
  // storeCode is required when catalog items are included so prices can be validated server-side
  const storeCode = typeof body.storeCode === 'string' ? body.storeCode.trim() : ''
  const VALID_PAYMENT_METHODS = ['vipps', 'card', 'invoice'] as const
  type PaymentMethodValue = typeof VALID_PAYMENT_METHODS[number]
  const rawPaymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.trim() : ''
  const paymentMethod: PaymentMethodValue | null = (VALID_PAYMENT_METHODS as readonly string[]).includes(rawPaymentMethod)
    ? rawPaymentMethod as PaymentMethodValue
    : null

  const rawItems: unknown[] = Array.isArray(body.items) ? body.items : []
  const items: CreateOrderItemInput[] = rawItems
    .map((item) => {
      const record = item as Record<string, unknown>
      const quantity = typeof record.quantity === 'number' && record.quantity > 0 ? record.quantity : 0
      const productId = typeof record.productId === 'string' && record.productId.length > 0 ? record.productId : undefined
      const catalogProductId = typeof record.catalogProductId === 'string' && record.catalogProductId.length > 0 ? record.catalogProductId : undefined
      const name = typeof record.name === 'string' ? record.name.trim() : undefined
      const unit = typeof record.unit === 'string' ? record.unit.trim() : undefined

      return {
        productId,
        catalogProductId,
        name,
        unit,
        quantity,
      }
    })
    .filter((item) => {
      if (!item.quantity || item.quantity <= 0) return false
      if (item.productId) return true
      if (item.catalogProductId) return true
      return false
    })

  const errors: Record<string, string> = {}

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

    // Catalog price lookup — server validates price, client value is never trusted
    const catalogProductIds = items
      .map((item) => item.catalogProductId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const catalogPriceMap = new Map<string, number>()
    const catalogNameMap = new Map<string, string>()
    if (catalogProductIds.length > 0 && storeCode) {
      const catalogPrices = await prisma.catalogProductPrice.findMany({
        where: { catalogProductId: { in: catalogProductIds }, storeCode },
        include: { catalogProduct: { select: { name: true } } },
      })
      for (const cp of catalogPrices) {
        const price = Number(cp.currentPrice ?? cp.currentUnitPrice ?? 0)
        if (price > 0) {
          catalogPriceMap.set(cp.catalogProductId, price)
          catalogNameMap.set(cp.catalogProductId, cp.catalogProduct.name)
        }
      }
    }

    let subtotal = 0
    const orderItemsData: { productId: string; quantity: number; unitPrice: number }[] = []
    const stockDecrements: { id: string; qty: number }[] = []

    for (const item of items) {
      // Path 1: named Product (supplier-direct orders) — price comes from DB
      if (item.productId) {
        const product = productById.get(item.productId)
        if (!product) continue

        const unitPrice = Number(product.price)
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue

        subtotal += unitPrice * item.quantity
        orderItemsData.push({ productId: product.id, quantity: item.quantity, unitPrice })
        if (product.stockQty > 0) {
          stockDecrements.push({ id: product.id, qty: item.quantity })
        }
        continue
      }

      // Path 2: catalog item — look up authoritative price server-side, never trust client
      if (item.catalogProductId) {
        if (!storeCode) continue // storeCode required to resolve catalog price
        const unitPrice = catalogPriceMap.get(item.catalogProductId)
        if (!unitPrice) continue // product not found in this store's catalog

        // Upsert a thin Product record so OrderItem has a valid FK
        const catalogName = catalogNameMap.get(item.catalogProductId) ?? item.name ?? 'Catalog item'
        let product = await prisma.product.findFirst({
          where: { supplierId: supplier.id, name: catalogName },
        })
        if (!product) {
          product = await prisma.product.create({
            data: {
              supplierId: supplier.id,
              name: catalogName,
              description: null,
              unit: item.unit && item.unit.length > 0 ? item.unit : 'unit',
              price: unitPrice,
              stockQty: 0,
            },
          })
        }

        subtotal += unitPrice * item.quantity
        orderItemsData.push({ productId: product.id, quantity: item.quantity, unitPrice })
      }
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
        paymentMethod: paymentMethod || null,
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

    // Decrement stock for supplier-owned products (best-effort, floor at 0)
    if (stockDecrements.length > 0) {
      await Promise.all(
        stockDecrements.map(({ id, qty }) =>
          prisma.product.updateMany({
            where: { id, stockQty: { gt: 0 } },
            data: { stockQty: { decrement: qty } },
          }),
        ),
      )
    }

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

ordersRouter.get('/buyer/:buyerId', requireBuyerAuth, async (req, res) => {
  const buyerId = String(req.params.buyerId ?? '').trim()

  if (!buyerId || buyerId !== res.locals.buyerId) {
    res.status(403).json({ message: 'Forbidden.' })
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

ordersRouter.get('/supplier/:supplierId', requireSupplierAuth, async (req, res) => {
  const supplierId = String(req.params.supplierId ?? '').trim()

  if (!supplierId || supplierId !== res.locals.supplierId) {
    res.status(403).json({ message: 'Forbidden.' })
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
  // until Wolt keys are active all transitions remain manually advanceable by the supplier.
  const VALID_TRANSITIONS: Record<string, string[]> = {
    PENDING:    ['CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    CONFIRMED:  ['IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
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
      include: { buyer: true, supplier: true, items: { include: { product: true } } },
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
        ...(order.paymentMethod ? { paymentMethod: order.paymentMethod } : {}),
      }).catch(() => { /* already logged inside sendBuyerOrderStatusEmail */ })
    }
  } catch (error) {
    console.error('Order status update failed', error)
    res.status(503).json({ message: 'Unable to update order right now.' })
  }
})

export default ordersRouter

