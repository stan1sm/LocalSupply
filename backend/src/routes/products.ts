import { Router } from 'express'
import { syncCatalog } from '../lib/catalogSync.js'
import { getPrismaClient } from '../lib/prisma.js'

const productsRouter = Router()
const KASSAL_DEFAULT_PAGE_SIZE = 50

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
    imageUrl: row.catalogProduct.imageUrl,
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

  if ((!q || q.length < 3) && !category) {
    res.status(200).json({
      items: [],
      page,
      pageSize,
      total: 0,
    })
    return
  }

  try {
    const prisma = getPrismaClient()
    const productFilters = [buildSearchFilter(q), buildCategoryFilter(category)].filter(Boolean)
    const where: any = {
      storeCode: selectedStore ?? undefined,
      catalogProduct: productFilters.length > 0 ? { AND: productFilters } : undefined,
    }

    const [rows, total] = await Promise.all([
      prisma.catalogProductPrice.findMany({
        where,
        include: {
          catalogProduct: true,
        },
        orderBy: buildOrderBy(sort) as any,
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
  } catch (error) {
    console.error('Product discovery failed', error)
    res.status(503).json({
      message: 'Unable to load products right now.',
    })
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
