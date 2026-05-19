/**
 * @module routes/products
 * Express router for the product catalog, search, and sync operations.
 * All routes are mounted under /api/products.
 */
import crypto from 'crypto'
import { Router } from 'express'
import { syncCatalog } from '../lib/catalogSync.js'
import { getPrismaClient } from '../lib/prisma.js'
import { findSimilarProductsForProduct } from '../lib/embeddings.js'

/** Express router providing product catalog browsing, search, and sync endpoints. */
const productsRouter = Router()
const KASSAL_DEFAULT_PAGE_SIZE = 50

const PLACEHOLDER_IMAGE_URLS = [
  'https://nettbutikk.bunnpris.no/itemImages/noimage_f.png',
  'https://res.cloudinary.com/norgesgruppen/image/upload/Product/404.jpg',
]

/**
 * Returns `true` when the given URL is a known placeholder / "no image"
 * image that should be treated as absent. Checks against a hard-coded list
 * of CDN placeholder URLs and common path/filename patterns.
 */
function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url || url.trim() === '') return true
  if (PLACEHOLDER_IMAGE_URLS.includes(url)) return true
  const lower = url.toLowerCase()
  // Catch CDN variants: Norgesgruppen 404 with any transformation params, Bunnpris noimage variants
  if (lower.includes('/product/404') || lower.includes('noimage') || lower.includes('no_image') || lower.includes('no-image')) return true
  return false
}

/**
 * Unified product shape returned by all marketplace listing endpoints,
 * regardless of whether the product originates from the Kassal catalog or a
 * local supplier.
 */
type NormalizedProduct = {
  brand: string | null
  category: string | null
  description: string | null
  ean: string | null
  id: string
  imageUrl: string | null
  name: string
  price: number | null
  priceText: string | null
  store: string | null
  unitInfo: string | null
  url: string | null
  source?: 'catalog' | 'supplier'
  supplierId?: string
}

/**
 * Maps a frontend-facing category slug (e.g. `"dairy"`) to the list of
 * Norwegian Kassal category strings stored in the database.
 */
type CategoryDefinition = {
  id: string
  kassalCategories: string[]
}

const categoryDefinitions: CategoryDefinition[] = [
  { id: 'produce', kassalCategories: ['Salater', 'Grønnsaker, frosne', 'Grønnsaker', 'Frukt', 'Bær', 'Urter', 'Rotgrønnsaker'] },
  { id: 'dairy', kassalCategories: ['Gulost', 'Yoghurt', 'Hvitmuggost', 'Blåmuggost', 'Smøreost', 'Brunost', 'Rømme', 'Fløte', 'Melk', 'Smør', 'Margarin', 'Egg'] },
  { id: 'bakery', kassalCategories: ['Brød', 'Knekkebrød', 'Rundstykker', 'Croissanter', 'Kaker', 'Boller', 'Lefser og flatbrød', 'Tortilla og wrap'] },
  { id: 'pantry', kassalCategories: ['Frokostblanding', 'Barnegrøt', 'Pastasaus', 'Ferdigmåltid', 'Pizza', 'Pasta og nudler', 'Ris og gryn', 'Hermetikk', 'Supper', 'Sauser og marinader', 'Mel og stivelse', 'Sukker og søtning'] },
  { id: 'protein', kassalCategories: ['Saltpølser', 'Påleggskinker', 'Spekepølser', 'Spekeskinker', 'Kjøttpålegg', 'Bacon', 'Sild/ansjos', 'Leverpostei', 'Fisk og sjømat', 'Kylling', 'Kjøtt', 'Vegetarpålegg'] },
  { id: 'snacks', kassalCategories: ['Chips', 'Popcorn', 'Kjeks og kjeksblanding', 'Nøtter og tørket frukt', 'Sjokolade', 'Godteri', 'Tyggegummi og pastiller', 'Iskrembarer', 'Is og dessert'] },
  { id: 'condiments', kassalCategories: ['Dressinger', 'Majones', 'Ketchup', 'Sennep', 'Rémoulade', 'Olje og eddik', 'Krydder', 'Krydderblandinger', 'Salt og pepper', 'Pålegg og syltetøy', 'Honning'] },
  { id: 'frozen', kassalCategories: ['Grønnsaker, frosne', 'Fisk, frossen', 'Kjøtt, frossen', 'Ferdigmat, frossen', 'Pizza, frossen', 'Is og dessert'] },
  { id: 'drinks', kassalCategories: ['Brus', 'Juice', 'Vann med kullsyre', 'Energidrikk', 'Te', 'Smoothie', 'Saft', 'Ferdigdrink', 'Kaffekapsler', 'Hele kaffebønner', 'Vann', 'Alkoholfritt øl', 'Kaffe', 'Kakao'] },
  { id: 'cleaning', kassalCategories: ['Rengjøringsmidler', 'Oppvask', 'Klesvask', 'Tørkepapir og servietter', 'Søppelposer', 'Toalettpapir'] },
]

