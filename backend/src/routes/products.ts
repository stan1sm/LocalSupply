import { Router } from 'express'
import { syncCatalog } from '../lib/catalogSync.js'
import { getPrismaClient } from '../lib/prisma.js'

const productsRouter = Router()
const KASSAL_DEFAULT_PAGE_SIZE = 50

const PLACEHOLDER_IMAGE_URLS = [
  'https://nettbutikk.bunnpris.no/itemImages/noimage_f.png',
  'https://res.cloudinary.com/norgesgruppen/image/upload/Product/404.jpg',
]

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

type CategoryDefinition = {
  id: string
  kassalCategories: string[]
}

const categoryDefinitions: CategoryDefinition[] = [
  { id: 'produce', kassalCategories: ['Salater', 'Grønnsaker, frosne'] },
  { id: 'dairy', kassalCategories: ['Gulost', 'Yoghurt', 'Hvitmuggost', 'Blåmuggost', 'Smøreost', 'Brunost'] },
  { id: 'pantry', kassalCategories: ['Knekkebrød', 'Brød', 'Frokostblanding', 'Barnegrøt', 'Pastasaus', 'Ferdigmåltid', 'Pizza'] },
  { id: 'protein', kassalCategories: ['Saltpølser', 'Påleggskinker', 'Spekepølser', 'Spekeskinker', 'Kjøttpålegg', 'Bacon', 'Sild/ansjos', 'Leverpostei'] },
  { id: 'drinks', kassalCategories: ['Brus', 'Juice', 'Vann med kullsyre', 'Energidrikk', 'Te', 'Smoothie', 'Saft', 'Ferdigdrink', 'Kaffekapsler', 'Hele kaffebønner', 'Vann', 'Alkoholfritt øl'] },
]

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

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

function formatPrice(price: number | null) {
  if (price === null) {
    return null
  }

  return `${price.toFixed(2)} kr`
}

function formatUnitInfo(currentUnitPrice: number | null, currentUnitPriceUnit: string | null, fallbackUnit: string | null) {
  if (currentUnitPrice !== null && currentUnitPriceUnit) {
    return `${currentUnitPrice.toFixed(2)} kr/${currentUnitPriceUnit}`
  }

  return fallbackUnit
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').toLowerCase()
}

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
    imageUrl: row.catalogProduct.imageUrl && !PLACEHOLDER_IMAGE_URLS.includes(row.catalogProduct.imageUrl) ? row.catalogProduct.imageUrl : null,
    name: row.catalogProduct.name,
    price,
    priceText: formatPrice(price),
    store: row.storeName,
    unitInfo: formatUnitInfo(currentUnitPrice, row.currentUnitPriceUnit, row.catalogProduct.unit),
    url: row.productUrl,
  }
}

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
      const where: { isActive: boolean; OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; description?: { contains: string; mode: 'insensitive' } }> } = {
        isActive: true,
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
        items: (rows as any[]).map((row) => toMarketplaceProduct(row as Parameters<typeof toMarketplaceProduct>[0])),
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
    const where: any = {
      storeCode: selectedStore ?? undefined,
      catalogProduct: productFilters.length > 0 ? { AND: productFilters } : undefined,
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

    let items = (rows as any[]).map((row) => toMarketplaceProduct(row as Parameters<typeof toMarketplaceProduct>[0]))

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

productsRouter.post('/sync', async (req, res) => {
  const configuredSecret = process.env.CATALOG_SYNC_SECRET?.trim()
  const providedSecret = req.get('x-catalog-sync-secret')?.trim()

  if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
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
