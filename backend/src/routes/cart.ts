/**
 * @module routes/cart
 * Express router for cart operations. All routes are mounted under /api/cart.
 */

import { Router } from 'express'
import { getPrismaClient } from '../lib/prisma.js'
import { findSimilarProductsForProduct } from '../lib/embeddings.js'
import { tokenise, hasTokenOverlap } from '../lib/substitutions.js'
import { planMealFromText } from '../lib/intentCartPlanner.js'
import { getEmbeddings, completeJson } from '../lib/aiClient.js'

/** Express router providing cart matching and AI-powered intent planning endpoints. */
const cartRouter = Router()

/**
 * Represents a single item submitted by the client for cart operations.
 * @typedef {Object} CartItemInput
 * @property {string} priceId - The CatalogProductPrice record ID.
 * @property {number} quantity - Number of units requested (must be > 0).
 */
type CartItemInput = {
  priceId: string
  quantity: number
}

/**
 * Delivery cost and ETA information for a specific store chain.
 * @typedef {Object} StoreDeliveryEstimate
 * @property {number} deliveryCost - Flat delivery fee in NOK.
 * @property {string} etaLabel - Human-readable ETA string (e.g. "45 mins").
 * @property {number} etaMinutes - Estimated delivery time in minutes.
 */
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


/**
 * Computes the cosine similarity between two numeric vectors.
 * Returns 0 if either vector is empty, mismatched in length, or has zero magnitude.
 * @param {number[]} a - First embedding vector.
 * @param {number[]} b - Second embedding vector.
 * @returns {number} Similarity score in the range [0, 1].
 */
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

/**
 * Returns the delivery estimate for a known store chain, falling back to a
 * default estimate when the store code is not recognised.
 * @param {string} storeCode - Uppercase store chain identifier (e.g. "MENY_NO").
 * @returns {StoreDeliveryEstimate} Delivery cost and ETA for the store.
 */
function getDeliveryEstimate(storeCode: string): StoreDeliveryEstimate {
  return storeDeliveryEstimates[storeCode] ?? defaultDeliveryEstimate
}

/**
 * Safely coerces an unknown Prisma Decimal/string/number value to a finite JS number.
 * Handles comma-separated decimals (e.g. Norwegian locale "12,50").
 * @param {unknown} value - Raw value from the database or request body.
 * @returns {number | null} Finite numeric value, or null if conversion fails.
 */
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

/**
 * Formats a human-readable unit price string (e.g. "19.90 kr/kg").
 * Falls back to the product's generic unit label when a per-unit price is unavailable.
 * @param {number | null} currentUnitPrice - Numeric per-unit price, or null if not available.
 * @param {string | null} currentUnitPriceUnit - Unit label for the per-unit price (e.g. "kg", "l").
 * @param {string | null} fallbackUnit - Generic unit string from the catalog product to use as fallback.
 * @returns {string | null} Formatted unit info string, or null when no data is available.
 */
function formatUnitInfo(currentUnitPrice: number | null, currentUnitPriceUnit: string | null, fallbackUnit: string | null) {
  if (currentUnitPrice !== null && currentUnitPriceUnit) {
    return `${currentUnitPrice.toFixed(2)} kr/${currentUnitPriceUnit}`
  }
  return fallbackUnit
}