/**
 * Coerces `value` to a non-empty trimmed string, or returns `null` when
 * `value` is absent, not a string, or blank after trimming.
 */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * Coerces `value` to a finite number, handling strings with comma decimal
 * separators and objects that implement `valueOf` or `toString`. Returns
 * `null` for any value that cannot be converted to a finite number.
 */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = Number(value.replace(',', '.'))
    return Number.isFinite(normalized) ? normalized : null
  }

  if (value && typeof value === 'object') {
    const candidate = value as { valueOf?: () => unknown; toString?: () => string }

    if (typeof candidate.valueOf === 'function') {
      const numeric = candidate.valueOf()
      if (typeof numeric === 'number' && Number.isFinite(numeric)) {
        return numeric
      }
    }

    if (typeof candidate.toString === 'function') {
      const asText = candidate.toString()
      if (typeof asText === 'string' && asText.trim().length > 0) {
        const normalized = Number(asText.replace(',', '.'))
        return Number.isFinite(normalized) ? normalized : null
      }
    }
  }

  return null
}

/**
 * Formats a price value as a Norwegian kroner string (e.g. `"29.90 kr"`).
 * Returns `null` when `price` is `null`.
 */
function formatPrice(price: number | null) {
  if (price === null) {
    return null
  }

  return `${price.toFixed(2)} kr`
}

/**
 * Builds a human-readable unit price string (e.g. `"49.90 kr/kg"`). Falls
 * back to the raw unit label when the per-unit price or unit string is absent.
 */
const UNIT_DISPLAY_MAP: Record<string, string> = {
  g: 'kg',
  ml: 'l',
  cl: 'l',
  dl: 'l',
  stk: 'stk',
  kg: 'kg',
  l: 'l',
}

function formatUnitInfo(currentUnitPrice: number | null, currentUnitPriceUnit: string | null, fallbackUnit: string | null) {
  if (currentUnitPrice !== null && currentUnitPriceUnit) {
    const displayUnit = UNIT_DISPLAY_MAP[currentUnitPriceUnit.toLowerCase()] ?? currentUnitPriceUnit
    return `${currentUnitPrice.toFixed(2)} kr/${displayUnit}`
  }

  return fallbackUnit
}

/**
 * Lowercases a string for case-insensitive comparisons.
 * Returns an empty string when `value` is `null` or `undefined`.
 */
function normalizeText(value: string | null | undefined) {
  return (value ?? '').toLowerCase()
}

/**
 * Builds a Prisma `where` clause fragment that filters catalog products by
 * the frontend category slug. Returns `undefined` when `categoryId` is empty,
 * `"all"`, or does not match any known category definition.
 */
