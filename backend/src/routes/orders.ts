/**
 * @module routes/orders
 * Express router for order management. All routes are mounted under /api/orders.
 */

import { Router } from 'express'
import { sendBuyerOrderStatusEmail, sendSupplierOrderEmail } from '../lib/email.js'
import { getPrismaClient } from '../lib/prisma.js'
import type { OrderStatus } from '../generated/prisma/enums.js'
import { createDelivery, parseAddressString } from '../lib/woltDrive.js'
import { requireSupplierAuth } from '../middleware/requireSupplierAuth.js'
import { requireBuyerAuth } from '../middleware/requireBuyerAuth.js'

/** Express router providing order creation, retrieval, and status management endpoints. */
const ordersRouter = Router()

/**
 * Validated input shape for a single line item when creating an order.
 * Either `productId` (supplier-direct product) or `catalogProductId` (marketplace
 * catalog product) must be present; both may not be absent simultaneously.
 * @typedef {Object} CreateOrderItemInput
 * @property {string} [productId] - ID of an existing supplier-owned Product record.
 * @property {string} [catalogProductId] - ID of a CatalogProduct; requires `storeCode`
 *   on the parent request body so the server can look up the authoritative price.
 * @property {string} [name] - Optional display name override (used for catalog items
 *   when the catalog name is unavailable).
 * @property {string} [unit] - Unit label (e.g. "kg", "stk") for catalog items.
 * @property {number} [unitPrice] - Ignored by the server; price is always resolved
 *   from the database to prevent client-side price manipulation.
 * @property {number} quantity - Number of units ordered (must be > 0).
 */
type CreateOrderItemInput = {
  productId?: string | undefined
  catalogProductId?: string | undefined
  name?: string | undefined
  unit?: string | undefined
  unitPrice?: number | undefined
  quantity: number
}

/**
 * Creates a new order on behalf of the authenticated buyer.
 *
 * Two item path variants are supported in the same request:
 *  - **Supplier-direct** (`productId`): price is fetched from the Product record;
 *    stock is decremented best-effort (floored at 0, never goes negative).
 *  - **Catalog/marketplace** (`catalogProductId` + `storeCode`): the server looks up
 *    the authoritative price from CatalogProductPrice — client-supplied unit prices
 *    are never trusted. A thin Product record is upserted per catalog item so that
 *    OrderItem foreign keys remain valid.
 *
 * After the Order is persisted, two non-blocking side-effects are attempted:
 *  1. **Wolt Drive delivery**: if both `deliveryAddress` (request body) and the
 *     supplier's address are available, a delivery is created via the Wolt Drive API.
 *     The resulting `woltDeliveryId`, `woltTrackingUrl`, and `woltStatus` are stored
 *     on the order. Failure is logged as a warning and does not block the response.
 *  2. **Supplier email notification**: a new-order email is sent fire-and-forget to
 *     the supplier via `sendSupplierOrderEmail`. Errors are silently swallowed.
 *
 * When no explicit `supplierId` is provided, a virtual "Marketplace Store" supplier
 * is upserted automatically to handle grocery / catalog-only orders.
 *
 * @route {POST} /api/orders
 * @access {authenticated} Buyer JWT required (enforced by `requireBuyerAuth` middleware).
 * @param req.body.items {CreateOrderItemInput[]} Line items (at least one required).
 * @param req.body.supplierId {string} [optional] Supplier ID; defaults to virtual marketplace.
 * @param req.body.storeCode {string} [optional] Required when any item uses `catalogProductId`.
 * @param req.body.deliveryFee {number} [optional] Flat delivery fee in NOK (default 0).
 * @param req.body.notes {string} [optional] Free-text order notes.
 * @param req.body.paymentMethod {"vipps"|"card"|"invoice"} [optional] Payment method.
 * @param req.body.deliveryAddressId {string} [optional] ID of a saved UserAddress belonging
 *   to the buyer; used to populate the Wolt dropoff contact phone number.
 * @param req.body.deliveryAddress {string} [optional] Plain-text delivery address string
 *   passed to the Wolt Drive address parser for delivery creation.
 * @returns {201} Condensed order object with `id`, `status`, totals, `woltTrackingUrl`,
 *   `woltStatus`, supplier summary, and mapped line items.
 * @returns {400} When items array is empty, no valid products are resolved, or
 *   `deliveryAddressId` does not belong to the authenticated buyer.
 * @returns {404} When the authenticated buyer record is not found.
 * @returns {503} On unexpected database errors.
 */
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

/**
 * Returns all orders placed by the specified buyer, ordered newest-first.
 * The caller must be the buyer identified by `buyerId` — attempting to fetch
 * another buyer's orders returns 403 Forbidden.
 *
 * @route {GET} /api/orders/buyer/:buyerId
 * @access {authenticated} Buyer JWT required (enforced by `requireBuyerAuth` middleware).
 * @param req.params.buyerId {string} Must match the authenticated buyer's own ID.
 * @returns {200} Array of order objects including items (with product details),
 *   supplier summary, totals, Wolt tracking fields, and status.
 * @returns {403} When `buyerId` param does not match the JWT-authenticated buyer.
 * @returns {503} On unexpected database errors.
 */
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

/**
 * Returns all orders received by the specified supplier, ordered newest-first.
 * The caller must be the supplier identified by `supplierId` — attempting to fetch
 * another supplier's orders returns 403 Forbidden.
 *
 * @route {GET} /api/orders/supplier/:supplierId
 * @access {authenticated} Supplier JWT required (enforced by `requireSupplierAuth` middleware).
 * @param req.params.supplierId {string} Must match the authenticated supplier's own ID.
 * @returns {200} Array of order objects including items (with product details),
 *   buyer summary (id, name, email), totals, and status.
 * @returns {403} When `supplierId` param does not match the JWT-authenticated supplier.
 * @returns {503} On unexpected database errors.
 */
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

/**
 * Advances or cancels an order through the supplier-controlled status state machine.
 *
 * Allowed transitions:
 * ```
 * PENDING    → CONFIRMED | IN_TRANSIT | DELIVERED | CANCELLED
 * CONFIRMED  → IN_TRANSIT | DELIVERED | CANCELLED
 * IN_TRANSIT → DELIVERED | CANCELLED
 * ```
 * DELIVERED and CANCELLED are terminal states — no further transitions are permitted.
 * IN_TRANSIT and DELIVERED will eventually be driven automatically by Wolt webhook
 * events once Wolt keys are active; until then all transitions are manually advanceable
 * by the supplier.
 *
 * Side-effect: when the new status is `CONFIRMED` or `CANCELLED`, a buyer notification
 * email is sent fire-and-forget via `sendBuyerOrderStatusEmail`. Errors are silently
 * swallowed (already logged inside the email helper).
 *
 * @route {PATCH} /api/orders/:id/status
 * @access {authenticated} Supplier JWT required (enforced by `requireSupplierAuth` middleware).
 * @param req.params.id {string} The order ID.
 * @param req.body.status {string} Target status value (case-insensitive; normalised to uppercase).
 * @returns {200} `{ id, status }` — the updated order ID and new status string.
 * @returns {400} When the requested status value is not a recognised target state.
 * @returns {404} When the order does not exist or does not belong to the authenticated supplier.
 * @returns {409} When the current order status does not permit a transition to the requested status.
 * @returns {503} On unexpected database errors.
 */
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

