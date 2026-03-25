import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { planMealFromText } from '../lib/intentCartPlanner.js'
import { getEmbedding } from '../lib/aiClient.js'

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

// When text search finds nothing for a slot, try these catalog categories based on slot role keywords.
const SLOT_ROLE_CATEGORY_FALLBACK: Array<{ keywords: string[]; categories: string[] }> = [
  { keywords: ['protein', 'meat', 'kjøtt'], categories: ['Kjøtt', 'Kylling', 'Saltpølser', 'Spekepølser', 'Bacon', 'Fisk og sjømat'] },
  { keywords: ['fish', 'seafood', 'fisk', 'sjømat'], categories: ['Fisk og sjømat', 'Sild/ansjos'] },
  { keywords: ['vegetable', 'grønnsak', 'salad', 'salat'], categories: ['Grønnsaker', 'Salater', 'Rotgrønnsaker', 'Frukt'] },
  { keywords: ['cheese', 'ost'], categories: ['Gulost', 'Hvitmuggost', 'Blåmuggost', 'Smøreost', 'Brunost'] },
  { keywords: ['dairy', 'milk', 'melk'], categories: ['Melk', 'Fløte', 'Yoghurt', 'Rømme', 'Smør', 'Egg'] },
  { keywords: ['pasta', 'noodle', 'nudler'], categories: ['Pasta og nudler'] },
  { keywords: ['rice', 'ris'], categories: ['Ris og gryn'] },
  { keywords: ['bread', 'brød', 'tortilla', 'wrap', 'lefse'], categories: ['Brød', 'Tortilla og wrap', 'Lefser og flatbrød', 'Rundstykker'] },
  { keywords: ['sauce', 'saus', 'salsa', 'pastasaus'], categories: ['Pastasaus', 'Sauser og marinader', 'Ketchup'] },
  { keywords: ['spice', 'krydder', 'herb', 'urte', 'seasoning'], categories: ['Krydder', 'Krydderblandinger', 'Salt og pepper'] },
  { keywords: ['oil', 'olje', 'vinegar', 'eddik'], categories: ['Olje og eddik'] },
  { keywords: ['egg'], categories: ['Egg'] },
  { keywords: ['butter', 'smør'], categories: ['Smør', 'Margarin'] },
  { keywords: ['cream', 'fløte', 'rømme'], categories: ['Fløte', 'Rømme'] },
  { keywords: ['drink', 'drikke', 'juice', 'water', 'vann'], categories: ['Juice', 'Vann', 'Brus'] },
  { keywords: ['frozen', 'frossen'], categories: ['Grønnsaker, frosne', 'Fisk, frossen', 'Kjøtt, frossen'] },
]