function buildCategoryFilter(categoryId: string) {
  if (!categoryId || categoryId === 'all') {
    return undefined
  }

  const category = categoryDefinitions.find((entry) => entry.id === categoryId)
  if (!category) {
    return undefined
  }

  return {
    category: { in: category.kassalCategories },
  }
}

/**
 * Builds a Prisma `where` clause fragment that performs a case-insensitive
 * full-text search across `name`, `brand`, `gtin`, and `category` columns.
 * Returns `undefined` when the search string is shorter than 3 characters.
 */
function buildSearchFilter(search: string) {
  if (!search || search.length < 3) {
    return undefined
  }

  return {
    OR: [
      { name: { contains: normalizeText(search), mode: 'insensitive' } },
      { brand: { contains: normalizeText(search), mode: 'insensitive' } },
      { gtin: { contains: normalizeText(search), mode: 'insensitive' } },
      { category: { contains: normalizeText(search), mode: 'insensitive' } },
    ],
  }
}

/**
 * Converts a sort key string from the query string into a Prisma `orderBy`
 * array. Supported values: `"price-asc"`, `"price-desc"`, `"name-asc"`,
 * `"store-asc"`. Any other value falls back to `updatedAt desc` (newest first).
 */
function buildOrderBy(sort: string) {
  switch (sort) {
    case 'price-asc':
      return [{ currentPrice: 'asc' as const }, { catalogProduct: { name: 'asc' as const } }]
    case 'price-desc':
      return [{ currentPrice: 'desc' as const }, { catalogProduct: { name: 'asc' as const } }]
    case 'name-asc':
      return [{ catalogProduct: { name: 'asc' as const } }]
    case 'store-asc':
      return [{ storeName: 'asc' as const }, { catalogProduct: { name: 'asc' as const } }]
    default:
      return [{ updatedAt: 'desc' as const }, { catalogProduct: { name: 'asc' as const } }]
  }
}

/**
 * Computes a relevance score for `product` against the given search terms.
 * Scoring weights: exact word boundary match in name (+50), prefix match
 * (+30), substring match in name (+5), brand word boundary (+15), category
 * word boundary (+10), has image (+20), has price (+10).
 */
function scoreRelevance(product: NormalizedProduct, searchTerms: string[]): number {
  let score = 0
  const nameLower = (product.name ?? '').toLowerCase()
  const brandLower = (product.brand ?? '').toLowerCase()
  const categoryLower = (product.category ?? '').toLowerCase()

  for (const term of searchTerms) {
    const wordBoundary = new RegExp(`(^|\\s|,)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s|,)`, 'i')

    if (wordBoundary.test(nameLower)) {
      score += 50
    } else if (nameLower.includes(term)) {
      score += 5
    }

    if (nameLower.startsWith(term)) {
      score += 30
    }

    if (wordBoundary.test(brandLower)) score += 15
    if (wordBoundary.test(categoryLower)) score += 10
  }

  if (product.imageUrl) score += 20
  if (product.price !== null) score += 10

  return score
}

/**
 * Sorts `products` by relevance to `query` using `scoreRelevance`. Products
 * with equal scores are ordered so those with images come first. Returns the
 * original array unchanged when the query is shorter than 2 characters.
 */
function rankByRelevance(products: NormalizedProduct[], query: string): NormalizedProduct[] {
  if (!query || query.length < 2) return products

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
  if (terms.length === 0) return products

  return [...products].sort((a, b) => {
    const scoreA = scoreRelevance(a, terms)
    const scoreB = scoreRelevance(b, terms)
    if (scoreB !== scoreA) return scoreB - scoreA
    const imgA = a.imageUrl ? 0 : 1
    const imgB = b.imageUrl ? 0 : 1
    return imgA - imgB
  })
}

/**
 * Maps a raw `CatalogProductPrice` database row (with its nested
 * `catalogProduct` relation) to a `NormalizedProduct` shape ready for the
 * API response. Placeholder images are replaced with `null`.
 */