/**
 * Compares prices for a basket of items across all store chains in the catalog
 * and returns a ranked list of stores. The best match is the store that stocks the
 * most requested items at the lowest combined subtotal + delivery cost.
 *
 * Request body items reference CatalogProductPrice IDs so the same underlying
 * catalog product can be price-compared across every available store.
 *
 * @route {POST} /api/cart/match
 * @access {public}
 * @param req.body.items {CartItemInput[]} Array of `{ priceId, quantity }` objects.
 * @returns {200} `{ bestMatch, savings, stores, totalCartItems }` — `stores` is sorted
 *   by items-available descending, then total-cost ascending. `savings` is the
 *   difference in total price between the cheapest and most expensive store.
 * @returns {400} When the items array is missing or empty after validation.
 * @returns {503} On unexpected database errors.
 */
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
          isSubstitute?: boolean
          lineTotal: number
          name: string
          originalName?: string
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

    // For each store, find substitute products for missing cart items
    async function addSubstitutes() {
      const missingByStore = new Map<string, string[]>()
      for (const [storeCode, store] of storeMap) {
        const storeProductIds = new Set(store.items.map((i) => i.catalogProductId))
        const missing = catalogProductIds.filter((id) => !storeProductIds.has(id))
        if (missing.length > 0) missingByStore.set(storeCode, missing)
      }
      if (missingByStore.size === 0) return

      const uniqueMissingIds = [...new Set([...missingByStore.values()].flat())]
      const relevantStoreCodes = [...missingByStore.keys()]

      const [missingProductDetails, similarResults] = await Promise.all([
        prisma.catalogProduct.findMany({
          where: { id: { in: uniqueMissingIds } },
          select: { id: true, name: true, category: true, imageUrl: true, brand: true },
        }),
        Promise.allSettled(
          uniqueMissingIds.map((id) => findSimilarProductsForProduct(id, { limit: 40 })),
        ),
      ])

      const missingProductMap = new Map(missingProductDetails.map((p) => [p.id, p]))
      const similarByProductId = new Map<string, Array<{ productId: string; similarity: number }>>()
      uniqueMissingIds.forEach((id, idx) => {
        const result = similarResults[idx]
        if (result?.status === 'fulfilled') {
          similarByProductId.set(id, result.value.filter((s) => s.similarity >= 0.68))
        }
      })

      const allCandidateIds = [
        ...new Set([...similarByProductId.values()].flat().map((s) => s.productId)),
      ]

      // Collect categories of missing products for the text-based fallback query
      const missingCategories = [
        ...new Set(missingProductDetails.filter((p) => p.category).map((p) => p.category!)),
      ]

      // Run both queries in parallel: embedding-based candidates + category-based fallback
      const [embeddingCandidates, categoryCandidates] = await Promise.all([
        allCandidateIds.length > 0
          ? prisma.catalogProductPrice.findMany({
              where: {
                catalogProductId: { in: allCandidateIds },
                storeCode: { in: relevantStoreCodes },
                currentPrice: { not: null },
              },
              include: { catalogProduct: true },
            })
          : Promise.resolve([] as Awaited<ReturnType<typeof prisma.catalogProductPrice.findMany<{ include: { catalogProduct: true } }>>>),
        missingCategories.length > 0
          ? prisma.catalogProductPrice.findMany({
              where: {
                storeCode: { in: relevantStoreCodes },
                currentPrice: { not: null },
                catalogProduct: { category: { in: missingCategories } },
              },
              include: { catalogProduct: true },
            })
          : Promise.resolve([] as Awaited<ReturnType<typeof prisma.catalogProductPrice.findMany<{ include: { catalogProduct: true } }>>>),
      ])

      for (const [storeCode, missingIds] of missingByStore) {
        const store = storeMap.get(storeCode)!
        const storeAlreadyHas = new Set(store.items.map((i) => i.catalogProductId))

        for (const missingProductId of missingIds) {
          const baseProduct = missingProductMap.get(missingProductId)
          if (!baseProduct?.category) continue
          const baseTokens = new Set(tokenise(baseProduct.name))
          if (baseTokens.size === 0) continue

          const similar = similarByProductId.get(missingProductId) ?? []
          const similarIdSet = new Set(similar.map((s) => s.productId))

          // Primary: embedding-based candidates (higher precision)
          let candidates = embeddingCandidates.filter(
            (p) =>
              p.storeCode === storeCode &&
              similarIdSet.has(p.catalogProductId) &&
              !storeAlreadyHas.has(p.catalogProductId) &&
              p.catalogProduct.category === baseProduct.category &&
              hasTokenOverlap(p.catalogProduct.name, baseTokens),
          )

          // Fallback: category + token-overlap match (works without embeddings)
          if (candidates.length === 0) {
            candidates = categoryCandidates.filter(
              (p) =>
                p.storeCode === storeCode &&
                !storeAlreadyHas.has(p.catalogProductId) &&
                p.catalogProduct.category === baseProduct.category &&
                hasTokenOverlap(p.catalogProduct.name, baseTokens),
            )
          }

          if (candidates.length === 0) continue

          const scored = candidates.map((c) => ({
            candidate: c,
            similarity: similar.find((s) => s.productId === c.catalogProductId)?.similarity ?? 0,
          }))
          scored.sort((a, b) => {
            if (b.similarity !== a.similarity) return b.similarity - a.similarity
            return (
              (asNumber(a.candidate.currentPrice) ?? Infinity) -
              (asNumber(b.candidate.currentPrice) ?? Infinity)
            )
          })

          const best = scored[0]!.candidate
          const unitPrice = asNumber(best.currentPrice)
          if (unitPrice === null || unitPrice <= 0) continue

          const quantity = quantityByProductId.get(missingProductId) ?? 1
          const lineTotal = unitPrice * quantity

          store.items.push({
            catalogProductId: best.catalogProductId,
            name: best.catalogProduct.name,
            brand: best.catalogProduct.brand,
            imageUrl: best.catalogProduct.imageUrl,
            unitPrice,
            quantity,
            lineTotal,
            isSubstitute: true,
            originalName: baseProduct.name,
          })
          store.subtotal += lineTotal
          store.itemsAvailable += 1
          storeAlreadyHas.add(best.catalogProductId)
        }
      }
    }

    await Promise.race([addSubstitutes(), new Promise<void>((resolve) => setTimeout(resolve, 4000))])

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

