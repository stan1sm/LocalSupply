import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { planMealFromText } from '../lib/intentCartPlanner.js'
import { getEmbeddings } from '../lib/aiClient.js'

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

const DEFAULT_EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'

// Cached catalog categories with TTL to avoid re-querying every request.
let cachedCategories: string[] | null = null
let categoriesCachedAt = 0
const CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000

async function getCatalogCategories(prisma: any): Promise<string[]> {
  if (cachedCategories && Date.now() - categoriesCachedAt < CATEGORY_CACHE_TTL_MS) {
    return cachedCategories
  }
  const rows = await prisma.catalogProduct.findMany({
    select: { category: true },
    where: { category: { not: null } },
    distinct: ['category'],
  })
  const result: string[] = rows
    .map((r: { category: string | null }) => r.category)
    .filter((c: string | null): c is string => Boolean(c))
    .sort()
  cachedCategories = result
  categoriesCachedAt = Date.now()
  return result
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    normA += x * x
    normB += y * y
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
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

function formatUnitInfo(currentUnitPrice: number | null, currentUnitPriceUnit: string | null, fallbackUnit: string | null) {
  if (currentUnitPrice !== null && currentUnitPriceUnit) {
    return `${currentUnitPrice.toFixed(2)} kr/${currentUnitPriceUnit}`
  }
  return fallbackUnit
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
    const prisma = getPrismaClient()

    const catalogCategories = await getCatalogCategories(prisma)

    const mealPlan = await planMealFromText(text, language, catalogCategories)

    const slots = mealPlan.slots
    if (slots.length === 0) {
      res.status(200).json({
        items: [],
        explanation: ['Could not identify specific ingredients from your request.'],
        storeChoice: null,
        totalPrice: 0,
      })
      return
    }

    const quantityMultiplier = people ?? mealPlan.people

    const slotTags = slots.map((slot) =>
      Array.isArray(slot.tags)
        ? slot.tags.map((tag) => String(tag ?? '').trim()).filter((tag) => tag.length >= 2)
        : [],
    )

    // [Step 1] Batch-embed all slot queries in a single API call.
    const embeddingInputs = slots.map((slot, i) => {
      const tags = slotTags[i]!
      return tags.length > 0 ? `${slot.role} | ${tags.join(' ')}` : null
    })
    const nonNullInputs = embeddingInputs.filter((t): t is string => t !== null)
    let rawEmbeddings: number[][] = []
    try {
      rawEmbeddings = nonNullInputs.length > 0 ? await getEmbeddings(nonNullInputs) : []
    } catch {
      // Proceed without embeddings — text search still works.
    }
    const slotEmbeddings: (number[] | null)[] = []
    let embIdx = 0
    for (const input of embeddingInputs) {
      if (input !== null && embIdx < rawEmbeddings.length) {
        slotEmbeddings.push(rawEmbeddings[embIdx]!)
        embIdx++
      } else {
        slotEmbeddings.push(null)
      }
    }

    // [Step 2] Per slot: text search CatalogProduct (store-agnostic) for candidates.
    const slotCandidateProductIds: string[][] = await Promise.all(
      slotTags.map(async (tags) => {
        if (tags.length === 0) return []

        const orClauses = tags.flatMap((tag) => [
          { name: { contains: tag, mode: 'insensitive' as const } },
          { brand: { contains: tag, mode: 'insensitive' as const } },
          { category: { contains: tag, mode: 'insensitive' as const } },
        ])

        const rows = await prisma.catalogProduct.findMany({
          where: { OR: orClauses },
          select: { id: true },
          take: 60,
        })

        return rows.map((r) => r.id)
      }),
    )

    // [Step 3] Batch-fetch embeddings for all candidate product IDs in one query.
    const allCandidateIds = [...new Set(slotCandidateProductIds.flat())]
    const embeddingByProductId = new Map<string, number[]>()

    if (allCandidateIds.length > 0) {
      const embeddingRows = await (prisma as any).productEmbedding.findMany({
        where: {
          modelName: DEFAULT_EMBEDDING_MODEL,
          productId: { in: allCandidateIds },
        },
        select: { productId: true, vectorJson: true },
      })
      if (Array.isArray(embeddingRows)) {
        for (const row of embeddingRows) {
          const vec = row.vectorJson as unknown as number[]
          if (Array.isArray(vec) && vec.length > 0) embeddingByProductId.set(row.productId, vec)
        }
      }
    }

    // [Step 4] Rank candidates per slot by embedding similarity, keep top 10.
    const SIMILARITY_THRESHOLD = 0.20
    const TOP_K_PER_SLOT = 10

    const slotTopProductIds: string[][] = slots.map((_slot, slotIdx) => {
      const candidateIds = slotCandidateProductIds[slotIdx] ?? []
      const slotEmb = slotEmbeddings[slotIdx]

      if (!slotEmb || candidateIds.length === 0) return candidateIds.slice(0, TOP_K_PER_SLOT)

      const scored: { productId: string; similarity: number }[] = []
      for (const productId of candidateIds) {
        const vec = embeddingByProductId.get(productId)
        if (!vec) {
          scored.push({ productId, similarity: 0 })
          continue
        }
        scored.push({ productId, similarity: cosineSimilarity(slotEmb, vec) })
      }

      scored.sort((a, b) => b.similarity - a.similarity)

      const filtered = scored.filter((s) => s.similarity >= SIMILARITY_THRESHOLD)
      const result = filtered.length > 0 ? filtered : scored

      return result.slice(0, TOP_K_PER_SLOT).map((s) => s.productId)
    })

    // [Step 5] Batch-fetch all prices for top products across all stores.
    const allTopProductIds = [...new Set(slotTopProductIds.flat())]

    const allPriceRows = allTopProductIds.length > 0
      ? await prisma.catalogProductPrice.findMany({
          where: {
            catalogProductId: { in: allTopProductIds },
            currentPrice: { not: null },
          },
          include: { catalogProduct: true },
        })
      : []

    // Index prices by (catalogProductId, storeCode).
    type PriceRow = typeof allPriceRows[number]
    const priceIndex = new Map<string, PriceRow[]>()
    const storeNameByCode = new Map<string, string>()

    for (const row of allPriceRows) {
      const unitPrice = asNumber(row.currentPrice)
      if (unitPrice === null || unitPrice <= 0) continue

      storeNameByCode.set(row.storeCode, row.storeName)

      const key = `${row.catalogProductId}|${row.storeCode}`
      let list = priceIndex.get(key)
      if (!list) {
        list = []
        priceIndex.set(key, list)
      }
      list.push(row)
    }

    const allStoreCodes = [...storeNameByCode.keys()]

    // [Step 6] Build per-store carts in memory.
    type StoreCart = {
      storeCode: string
      storeName: string
      items: {
        priceId: string
        imageUrl: string | null
        catalogProductId: string
        name: string
        unitPrice: number
        unitInfo: string | null
        quantity: number
        lineTotal: number
      }[]
      subtotal: number
      slotsFulfilled: number
      requiredFulfilled: number
    }

    const storeCarts: StoreCart[] = allStoreCodes.map((storeCode) => {
      const storeName = storeNameByCode.get(storeCode)!
      const items: StoreCart['items'] = []
      let subtotal = 0
      let slotsFulfilled = 0
      let requiredFulfilled = 0

      for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
        const slot = slots[slotIdx]!
        const topIds = slotTopProductIds[slotIdx] ?? []
        const slotEmb = slotEmbeddings[slotIdx]

        let bestMatch: {
          priceId: string
          imageUrl: string | null
          catalogProductId: string
          name: string
          unitPrice: number
          unitInfo: string | null
          score: number
        } | null = null

        for (const productId of topIds) {
          const key = `${productId}|${storeCode}`
          const priceRows = priceIndex.get(key)
          if (!priceRows) continue

          const cheapest = priceRows.reduce<PriceRow | null>((best, row) => {
            const price = asNumber(row.currentPrice)
            if (price === null || price <= 0) return best
            if (!best) return row
            const bestPrice = asNumber(best.currentPrice)
            return bestPrice !== null && price < bestPrice ? row : best
          }, null)

          if (!cheapest) continue

          const unitPrice = asNumber(cheapest.currentPrice)!
          const emb = embeddingByProductId.get(productId)
          const similarity = slotEmb && emb ? cosineSimilarity(slotEmb, emb) : 0

          // Combined score: 70% relevance, 30% inverse price rank.
          const maxPrice = 500
          const priceScore = 1 - Math.min(unitPrice / maxPrice, 1)
          const combinedScore = similarity * 0.7 + priceScore * 0.3

          if (!bestMatch || combinedScore > bestMatch.score) {
            bestMatch = {
              priceId: cheapest.id,
              imageUrl: cheapest.catalogProduct.imageUrl,
              catalogProductId: cheapest.catalogProductId,
              name: cheapest.catalogProduct.name,
              unitPrice,
              unitInfo: formatUnitInfo(
                asNumber(cheapest.currentUnitPrice),
                cheapest.currentUnitPriceUnit ?? null,
                cheapest.catalogProduct.unit ?? null,
              ),
              score: combinedScore,
            }
          }
        }

        if (bestMatch) {
          const baseQuantity = slot.required ? 1 : 0.5
          const quantity = Math.max(1, Math.round(baseQuantity * quantityMultiplier * 0.5))
          const lineTotal = bestMatch.unitPrice * quantity
          items.push({
            priceId: bestMatch.priceId,
            imageUrl: bestMatch.imageUrl,
            catalogProductId: bestMatch.catalogProductId,
            name: bestMatch.name,
            unitPrice: bestMatch.unitPrice,
            unitInfo: bestMatch.unitInfo,
            quantity,
            lineTotal,
          })
          subtotal += lineTotal
          slotsFulfilled += 1
          if (slot.required) requiredFulfilled += 1
        }
      }

      return { storeCode, storeName, items, subtotal, slotsFulfilled, requiredFulfilled }
    })

    const requiredCount = slots.filter((s) => s.required).length
    const scored = storeCarts
      .filter((c) => c.slotsFulfilled > 0)
      .sort((a, b) => {
        if (a.requiredFulfilled !== b.requiredFulfilled) return b.requiredFulfilled - a.requiredFulfilled
        if (a.slotsFulfilled !== b.slotsFulfilled) return b.slotsFulfilled - a.slotsFulfilled
        const aTotal = a.subtotal + getDeliveryEstimate(a.storeCode).deliveryCost
        const bTotal = b.subtotal + getDeliveryEstimate(b.storeCode).deliveryCost
        return aTotal - bTotal
      })

    const bestStore = scored[0] ?? null

    if (!bestStore || bestStore.items.length === 0) {
      res.status(200).json({
        items: [],
        explanation: ['Could not find matching products in the catalog.'],
        storeChoice: null,
        totalPrice: 0,
      })
      return
    }

    const delivery = getDeliveryEstimate(bestStore.storeCode)
    const storeSubtotal = Math.round(bestStore.subtotal * 100) / 100
    const storeTotal = Math.round((bestStore.subtotal + delivery.deliveryCost) * 100) / 100

    const rawMealType = String(mealPlan.mealType ?? 'meal').trim()
    const readableMealTypeBase = rawMealType.replace(/_/g, ' ').toLowerCase()
    const readableMealType = readableMealTypeBase.charAt(0).toUpperCase() + readableMealTypeBase.slice(1)

    const explanation: string[] = [
      `Planned a "${readableMealType}" meal for ${mealPlan.people} people.`,
      `Chose store ${bestStore.storeName} as the cheapest option including delivery (${bestStore.slotsFulfilled} items).`,
    ]

    if (bestStore.requiredFulfilled < requiredCount) {
      explanation.push(`Note: Only ${bestStore.requiredFulfilled} of ${requiredCount} required ingredients found at this store.`)
    }

    if (mealPlan.notes) {
      explanation.push(`Notes: ${mealPlan.notes}`)
    }

    res.status(200).json({
      items: bestStore.items.map((item) => ({
        priceId: item.priceId,
        imageUrl: item.imageUrl,
        catalogProductId: item.catalogProductId,
        name: item.name,
        unitPrice: item.unitPrice,
        unitInfo: item.unitInfo,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      explanation,
      storeChoice: {
        storeCode: bestStore.storeCode,
        storeName: bestStore.storeName,
        subtotal: storeSubtotal,
        deliveryCost: delivery.deliveryCost,
        total: storeTotal,
        eta: delivery.etaLabel,
        etaMinutes: delivery.etaMinutes,
      },
      totalPrice: storeTotal,
    })
  } catch (error) {
    console.error('Intent cart planning failed', error)
    res.status(503).json({ message: 'Unable to plan cart right now.' })
  }
})

export default cartRouter