function toMarketplaceProduct(row: {
  id: string
  storeName: string
  currentPrice: unknown
  currentUnitPrice: unknown
  currentUnitPriceUnit: string | null
  productUrl: string | null
  catalogProduct: {
    brand: string | null
    category: string | null
    gtin: string | null
    imageUrl: string | null
    name: string
    unit: string | null
  }
}): NormalizedProduct {
  const price = asNumber(row.currentPrice)
  const currentUnitPrice = asNumber(row.currentUnitPrice)

  return {
    brand: row.catalogProduct.brand,
    category: row.catalogProduct.category,
    description: null,
    ean: row.catalogProduct.gtin,
    id: row.id,
    imageUrl: isPlaceholderImage(row.catalogProduct.imageUrl) ? null : row.catalogProduct.imageUrl,
    name: row.catalogProduct.name,
    price,
    priceText: formatPrice(price),
    store: row.storeName,
    unitInfo: formatUnitInfo(currentUnitPrice, row.currentUnitPriceUnit, row.catalogProduct.unit),
    url: row.productUrl,
  }
}

/**
 * List and search the product catalog with optional filtering, sorting, and
 * pagination. Supports three distinct modes:
 * - `category=local-suppliers` — returns active supplier products only.
 * - No search/category — returns recently updated catalog items with images
 *   (discovery / homepage feed).
 * - Search and/or category set — filters the catalog and applies either
 *   relevance ranking (default sort) or a user-chosen sort order.
 *
 * Query params: `q`, `category`, `store`, `sort`, `page`, `pageSize`.
 *
 * @route {GET} /
 * @access public
 */