/**
 * AI-powered substitute finder for a single unavailable cart item.
 * Asks the LLM for Norwegian grocery substitute names, embeds them, and
 * returns the top 3 most similar products available at the given store.
 *
 * @route {POST} /api/cart/ai-substitute
 * @access {public}
 * @param req.body.itemName {string} Name of the unavailable product.
 * @param req.body.storeCode {string} Store chain code to search within (e.g. "kiwi").
 * @returns {200} `{ candidates: [{ catalogProductId, name, brand, imageUrl, unitPrice }] }`
 * @returns {400} When itemName or storeCode is missing.
 * @returns {503} On LLM or database errors.
 */
cartRouter.post('/ai-substitute', async (req, res) => {
  const itemName = typeof req.body?.itemName === 'string' ? req.body.itemName.trim() : ''
  const storeCode = typeof req.body?.storeCode === 'string' ? req.body.storeCode.trim() : ''

  if (!itemName || !storeCode) {
    res.status(400).json({ message: 'itemName and storeCode are required.' })
    return
  }

  try {
    const prisma = getPrismaClient()

    const { result } = await completeJson<{ substitutes: string[] }>({
      systemPrompt:
        'You are a Norwegian grocery store assistant. Given a product name, suggest up to 3 alternative products commonly found in Norwegian supermarkets (KIWI, Rema 1000, Meny, SPAR, Joker, Coop). Return JSON: { "substitutes": ["name1", "name2", "name3"] }.',
      userPrompt: `What are good substitutes for "${itemName}"? List product names as they appear on Norwegian grocery store shelves.`,
    })

    const suggestedNames: string[] = (result.substitutes ?? []).filter((s) => typeof s === 'string' && s.trim()).slice(0, 3)
    const queries = [itemName, ...suggestedNames]
    const queryEmbeddings = await getEmbeddings(queries)

    const modelName = process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'

    const storeProducts = await prisma.catalogProductPrice.findMany({
      where: { storeCode, currentPrice: { not: null } },
      select: {
        catalogProductId: true,
        currentPrice: true,
        catalogProduct: {
          select: {
            id: true,
            name: true,
            brand: true,
            imageUrl: true,
            embeddings: {
              where: { modelName },
              select: { vectorJson: true },
              take: 1,
            },
          },
        },
      },
    })

    const cheapestByProduct = new Map<string, typeof storeProducts[0]>()
    for (const row of storeProducts) {
      const existing = cheapestByProduct.get(row.catalogProductId)
      if (!existing) {
        cheapestByProduct.set(row.catalogProductId, row)
      } else {
        const a = asNumber(existing.currentPrice) ?? Infinity
        const b = asNumber(row.currentPrice) ?? Infinity
        if (b < a) cheapestByProduct.set(row.catalogProductId, row)
      }
    }

    const scored: Array<{ catalogProductId: string; name: string; brand: string | null; imageUrl: string | null; unitPrice: number; score: number }> = []

    for (const row of cheapestByProduct.values()) {
      const emb = row.catalogProduct.embeddings[0]?.vectorJson
      if (!Array.isArray(emb)) continue

      let maxScore = 0
      for (const qEmb of queryEmbeddings) {
        const s = cosineSimilarity(qEmb as number[], emb as number[])
        if (s > maxScore) maxScore = s
      }

      if (maxScore >= 0.45) {
        scored.push({
          catalogProductId: row.catalogProductId,
          name: row.catalogProduct.name,
          brand: row.catalogProduct.brand,
          imageUrl: row.catalogProduct.imageUrl,
          unitPrice: asNumber(row.currentPrice) ?? 0,
          score: maxScore,
        })
      }
    }

    scored.sort((a, b) => b.score - a.score)

    res.json({
      candidates: scored.slice(0, 3).map(({ score: _score, ...rest }) => rest),
    })
  } catch (error) {
    console.error('AI substitute failed', error)
    res.status(503).json({ message: 'Unable to find a substitute right now.' })
  }
})

