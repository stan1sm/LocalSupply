import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { planMealFromText } from '../lib/intentCartPlanner.js'

const cartRouter = Router()

type CartItemInput = {
  priceId: string
  quantity: number
}

type StoreDeliveryEstimate = {
  deliveryCost: number
  etaLabel: string
  etaMinutes: number
}

const storeDeliveryEstimates: Record<string, StoreDeliveryEstimate> = {
  MENY_NO: { deliveryCost: 49, etaMinutes: 45, etaLabel: '45 mins' },
  JOKER_NO: { deliveryCost: 59, etaMinutes: 90, etaLabel: '1-2 hours' },
  SPAR_NO: { deliveryCost: 55, etaMinutes: 60, etaLabel: '1 hour' },
  COOP_NO: { deliveryCost: 49, etaMinutes: 60, etaLabel: '1 hour' },
  ODA_NO: { deliveryCost: 0, etaMinutes: 120, etaLabel: '1-2 hours' },
}

const defaultDeliveryEstimate: StoreDeliveryEstimate = {
  deliveryCost: 59,
  etaMinutes: 120,
  etaLabel: '1-2 hours',
}

function getDeliveryEstimate(storeCode: string): StoreDeliveryEstimate {
  return storeDeliveryEstimates[storeCode] ?? defaultDeliveryEstimate
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  if (value && typeof value === 'object') {
    const candidate = value as { valueOf?: () => unknown; toString?: () => string }
    if (typeof candidate.valueOf === 'function') {
      const n = candidate.valueOf()
      if (typeof n === 'number' && Number.isFinite(n)) return n
    }
    if (typeof candidate.toString === 'function') {
      const s = candidate.toString()
      if (s && s.trim().length > 0) {
        const n = Number(s.replace(',', '.'))
        return Number.isFinite(n) ? n : null
      }
    }
  }
  return null
}

cartRouter.post('/match', async (req, res) => {
  const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items : []

  const validItems: CartItemInput[] = rawItems
    .filter((item): item is { priceId: string; quantity: number } => {
      const record = item as Record<string, unknown>
      return typeof record.priceId === 'string' && record.priceId.length > 0 && typeof record.quantity === 'number' && record.quantity > 0
    })
    .map((item) => ({ priceId: item.priceId, quantity: item.quantity }))

  if (validItems.length === 0) {
    res.status(400).json({ message: 'Cart is empty.' })
    return
  }

  try {
    const prisma = getPrismaClient()

    const cartPriceRows = await prisma.catalogProductPrice.findMany({
      where: { id: { in: validItems.map((i) => i.priceId) } },
      select: { id: true, catalogProductId: true },
    })

    const catalogProductIds = [...new Set(cartPriceRows.map((row) => row.catalogProductId))]

    if (catalogProductIds.length === 0) {
      res.status(200).json({ bestMatch: null, savings: 0, stores: [], totalCartItems: validItems.length })
      return
    }

    const quantityByProductId = new Map<string, number>()
    for (const cartRow of cartPriceRows) {
      const cartItem = validItems.find((i) => i.priceId === cartRow.id)
      if (cartItem) {
        quantityByProductId.set(cartRow.catalogProductId, cartItem.quantity)
      }
    }

    const allPrices = await prisma.catalogProductPrice.findMany({
      where: { catalogProductId: { in: catalogProductIds } },
      include: { catalogProduct: true },
    })

    const storeMap = new Map<
      string,
      {
        items: {
          brand: string | null
          catalogProductId: string
          imageUrl: string | null
          lineTotal: number
          name: string
          quantity: number
          unitPrice: number
        }[]
        itemsAvailable: number
        storeCode: string
        storeName: string
        subtotal: number
      }
    >()

    for (const priceRow of allPrices) {
      const quantity = quantityByProductId.get(priceRow.catalogProductId)
      if (!quantity) continue

      const unitPrice = asNumber(priceRow.currentPrice)
      if (unitPrice === null || unitPrice <= 0) continue

      const lineTotal = unitPrice * quantity

      if (!storeMap.has(priceRow.storeCode)) {
        storeMap.set(priceRow.storeCode, {
          storeCode: priceRow.storeCode,
          storeName: priceRow.storeName,
          items: [],
          subtotal: 0,
          itemsAvailable: 0,
        })
      }

      const store = storeMap.get(priceRow.storeCode)!
      store.items.push({
        catalogProductId: priceRow.catalogProductId,
        name: priceRow.catalogProduct.name,
        brand: priceRow.catalogProduct.brand,
        imageUrl: priceRow.catalogProduct.imageUrl,
        unitPrice,
        quantity,
        lineTotal,
      })
      store.subtotal += lineTotal
      store.itemsAvailable += 1
    }

    const totalRequested = catalogProductIds.length

    const rankedStores = Array.from(storeMap.values())
      .map((store) => {
        const delivery = getDeliveryEstimate(store.storeCode)
        return {
          storeCode: store.storeCode,
          storeName: store.storeName,
          itemsAvailable: store.itemsAvailable,
          itemsRequested: totalRequested,
          items: store.items,
          subtotal: Math.round(store.subtotal * 100) / 100,
          deliveryCost: delivery.deliveryCost,
          total: Math.round((store.subtotal + delivery.deliveryCost) * 100) / 100,
          eta: delivery.etaLabel,
          etaMinutes: delivery.etaMinutes,
        }
      })
      .filter((store) => store.itemsAvailable > 0)
      .sort((a, b) => {
        if (a.itemsAvailable !== b.itemsAvailable) return b.itemsAvailable - a.itemsAvailable
        return a.total - b.total
      })

    const bestMatch = rankedStores[0] ?? null
    const savings =
      bestMatch && rankedStores.length > 1
        ? Math.round(((rankedStores[rankedStores.length - 1]?.total ?? 0) - bestMatch.total) * 100) / 100
        : 0

    res.status(200).json({
      bestMatch,
      savings,
      stores: rankedStores,
      totalCartItems: validItems.length,
    })
  } catch (error) {
    console.error('Cart match failed', error)
    res.status(503).json({ message: 'Unable to match cart right now.' })
  }
})