productsRouter.get('/', async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? KASSAL_DEFAULT_PAGE_SIZE), 10) || KASSAL_DEFAULT_PAGE_SIZE))
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const category = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : ''
  const rawStore = typeof req.query.store === 'string' ? req.query.store.trim().toUpperCase() : ''
  const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'relevance'
  const selectedStore = rawStore || null

  const hasSearch = q.length >= 3
  const hasCategory = Boolean(category) && category !== 'all'
  const isLocalSuppliers = category === 'local-suppliers'

  if (isLocalSuppliers) {
    try {
      const prisma = getPrismaClient()
      const where = {
        isActive: true as const,
        approvalStatus: 'APPROVED' as const,
        supplier: { showInMarketplace: true },
      } as {
        isActive: boolean
        approvalStatus: 'APPROVED'
        supplier?: { showInMarketplace: boolean }
        OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; description?: { contains: string; mode: 'insensitive' } }>
      }
      if (hasSearch) {
        const term = q.trim().toLowerCase()
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ]
      }
      const [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: { supplier: true },
          orderBy: [{ name: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.product.count({ where }),
      ])
      const items: NormalizedProduct[] = rows.map((row) => {
        const price = asNumber(row.price)
        const imageUrl = typeof row.imageUrl === 'string' && row.imageUrl.trim() ? row.imageUrl.trim() : null
        return {
          brand: null,
          category: null,
          description: row.description,
          ean: null,
          id: row.id,
          imageUrl,
          name: row.name,
          price,
          priceText: formatPrice(price),
          store: row.supplier.businessName,
          unitInfo: row.unit ?? null,
          url: null,
          source: 'supplier',
          supplierId: row.supplier.id,
        }
      })
      res.status(200).json({ items, page, pageSize, total })
      return
    } catch (error) {
      console.error('Local supplier products failed', error)
      res.status(503).json({ message: 'Unable to load products right now.' })
      return
    }
  }

  if (!hasSearch && !hasCategory) {
    try {
      const prisma = getPrismaClient()
      const where: any = {
        storeCode: selectedStore ?? undefined,
        currentPrice: { not: null },
        catalogProduct: { imageUrl: { gt: '', notIn: PLACEHOLDER_IMAGE_URLS } },
      }
      const [rows, total] = await Promise.all([
        prisma.catalogProductPrice.findMany({
          where,
          include: { catalogProduct: true },
          orderBy: { updatedAt: 'desc' as const },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.catalogProductPrice.count({ where }),
      ])

      res.status(200).json({
        items: (rows as any[])
          .map((row) => toMarketplaceProduct(row as Parameters<typeof toMarketplaceProduct>[0]))
          .filter((item) => item.imageUrl !== null),
        page,
        pageSize,
        total,
      })
      return
    } catch (error) {
      console.error('Product discovery failed', error)
      res.status(503).json({ message: 'Unable to load products right now.' })
      return
    }
  }

  try {
    const prisma = getPrismaClient()
    const productFilters = [buildSearchFilter(q), buildCategoryFilter(category)].filter(Boolean)
    const imageFilter = { imageUrl: { gt: '', notIn: PLACEHOLDER_IMAGE_URLS } }
    const where: any = {
      storeCode: selectedStore ?? undefined,
      catalogProduct: productFilters.length > 0 ? { AND: [...productFilters, imageFilter] } : imageFilter,
    }

    const useRelevanceRanking = sort === 'relevance' && hasSearch
    const fetchSize = useRelevanceRanking ? Math.min(500, pageSize * 8) : pageSize
    const skipAmount = useRelevanceRanking ? 0 : (page - 1) * pageSize

    const [rows, total] = await Promise.all([
      prisma.catalogProductPrice.findMany({
        where,
        include: {
          catalogProduct: true,
        },
        orderBy: buildOrderBy(sort) as any,
        skip: skipAmount,
        take: fetchSize,
      }),
      prisma.catalogProductPrice.count({ where }),
    ])

    let items = (rows as any[])
      .map((row) => toMarketplaceProduct(row as Parameters<typeof toMarketplaceProduct>[0]))
      .filter((item) => item.imageUrl !== null)

    if (useRelevanceRanking) {
      items = rankByRelevance(items, q)
      const start = (page - 1) * pageSize
      items = items.slice(start, start + pageSize)
    } else {
      items.sort((a, b) => {
        const imgA = a.imageUrl ? 0 : 1
        const imgB = b.imageUrl ? 0 : 1
        return imgA - imgB
      })
    }

    res.status(200).json({
      items,
      page,
      pageSize,
      total,
    })
  } catch (error) {
    console.error('Product discovery failed', error)
    res.status(503).json({
      message: 'Unable to load products right now.',
    })
  }
})

/**
 * Return a deduplicated list of all store codes and display names found in
 * the catalog, ordered alphabetically by store name. Used to populate the
 * store filter dropdown on the frontend.
 *
 * @route {GET} /stores
 * @access public
 */
productsRouter.get('/stores', async (_req, res) => {
  try {
    const prisma = getPrismaClient()
    const stores = await prisma.catalogProductPrice.findMany({
      select: { storeCode: true, storeName: true },
      distinct: ['storeCode'],
      orderBy: { storeName: 'asc' },
    })
    res.status(200).json(
      stores.map((s) => ({ code: s.storeCode, name: s.storeName })),
    )
  } catch (error) {
    console.error('Failed to load stores', error)
    res.status(503).json({ message: 'Unable to load stores right now.' })
  }
})

/**
 * Generates a human-readable reason string explaining why `candidate` is a
 * suitable substitution for `base`. Prefers brand-match wording, then
 * category-match, then a generic fallback.
 */
function buildSubstitutionReason(
  candidate: { brand: string | null; category: string | null; name: string },
  base: { brand: string | null; category: string | null; name: string },
): string {
  if (candidate.brand && candidate.brand === base.brand) {
    return `Same brand (${candidate.brand}), lower price`
  }
  if (candidate.category && candidate.category === base.category) {
    return `Alternative in ${candidate.category}`
  }
  return `Similar product at a lower price`
}