/**
 * AI-powered intent-to-cart planning. Accepts a free-text description (e.g.
 * "dinner for 4 people — pasta bolognese") and returns a ready-to-use cart
 * pre-filled with matching catalog products from the cheapest eligible store.
 *
 * Pipeline (7 steps):
 *  1. LLM (`planMealFromText`) parses the text into a structured ingredient list.
 *  2. Each ingredient name + synonyms is embedded via the configured AI embedding model.
 *  3. Per-ingredient text search against CatalogProduct (name / brand / category).
 *  4. Batch-fetch stored product embeddings for all candidate IDs.
 *  5. Rank candidates per ingredient by cosine similarity; keep top 10 above the
 *     0.25 threshold (falls back to raw text-match order when embeddings are absent).
 *  6. Batch-fetch all CatalogProductPrice rows for top products across every store.
 *  7. Score each store cart by required-ingredients fulfilled, then total items,
 *     then lowest total-cost including delivery; return the winner.
 *
 * @route {POST} /api/cart/intent
 * @access {public}
 * @param req.body.text {string} Free-text meal or shopping description (required).
 * @param req.body.language {"en"|"no"} Language hint passed to the LLM planner (default "en").
 * @returns {200} `{ items, explanation, storeChoice, totalPrice }` — `items` are ready
 *   to add to the cart; `explanation` is a human-readable summary array; `storeChoice`
 *   includes store name, subtotal, deliveryCost, total, and ETA.
 * @returns {400} When `text` is missing or empty.
 * @returns {503} On LLM or database errors.
 */