cartRouter.post('/intent', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  const language = req.body?.language === 'no' ? 'no' : 'en'
  const people = typeof req.body?.people === 'number' && Number.isFinite(req.body.people) && req.body.people > 0 ? req.body.people : undefined

  if (!text) {
    res.status(400).json({ message: 'Text is required.' })
    return
  }

  try {
    const mealPlan = await planMealFromText(text, language)
    const prisma = getPrismaClient()

    const slots = mealPlan.slots
    if (slots.length === 0) {
      res
        .status(200)
        .json({ items: [], explanation: ['Could not identify specific ingredients from your request.'], storeChoice: null, totalPrice: 0 })
      return
    }

    const ingredients: {
      catalogProductId: string
      name: string
      storeCode: string
      storeName: string
      unitPrice: number
      quantity: number
    }[] = []

    for (const slot of slots) {
      const tags = Array.isArray(slot.tags)
        ? slot.tags
            .map((tag) => String(tag ?? '').trim())
            .filter((tag) => tag.length >= 2)
        : []

      if (tags.length === 0) {
        continue
      }

      let bestMatch:
        | {
            catalogProductId: string
            name: string
            storeCode: string
            storeName: string
            unitPrice: number
          }
        | null = null

      for (const tag of tags) {
        try {
          const rows = await prisma.catalogProductPrice.findMany({
            where: {
              currentPrice: { not: null },
              catalogProduct: {
                OR: [
                  { name: { contains: tag, mode: 'insensitive' } },
                  { brand: { contains: tag, mode: 'insensitive' } },
                  { category: { contains: tag, mode: 'insensitive' } },
                ],
              },
            },
            include: { catalogProduct: true },
            orderBy: [{ currentPrice: 'asc' }],
            take: 5,
          })

          for (const row of rows) {
            const unitPrice = Number(row.currentPrice)
            if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue

            if (!bestMatch || unitPrice < bestMatch.unitPrice) {
              bestMatch = {
                catalogProductId: row.catalogProductId,
                name: row.catalogProduct.name,
                storeCode: row.storeCode,
                storeName: row.storeName,
                unitPrice,
              }
            }
          }
        } catch (error) {
          console.error(`Intent cart search failed for tag "${tag}"`, error)
        }
      }

      if (!bestMatch) {
        continue
      }

      const baseQuantity = slot.required ? 1 : 0.5
      const quantityMultiplier = people ?? mealPlan.people
      const quantity = Math.max(1, Math.round(baseQuantity * quantityMultiplier * 0.5))

      ingredients.push({
        catalogProductId: bestMatch.catalogProductId,
        name: bestMatch.name,
        storeCode: bestMatch.storeCode,
        storeName: bestMatch.storeName,
        unitPrice: bestMatch.unitPrice,
        quantity,
      })
    }

    if (!ingredients.length) {
      res.status(200).json({ items: [], explanation: ['Could not find matching products in the catalog.'], storeChoice: null, totalPrice: 0 })
      return
    }

    const itemsByStore = new Map<
      string,
      {
        storeCode: string
        storeName: string
        items: {
          catalogProductId: string
          name: string
          unitPrice: number
          quantity: number
          lineTotal: number
        }[]
        subtotal: number
      }
    >()

    for (const ingredient of ingredients) {
      if (!itemsByStore.has(ingredient.storeCode)) {
        itemsByStore.set(ingredient.storeCode, {
          storeCode: ingredient.storeCode,
          storeName: ingredient.storeName,
          items: [],
          subtotal: 0,
        })
      }
      const store = itemsByStore.get(ingredient.storeCode)!
      const lineTotal = ingredient.unitPrice * ingredient.quantity
      store.items.push({
        catalogProductId: ingredient.catalogProductId,
        name: ingredient.name,
        unitPrice: ingredient.unitPrice,
        quantity: ingredient.quantity,
        lineTotal,
      })
      store.subtotal += lineTotal
    }

    const storesWithDelivery = Array.from(itemsByStore.values()).map((store) => {
      const delivery = getDeliveryEstimate(store.storeCode)
      const total = Math.round((store.subtotal + delivery.deliveryCost) * 100) / 100
      return {
        storeCode: store.storeCode,
        storeName: store.storeName,
        items: store.items,
        subtotal: Math.round(store.subtotal * 100) / 100,
        deliveryCost: delivery.deliveryCost,
        total,
        eta: delivery.etaLabel,
        etaMinutes: delivery.etaMinutes,
      }
    })

    if (!storesWithDelivery.length) {
      res.status(200).json({ items: [], explanation: ['Could not find a store that can fulfill this meal.'], storeChoice: null, totalPrice: 0 })
      return
    }

    let bestStore: (typeof storesWithDelivery)[number] | null = null
    for (const store of storesWithDelivery) {
      if (!bestStore || store.total < bestStore.total) {
        bestStore = store
      }
    }

    if (!bestStore) {
      res.status(200).json({ items: [], explanation: ['Could not find a store that can fulfill this meal.'], storeChoice: null, totalPrice: 0 })
      return
    }

    const explanation: string[] = [
      `Planned a "${mealPlan.mealType}" meal for ${mealPlan.people} people.`,
      `Chose store ${bestStore.storeName} as the cheapest option including delivery.`,
    ]

    if (mealPlan.notes) {
      explanation.push(`Notes: ${mealPlan.notes}`)
    }

    res.status(200).json({
      items: bestStore.items.map((item) => ({
        catalogProductId: item.catalogProductId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      explanation,
      storeChoice: {
        storeCode: bestStore.storeCode,
        storeName: bestStore.storeName,
        subtotal: bestStore.subtotal,
        deliveryCost: bestStore.deliveryCost,
        total: bestStore.total,
        eta: bestStore.eta,
        etaMinutes: bestStore.etaMinutes,
      },
      totalPrice: bestStore.total,
    })
  } catch (error) {
    console.error('Intent cart planning failed', error)
    res.status(503).json({ message: 'Unable to plan cart right now.' })
  }
})

export default cartRouter