/**
 * Return up to 5 cheaper substitute products for the given catalog product
 * price entry. Uses vector-embedding similarity search to find candidates,
 * then applies strict filters (same category, similar unit, token overlap,
 * similarity >= 0.70) with a loose fallback (similarity >= 0.68, unit
 * ignored) when no strict matches are found. Results are sorted by savings
 * amount descending.
 *
 * @route {GET} /:productId/substitutions
 * @access public
 */
productsRouter.get('/:productId/substitutions', async (req, res) => {
  const productId = typeof req.params.productId === 'string' ? req.params.productId.trim() : ''

  if (!productId) {
    res.status(400).json({ message: 'Product ID is required.' })
    return
  }

  try {
    const prisma = getPrismaClient()

    const priceRow = await prisma.catalogProductPrice.findUnique({
      where: { id: productId },
      include: {
        catalogProduct: true,
      },
    })

    if (!priceRow) {
      res.status(404).json({ message: 'Product not found.' })
      return
    }

    const baseProduct = priceRow.catalogProduct
    const similar = await findSimilarProductsForProduct(baseProduct.id, { limit: 100 })

    if (similar.length === 0) {
      res.status(200).json({ suggestions: [] })
      return
    }

    const similarProductIds = similar.map((entry) => entry.productId)

    const candidatePrices = await prisma.catalogProductPrice.findMany({
      where: {
        catalogProductId: { in: similarProductIds },
        currentPrice: { not: null },
      },
      include: {
        catalogProduct: true,
      },
    })

    const baseUnitPrice = priceRow.currentPrice
    if (!baseUnitPrice) {
      res.status(200).json({ suggestions: [] })
      return
    }

    // Store names and generic words that appear in product names but carry no product-type signal
    const TOKEN_STOP_WORDS = new Set([
      'coop', 'meny', 'rema', 'rema1000', 'spar', 'joker', 'kiwi', 'bunnpris', 'oda',
      'nrg', 'prior', 'gilde', 'tine', 'stabburet', 'norgesgruppen', 'ica', 'extra',
      'den', 'norske', 'the', 'and', 'for', 'med', 'fra', 'til', 'uten', 'eller',
    ])

    function tokenize(text: string | null | undefined): string[] {
      if (!text) return []
      return text
        .toLowerCase()
        .replace(/[^a-zæøå0-9\s]/gi, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !/^\d/.test(token) && !TOKEN_STOP_WORDS.has(token))
    }

    const baseTokens = new Set(tokenize(baseProduct.name))
    const baseCategory = baseProduct.category ?? null
    const baseUnit = baseProduct.unit ?? null

    // Can't safely substitute if we have no meaningful product tokens or no category
    if (baseTokens.size === 0 || !baseCategory) {
      res.status(200).json({ suggestions: [] })
      return
    }

    function hasTokenOverlap(candidateName: string | null | undefined): boolean {
      const tokens = tokenize(candidateName)
      return tokens.some((t) => baseTokens.has(t))
    }

    function isSimilarUnit(candidateUnit: string | null | undefined): boolean {
      if (!baseUnit || !candidateUnit) return true
      return baseUnit.toLowerCase() === candidateUnit.toLowerCase()
    }

    const strictFiltered = candidatePrices
      .map((candidate) => {
        if (!candidate.currentPrice) return null

        const similarity = similar.find((entry) => entry.productId === candidate.catalogProductId)?.similarity ?? 0
        if (similarity < 0.70) return null

        const price = candidate.currentPrice
        const isCheaperOrEqual = price.lte(baseUnitPrice)
        if (!isCheaperOrEqual) return null

        if (candidate.catalogProduct.category !== baseCategory) return null
        if (!isSimilarUnit(candidate.catalogProduct.unit)) return null
        if (!hasTokenOverlap(candidate.catalogProduct.name)) return null

        const savingsAmount = baseUnitPrice.minus(price)
        const savingsPercentage = baseUnitPrice.gt(0) ? savingsAmount.div(baseUnitPrice).times(100) : null

        const reason = buildSubstitutionReason(candidate.catalogProduct, baseProduct)

        return {
          priceId: candidate.id,
          name: candidate.catalogProduct.name,
          brand: candidate.catalogProduct.brand,
          imageUrl: candidate.catalogProduct.imageUrl,
          unit: candidate.catalogProduct.unit,
          storeCode: candidate.storeCode,
          storeName: candidate.storeName,
          price: Number(price),
          savingsAmount: Number(savingsAmount),
          savingsPercentage: savingsPercentage ? Number(savingsPercentage) : null,
          similarity,
          reason,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    const looseFiltered =
      strictFiltered.length > 0
        ? strictFiltered
        : candidatePrices
            .map((candidate) => {
              if (!candidate.currentPrice) return null

              const similarity = similar.find((entry) => entry.productId === candidate.catalogProductId)?.similarity ?? 0
              if (similarity < 0.68) return null

              const price = candidate.currentPrice
              const isCheaperOrEqual = price.lte(baseUnitPrice)
              if (!isCheaperOrEqual) return null

              if (candidate.catalogProduct.category !== baseCategory) return null
              if (!hasTokenOverlap(candidate.catalogProduct.name)) return null

              const savingsAmount = baseUnitPrice.minus(price)
              const savingsPercentage = baseUnitPrice.gt(0) ? savingsAmount.div(baseUnitPrice).times(100) : null

              const reason = buildSubstitutionReason(candidate.catalogProduct, baseProduct)

              return {
                priceId: candidate.id,
                name: candidate.catalogProduct.name,
                brand: candidate.catalogProduct.brand,
                imageUrl: candidate.catalogProduct.imageUrl,
                unit: candidate.catalogProduct.unit,
                storeCode: candidate.storeCode,
                storeName: candidate.storeName,
                price: Number(price),
                savingsAmount: Number(savingsAmount),
                savingsPercentage: savingsPercentage ? Number(savingsPercentage) : null,
                similarity,
                reason,
              }
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))

    looseFiltered.sort((a, b) => {
      if (b.savingsAmount !== a.savingsAmount) return b.savingsAmount - a.savingsAmount
      return b.similarity - a.similarity
    })

    const suggestions = looseFiltered.slice(0, 5)

    res.status(200).json({ suggestions })
  } catch (error) {
    console.error('Product substitutions failed', error)
    res.status(503).json({ message: 'Unable to load substitutions right now.' })
  }
})

/**
 * Trigger a full catalog sync from the Kassal API. Protected by a shared
 * secret passed in the `x-catalog-sync-secret` request header. Intended for
 * use by an automated cron job or CI pipeline, not end users.
 *
 * @route {POST} /sync
 * @access admin
 * @note Requires the `CATALOG_SYNC_SECRET` environment variable to be set.
 *       Calls `syncCatalog` which may run for several minutes on a large
 *       catalog.
 */
productsRouter.post('/sync', async (req, res) => {
  const configuredSecret = process.env.CATALOG_SYNC_SECRET?.trim() ?? ''
  const providedSecret = req.get('x-catalog-sync-secret')?.trim() ?? ''

  let authorized = false
  if (configuredSecret && providedSecret && configuredSecret.length === providedSecret.length) {
    try {
      authorized = crypto.timingSafeEqual(Buffer.from(configuredSecret, 'utf8'), Buffer.from(providedSecret, 'utf8'))
    } catch {
      authorized = false
    }
  }

  if (!authorized) {
    res.status(401).json({
      message: 'Catalog sync is not authorized.',
    })
    return
  }

  try {
    const syncResult = await syncCatalog({ logger: console })

    res.status(200).json({
      ...syncResult,
    })
  } catch (error) {
    console.error('Catalog sync failed', error)
    res.status(503).json({
      message: 'Unable to sync the catalog right now.',
    })
  }
})

export default productsRouter