cartRouter.post('/intent', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  const language = req.body?.language === 'no' ? 'no' : 'en'

  if (!text) {
    res.status(400).json({ message: 'Text is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()

    // Step 1: LLM generates a recipe, then we get a structured ingredient list.
    const mealPlan = await planMealFromText(text, language)

    const ingredients = mealPlan.ingredients
    if (ingredients.length === 0) {
      res.status(200).json({
        items: [],
        explanation: ['Could not identify specific ingredients from your request.'],
        storeChoice: null,
        totalPrice: 0,
      })
      return
    }

    // Step 2: Embed each ingredient using name + synonyms for a richer query vector.
    const embeddingInputs = ingredients.map((ing) =>
      [ing.product, ...ing.searchTerms.slice(0, 3)].join(' | '),
    )
    let rawEmbeddings: number[][] = []
    try {
      rawEmbeddings = await getEmbeddings(embeddingInputs)
    } catch {
      // Proceed without embeddings — text search still works.
    }
    const ingredientEmbeddings: (number[] | null)[] = embeddingInputs.map(
      (_, i) => rawEmbeddings[i] ?? null,
    )

    // Step 3: Per ingredient — text search CatalogProduct (store-agnostic).
    const ingredientCandidateIds: string[][] = await Promise.all(
      ingredients.map(async (ing) => {
        const terms = ing.searchTerms.filter((t) => t.length >= 2)
        if (terms.length === 0) return []

        const orClauses = terms.flatMap((term) => [
          { name: { contains: term, mode: 'insensitive' as const } },
          { brand: { contains: term, mode: 'insensitive' as const } },
          { category: { contains: term, mode: 'insensitive' as const } },
        ])

        const rows = await prisma.catalogProduct.findMany({
          where: { OR: orClauses },
          select: { id: true },
          take: 60,
        })

        return rows.map((r) => r.id)
      }),
    )

    // Step 4: Batch-fetch embeddings for all candidate product IDs.
    const allCandidateIds = [...new Set(ingredientCandidateIds.flat())]
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

    // Step 5: Rank candidates per ingredient by embedding similarity, keep top 10.
    const SIMILARITY_THRESHOLD = 0.25
    const TOP_K = 10

    const ingredientTopIds: string[][] = ingredients.map((_ing, idx) => {
      const candidateIds = ingredientCandidateIds[idx] ?? []
      const ingEmb = ingredientEmbeddings[idx]

      if (!ingEmb || candidateIds.length === 0) return candidateIds.slice(0, TOP_K)

      const scored: { productId: string; similarity: number }[] = []
      for (const productId of candidateIds) {
        const vec = embeddingByProductId.get(productId)
        if (!vec) {
          scored.push({ productId, similarity: 0 })
          continue
        }
        scored.push({ productId, similarity: cosineSimilarity(ingEmb, vec) })
      }

      scored.sort((a, b) => b.similarity - a.similarity)

      const filtered = scored.filter((s) => s.similarity >= SIMILARITY_THRESHOLD)
      const result = filtered.length > 0 ? filtered : scored

      return result.slice(0, TOP_K).map((s) => s.productId)
    })

    // Step 6: Batch-fetch all prices for top products across all stores.
    const allTopProductIds = [...new Set(ingredientTopIds.flat())]

    const allPriceRows = allTopProductIds.length > 0
      ? await prisma.catalogProductPrice.findMany({
          where: {
            catalogProductId: { in: allTopProductIds },
            currentPrice: { not: null },
          },
          include: { catalogProduct: true },
        })
      : []

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

    // Step 7: Build per-store carts in memory.
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
      ingredientsFulfilled: number
      requiredFulfilled: number
    }

    const storeCarts: StoreCart[] = allStoreCodes.map((storeCode) => {
      const storeName = storeNameByCode.get(storeCode)!
      const items: StoreCart['items'] = []
      let subtotal = 0
      let ingredientsFulfilled = 0
      let requiredFulfilled = 0

      for (let idx = 0; idx < ingredients.length; idx++) {
        const ing = ingredients[idx]!
        const topIds = ingredientTopIds[idx] ?? []
        const ingEmb = ingredientEmbeddings[idx]

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
          const similarity = ingEmb && emb ? cosineSimilarity(ingEmb, emb) : 0

          const maxPrice = 150
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
          const quantity = ing.qty
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
          ingredientsFulfilled += 1
          if (ing.required) requiredFulfilled += 1
        }
      }

      return { storeCode, storeName, items, subtotal, ingredientsFulfilled, requiredFulfilled }
    })

    const requiredCount = ingredients.filter((ing) => ing.required).length
    const scored = storeCarts
      .filter((c) => c.ingredientsFulfilled > 0)
      .sort((a, b) => {
        if (a.requiredFulfilled !== b.requiredFulfilled) return b.requiredFulfilled - a.requiredFulfilled
        if (a.ingredientsFulfilled !== b.ingredientsFulfilled) return b.ingredientsFulfilled - a.ingredientsFulfilled
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
      `Chose store ${bestStore.storeName} as the cheapest option including delivery (${bestStore.ingredientsFulfilled} items).`,
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