function getRoleCategoryFallback(slotRole: string, tags: string[]): string[] {
  const needle = `${slotRole} ${tags.join(' ')}`.toLowerCase()
  for (const entry of SLOT_ROLE_CATEGORY_FALLBACK) {
    if (entry.keywords.some((kw) => needle.includes(kw))) return entry.categories
  }
  return []
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

    // Fetch real catalog categories to ground the LLM in what's actually available.
    const categoryRows = await (prisma as any).catalogProduct.findMany({
      select: { category: true },
      where: { category: { not: null } },
      distinct: ['category'],
    })
    const catalogCategories: string[] = categoryRows
      .map((r: { category: string | null }) => r.category)
      .filter((c: string | null): c is string => Boolean(c))
      .sort()

    const mealPlan = await planMealFromText(text, language, catalogCategories)

    const slots = mealPlan.slots
    if (slots.length === 0) {
      res
        .status(200)
        .json({ items: [], explanation: ['Could not identify specific ingredients from your request.'], storeChoice: null, totalPrice: 0 })
      return
    }

    const lowerMealType = String(mealPlan.mealType ?? '').toLowerCase()
    const lowerText = text.toLowerCase()
    const isTacoRequest =
      lowerMealType.includes('taco') ||
      lowerText.includes('taco') ||
      slots.some((slot) => slot.tags.some((t) => t.toLowerCase().includes('taco')))

    // For taco meals, make protein matching far more reliable by always extending tags with meat keywords.
    const fallbackProteinTags = [
      'kjøttdeig',
      'karbonadedeig',
      'biff',
      'storfe',
      'ground beef',
      'minced meat',
      'mince',
      'beef mince',
    ]

    const isVegetarianRequest =
      lowerText.includes('vegetar') ||
      lowerText.includes('vegan') ||
      lowerText.includes('vegetarisk') ||
      lowerText.includes('vegansk') ||
      lowerText.includes('tofu')

    // Extra tokens to find meat even when the catalog uses slightly different naming.
    const proteinSearchTokens = Array.from(
      new Set([
        ...fallbackProteinTags,
        'kjottdeig',
        'kjøtt',
        'kjott',
        'deig',
        'ground meat',
        'minced',
        'mince',
        'beef',
        'storfe',
      ]),
    )

    const forceProteinForTaco = isTacoRequest && !isVegetarianRequest

    const [stores] = await Promise.all([
      prisma.catalogProductPrice.findMany({
        select: { storeCode: true, storeName: true },
        distinct: ['storeCode'],
      }),
    ])

    const quantityMultiplier = people ?? mealPlan.people

    // Pre-compute per-slot data (tags, effectiveTags, slotLooksProtein) once.
    const slotData = slots.map((slot) => {
      const tags = Array.isArray(slot.tags)
        ? slot.tags.map((tag) => String(tag ?? '').trim()).filter((tag) => tag.length >= 2)
        : []
      const slotRoleLower = String(slot.role ?? '').toLowerCase()
      const slotLooksProtein =
        slotRoleLower.includes('protein') ||
        slotRoleLower.includes('meat') ||
        slotRoleLower.includes('kjøtt') ||
        tags.some((t) => fallbackProteinTags.some((k) => t.toLowerCase().includes(k)))
      const effectiveTags =
        isTacoRequest && slotLooksProtein ? Array.from(new Set([...tags, ...fallbackProteinTags])) : tags
      return { slot, tags, effectiveTags, slotLooksProtein }
    })

    // Fetch slot embeddings once in parallel — one per slot, not one per slot×store.
    const slotEmbeddings = await Promise.all(
      slotData.map(async ({ slot, effectiveTags }) => {
        if (effectiveTags.length === 0) return null
        try {
          return await getEmbedding(`${slot.role} | ${effectiveTags.join(' ')}`)
        } catch {
          return null
        }
      }),
    )

    // Process all stores in parallel.
    const storeCandidates = (
      await Promise.all(
        stores.map(async (storeRow) => {
          const storeCode = storeRow.storeCode
          const storeName = storeRow.storeName
          const delivery = getDeliveryEstimate(storeCode)
          const items: {
            priceId: string
            imageUrl: string | null
            catalogProductId: string
            name: string
            unitPrice: number
            unitInfo: string | null
            quantity: number
            lineTotal: number
          }[] = []
          // Process all slots for this store in parallel.
          type SlotResult = {
            priceId: string
            imageUrl: string | null
            catalogProductId: string
            name: string
            unitPrice: number
            unitInfo: string | null
            quantity: number
            lineTotal: number
            required: boolean
            isProtein: boolean
          }

          const slotResults = await Promise.all(
            slotData.map(async ({ slot, effectiveTags, slotLooksProtein }, slotIdx) => {
              const slotEmbedding = slotEmbeddings[slotIdx] ?? null
              if (effectiveTags.length === 0) return null

              const orClauses = effectiveTags.flatMap((tag) => [
                { name: { contains: tag, mode: 'insensitive' as const } },
                { brand: { contains: tag, mode: 'insensitive' as const } },
                { category: { contains: tag, mode: 'insensitive' as const } },
              ])

              let candidates = await prisma.catalogProductPrice.findMany({
                where: {
                  storeCode,
                  currentPrice: { not: null },
                  catalogProduct: { OR: orClauses },
                },
                include: { catalogProduct: true },
                orderBy: [{ currentPrice: 'asc' }],
                take: 40,
              })

              // If text search found nothing, fall back to category-based search using the slot role.
              if (candidates.length === 0) {
                const fallbackCategories = getRoleCategoryFallback(slot.role, effectiveTags)
                if (fallbackCategories.length > 0) {
                  candidates = await prisma.catalogProductPrice.findMany({
                    where: {
                      storeCode,
                      currentPrice: { not: null },
                      catalogProduct: { category: { in: fallbackCategories } },
                    },
                    include: { catalogProduct: true },
                    orderBy: [{ currentPrice: 'asc' }],
                    take: 40,
                  })
                }
              }

              if (candidates.length === 0) return null

              const candidateProductIds = [...new Set(candidates.map((c) => c.catalogProductId))]
              const embeddingRows =
                slotEmbedding && candidateProductIds.length > 0
                  ? await (prisma as any).productEmbedding.findMany({
                      where: {
                        modelName: DEFAULT_EMBEDDING_MODEL,
                        productId: { in: candidateProductIds },
                      },
                      select: { productId: true, vectorJson: true },
                    })
                  : []

              const embeddingByProductId = new Map<string, number[]>()
              if (slotEmbedding && Array.isArray(embeddingRows)) {
                for (const row of embeddingRows) {
                  const vec = row.vectorJson as unknown as number[]
                  if (Array.isArray(vec) && vec.length > 0) embeddingByProductId.set(row.productId, vec)
                }
              }

              let bestMatch: {
                priceId: string
                imageUrl: string | null
                catalogProductId: string
                name: string
                unitPrice: number
                unitInfo: string | null
              } | null = null

              // Default to cheapest candidate.
              for (const row of candidates) {
                const unitPrice = asNumber(row.currentPrice)
                if (unitPrice === null || unitPrice <= 0) continue
                bestMatch = {
                  priceId: row.id,
                  imageUrl: row.catalogProduct.imageUrl,
                  catalogProductId: row.catalogProductId,
                  name: row.catalogProduct.name,
                  unitPrice,
                  unitInfo: formatUnitInfo(
                    asNumber(row.currentUnitPrice),
                    row.currentUnitPriceUnit ?? null,
                    row.catalogProduct.unit ?? null,
                  ),
                }
                break
              }

              if (slotEmbedding) {
                let bestSimilarity = -Infinity
                const similarityThreshold = 0.12
                for (const row of candidates) {
                  const unitPrice = asNumber(row.currentPrice)
                  if (unitPrice === null || unitPrice <= 0) continue
                  const vec = embeddingByProductId.get(row.catalogProductId)
                  if (!vec) continue
                  const similarity = cosineSimilarity(slotEmbedding, vec)
                  if (similarity < similarityThreshold) continue
                  if (
                    similarity > bestSimilarity ||
                    (similarity === bestSimilarity && bestMatch && unitPrice < bestMatch.unitPrice)
                  ) {
                    bestSimilarity = similarity
                    bestMatch = {
                      priceId: row.id,
                      imageUrl: row.catalogProduct.imageUrl,
                      catalogProductId: row.catalogProductId,
                      name: row.catalogProduct.name,
                      unitPrice,
                      unitInfo: formatUnitInfo(
                        asNumber(row.currentUnitPrice),
                        row.currentUnitPriceUnit ?? null,
                        row.catalogProduct.unit ?? null,
                      ),
                    }
                  }
                }
              }

              if (!bestMatch) return null

              const baseQuantity = slot.required ? 1 : 0.5
              const quantity = Math.max(1, Math.round(baseQuantity * quantityMultiplier * 0.5))
              return {
                ...bestMatch,
                imageUrl: bestMatch.imageUrl ?? null,
                quantity,
                lineTotal: bestMatch.unitPrice * quantity,
                required: slot.required,
                isProtein: forceProteinForTaco && slotLooksProtein,
              } satisfies SlotResult
            }),
          )

          let subtotal = 0
          let requiredFulfilled = 0
          let pickedProteinLike = false

          for (const result of slotResults) {
            if (!result) continue
            items.push({
              priceId: result.priceId,
              imageUrl: result.imageUrl,
              catalogProductId: result.catalogProductId,
              name: result.name,
              unitPrice: result.unitPrice,
              unitInfo: result.unitInfo,
              quantity: result.quantity,
              lineTotal: result.lineTotal,
            })
            subtotal += result.lineTotal
            if (result.required) requiredFulfilled += 1
            if (result.isProtein) pickedProteinLike = true
          }

          // Fallback: if taco request and no protein matched, find cheapest meat in one query.
          if (forceProteinForTaco && !pickedProteinLike) {
            try {
              const proteinOrClauses = proteinSearchTokens.flatMap((token) => [
                { name: { contains: token, mode: 'insensitive' as const } },
                { brand: { contains: token, mode: 'insensitive' as const } },
                { category: { contains: token, mode: 'insensitive' as const } },
              ])
              const rows = await prisma.catalogProductPrice.findMany({
                where: {
                  storeCode,
                  currentPrice: { not: null },
                  catalogProduct: { OR: proteinOrClauses },
                },
                include: { catalogProduct: true },
                orderBy: [{ currentPrice: 'asc' }],
                take: 5,
              })
              const forcedBest = rows
                .map((row) => ({ row, unitPrice: asNumber(row.currentPrice) }))
                .filter(({ unitPrice }) => unitPrice !== null && unitPrice > 0)
                .sort((a, b) => a.unitPrice! - b.unitPrice!)[0]

              if (forcedBest) {
                const { row, unitPrice } = forcedBest
                const quantity = Math.max(1, Math.round(1 * quantityMultiplier * 0.5))
                const lineTotal = unitPrice! * quantity
                items.push({
                  priceId: row.id,
                  imageUrl: row.catalogProduct.imageUrl,
                  catalogProductId: row.catalogProductId,
                  name: row.catalogProduct.name,
                  unitPrice: unitPrice!,
                  unitInfo: formatUnitInfo(
                    asNumber(row.currentUnitPrice),
                    row.currentUnitPriceUnit ?? null,
                    row.catalogProduct.unit ?? null,
                  ),
                  quantity,
                  lineTotal,
                })
                subtotal += lineTotal
              }
            } catch (error) {
              console.error('Forced protein search failed', error)
            }
          }

          const total = Math.round((subtotal + delivery.deliveryCost) * 100) / 100
          return {
            storeCode,
            storeName,
            items,
            subtotal: Math.round(subtotal * 100) / 100,
            deliveryCost: delivery.deliveryCost,
            total,
            eta: delivery.etaLabel,
            etaMinutes: delivery.etaMinutes,
            slotsFulfilled: items.length,
            requiredFulfilled,
          }
        }),
      )
    ).filter((c) => c.slotsFulfilled > 0)

    const requiredCount = slots.filter((s) => s.required).length
    const scored = storeCandidates
      .sort((a, b) => {
        if (a.requiredFulfilled !== b.requiredFulfilled) return b.requiredFulfilled - a.requiredFulfilled
        if (a.slotsFulfilled !== b.slotsFulfilled) return b.slotsFulfilled - a.slotsFulfilled
        return a.total - b.total
      })

    const bestStore = scored[0] ?? null

    if (!bestStore || bestStore.items.length === 0) {
      res.status(200).json({ items: [], explanation: ['Could not find matching products in the catalog.'], storeChoice: null, totalPrice: 0 })
      return
    }

    const rawMealType = String(mealPlan.mealType ?? 'meal').trim()
    const readableMealTypeBase = rawMealType.replace(/_/g, ' ').toLowerCase()
    const readableMealType =
      readableMealTypeBase.charAt(0).toUpperCase() + readableMealTypeBase.slice(1)

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
