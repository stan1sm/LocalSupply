import { getPrismaClient } from './prisma.js'

const KASSAL_DEFAULT_API_BASE_URL = 'https://kassal.app/api/v1'
const KASSAL_DEFAULT_SYNC_PAGE_SIZE = 100
const DEFAULT_REQUEST_DELAY_MS = 1_750
const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000
const MAX_FETCH_RETRIES = 8

type SyncableCatalogEntry = {
  brand: string | null
  category: string | null
  currentPrice: number | null
  currentUnitPrice: number | null
  currentUnitPriceUnit: string | null
  externalId: string
  gtin: string | null
  imageUrl: string | null
  lastCheckedAt: Date | null
  name: string
  productUrl: string | null
  storeCode: string
  storeName: string
  unit: string | null
}

type CatalogProductInput = {
  brand: string | null
  catalogKey: string
  category: string | null
  externalId?: string
  gtin: string | null
  imageUrl: string | null
  name: string
  unit: string | null
}

type CachedCatalogProduct = {
  data: CatalogProductInput
  id: string
}

type LoggerLike = Pick<Console, 'error' | 'info' | 'warn'>

export type CatalogSyncOptions = {
  logger?: LoggerLike
  maxPages?: number
  pageSize?: number
  requestDelayMs?: number
  startPage?: number
}

export type CatalogSyncResult = {
  fetchedListings: number
  importedPrices: number
  importedProducts: number
  pagesSynced: number
  storesSynced: string[]
}

/** Strips trailing slashes from a URL string, defaulting to the Kassal API base. */
function normalizeBaseUrl(value: string | undefined) {
  return (value ?? KASSAL_DEFAULT_API_BASE_URL).trim().replace(/\/+$/, '')
}

function getKassalApiKey() {
  return process.env.KASSAL_API_KEY?.trim() || process.env.KASSALAPP_API_KEY?.trim()
}

function getKassalApiBaseUrl() {
  return normalizeBaseUrl(process.env.KASSAL_API_BASE_URL)
}

/** Casts `value` to a trimmed string, returning null for empty or non-string values. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/** Safely coerces `value` to a finite number, handling comma-decimal strings; returns null on failure. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = Number(value.replace(',', '.'))
    return Number.isFinite(normalized) ? normalized : null
  }

  return null
}

function getConfiguredRequestDelayMs(value: number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }

  const fromEnv = asNumber(process.env.CATALOG_SYNC_REQUEST_DELAY_MS)
  if (fromEnv !== null) {
    return Math.max(0, fromEnv)
  }

  return DEFAULT_REQUEST_DELAY_MS
}

/** Parses `value` into a valid Date, returning null for invalid or missing input. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function extractItems(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const candidates = [record.data, record.items, record.results]
  const rawItems = candidates.find(Array.isArray)
  return Array.isArray(rawItems) ? rawItems : []
}

function extractStoreObject(record: Record<string, unknown>) {
  const rawStore = record.store

  if (Array.isArray(rawStore)) {
    const firstStore = rawStore.find((entry) => entry && typeof entry === 'object')
    return firstStore && typeof firstStore === 'object' ? (firstStore as Record<string, unknown>) : null
  }

  return rawStore && typeof rawStore === 'object' ? (rawStore as Record<string, unknown>) : null
}

function extractCategoryName(record: Record<string, unknown>) {
  const rawCategory = record.category

  if (Array.isArray(rawCategory)) {
    const categoryEntries = rawCategory.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    const deepest = categoryEntries.at(-1)
    return deepest ? asString(deepest.name) : null
  }

  if (rawCategory && typeof rawCategory === 'object') {
    return asString((rawCategory as Record<string, unknown>).name)
  }

  return asString(rawCategory) ?? asString(record.main_category)
}

function extractUnit(record: Record<string, unknown>) {
  const weight = asNumber(record.weight)
  const weightUnit = asString(record.weight_unit)

  if (weight !== null && weightUnit) {
    return `${weight} ${weightUnit}`
  }

  return weightUnit
}

/** Maps a raw Kassal API product record to a `SyncableCatalogEntry`; returns null if the record lacks an id or name. */
function normalizeCatalogEntry(product: unknown): SyncableCatalogEntry | null {
  if (!product || typeof product !== 'object') {
    return null
  }

  const record = product as Record<string, unknown>
  const numericId = asNumber(record.id) ?? asNumber(record.product_id)
  const externalId = asString(record.id) ?? asString(record.product_id) ?? (numericId !== null ? String(numericId) : null)
  const name =
    asString(record.name) ??
    asString(record.full_name) ??
    asString(record.title) ??
    asString(record.display_name) ??
    null

  if (!externalId || !name) {
    return null
  }

  const storeObject = extractStoreObject(record)
  const storeCode = asString(storeObject?.code) ?? 'UNKNOWN'
  const storeName = asString(storeObject?.name) ?? storeCode.replace(/_/g, ' ')
  const currentPrice =
    asNumber(record.current_price) ??
    asNumber(record.price) ??
    asNumber((record.current_price as Record<string, unknown> | undefined)?.price)
  const currentUnitPrice = asNumber(record.current_unit_price)
  const currentUnitPriceUnit = asString(record.weight_unit)

  return {
    brand: asString(record.brand),
    category: extractCategoryName(record),
    currentPrice,
    currentUnitPrice,
    currentUnitPriceUnit,
    externalId,
    gtin: asString(record.ean),
    imageUrl: asString(record.image) ?? asString(record.image_url),
    lastCheckedAt: asDate(record.updated_at) ?? asDate(record.created_at) ?? new Date(),
    name,
    productUrl: asString(record.url),
    storeCode,
    storeName,
    unit: extractUnit(record),
  }
}

/** Normalises a string to lowercase ASCII with single spaces, used as a stable catalog key component. */
function normalizeLookupToken(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Returns a stable catalog key: `gtin:<ean>` when available, otherwise a `fallback:<name>|<brand>|<unit>|<category>` hash. */
function buildCatalogKey(entry: SyncableCatalogEntry) {
  if (entry.gtin) {
    return `gtin:${normalizeLookupToken(entry.gtin)}`
  }

  const namePart = normalizeLookupToken(entry.name)
  const brandPart = normalizeLookupToken(entry.brand)
  const unitPart = normalizeLookupToken(entry.unit)
  const categoryPart = normalizeLookupToken(entry.category)

  return `fallback:${namePart}|${brandPart}|${unitPart}|${categoryPart}`
}

/** Keeps `nextValue` if it is longer than `currentValue` or if `currentValue` is null/empty. */
function mergePreferredValue(currentValue: string | null, nextValue: string | null) {
  if (!currentValue && nextValue) {
    return nextValue
  }

  if (currentValue && nextValue && nextValue.length > currentValue.length) {
    return nextValue
  }

  return currentValue
}

/**
 * Merges a new catalog entry into an existing `CatalogProductInput`, preferring longer/more-specific values.
 * Creates a fresh input object when `currentValue` is null.
 */
function mergeCatalogProductInput(currentValue: CatalogProductInput | null, entry: SyncableCatalogEntry): CatalogProductInput {
  if (!currentValue) {
    return {
      brand: entry.brand,
      catalogKey: buildCatalogKey(entry),
      category: entry.category,
      externalId: entry.externalId,
      gtin: entry.gtin,
      imageUrl: entry.imageUrl,
      name: entry.name,
      unit: entry.unit,
    }
  }

  return {
    brand: mergePreferredValue(currentValue.brand, entry.brand),
    catalogKey: currentValue.catalogKey,
    category: mergePreferredValue(currentValue.category, entry.category),
    externalId: currentValue.externalId ?? entry.externalId,
    gtin: currentValue.gtin ?? entry.gtin,
    imageUrl: mergePreferredValue(currentValue.imageUrl, entry.imageUrl),
    name: entry.name.length > currentValue.name.length ? entry.name : currentValue.name,
    unit: mergePreferredValue(currentValue.unit, entry.unit),
  }
}

function buildSyncProductsUrl(page: number, pageSize: number) {
  const url = new URL(`${getKassalApiBaseUrl()}/products`)
  url.searchParams.set('page', String(page))
  url.searchParams.set('size', String(pageSize))
  url.searchParams.set('unique', '0')
  return url
}

/**
 * Fetches a paginated Kassal API URL with retry logic.
 * Respects the `Retry-After` header on 429 responses and backs off exponentially on 5xx errors.
 */
async function fetchKassalJson(url: URL, options: { logger?: LoggerLike; requestDelayMs: number }) {
  const apiKey = getKassalApiKey()
  if (!apiKey) {
    throw new Error('KASSAL_API_KEY is not configured.')
  }

  for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt += 1) {
    let response: Response

    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      })
    } catch (error) {
      if (attempt === MAX_FETCH_RETRIES) {
        throw error
      }

      const waitMs = Math.max(DEFAULT_REQUEST_DELAY_MS, attempt * DEFAULT_REQUEST_DELAY_MS)
      options.logger?.warn(`Catalog sync: request threw ${error instanceof Error ? error.message : 'an unknown error'}, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_FETCH_RETRIES})`)
      await sleep(waitMs)
      continue
    }

    if (response.ok) {
      if (options.requestDelayMs > 0) {
        await sleep(options.requestDelayMs)
      }

      return (await response.json()) as unknown
    }

    const bodyText = await response.text().catch(() => '')
    const isRetriable = response.status === 429 || response.status >= 500

    if (!isRetriable || attempt === MAX_FETCH_RETRIES) {
      throw new Error(`Kassal request failed with ${response.status}: ${bodyText}`.slice(0, 400))
    }

    const waitMs =
      response.status === 429
        ? parseRetryAfterMs(response)
        : Math.max(DEFAULT_REQUEST_DELAY_MS, attempt * DEFAULT_REQUEST_DELAY_MS)

    options.logger?.warn(`Catalog sync: request failed with ${response.status}, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_FETCH_RETRIES})`)
    await sleep(waitMs)
  }

  throw new Error('Kassal request retries exhausted.')
}

/** Returns true if the API response has a `links.next` URL or if the page was full (suggesting more pages exist). */
function hasNextPage(payload: unknown, itemsLength: number, pageSize: number) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const links = record.links && typeof record.links === 'object' ? (record.links as Record<string, unknown>) : {}
  const nextLink = asString(links.next)

  if (nextLink) {
    return true
  }

  return itemsLength === pageSize
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getHeader(response: Response, name: string) {
  return response.headers.get(name) ?? response.headers.get(name.toLowerCase())
}

/** Parses the `Retry-After` header (seconds integer or HTTP-date) and returns a wait duration in milliseconds. */
function parseRetryAfterMs(response: Response) {
  const retryAfterHeader = getHeader(response, 'retry-after')

  if (!retryAfterHeader) {
    return DEFAULT_RATE_LIMIT_DELAY_MS
  }

  const seconds = Number(retryAfterHeader)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000)
  }

  const retryAt = new Date(retryAfterHeader)
  if (Number.isNaN(retryAt.getTime())) {
    return DEFAULT_RATE_LIMIT_DELAY_MS
  }

  return Math.max(DEFAULT_RATE_LIMIT_DELAY_MS, retryAt.getTime() - Date.now())
}

/** Upserts a catalog product by its stable `catalogKey`; returns the record's id. */
async function upsertCatalogProduct(catalogKey: string, nextValue: CatalogProductInput) {
  const prisma = getPrismaClient()

  return prisma.catalogProduct.upsert({
    where: { catalogKey },
    create: {
      brand: nextValue.brand,
      catalogKey: nextValue.catalogKey,
      category: nextValue.category,
      ...(nextValue.externalId ? { externalId: nextValue.externalId } : {}),
      gtin: nextValue.gtin,
      imageUrl: nextValue.imageUrl,
      name: nextValue.name,
      unit: nextValue.unit,
    },
    update: {
      brand: nextValue.brand,
      category: nextValue.category,
      ...(nextValue.externalId ? { externalId: nextValue.externalId } : {}),
      gtin: nextValue.gtin,
      imageUrl: nextValue.imageUrl,
      name: nextValue.name,
      unit: nextValue.unit,
    },
    select: {
      id: true,
    },
  })
}

/** Upserts a per-store price row for a catalog product, keyed by (catalogProductId, storeCode). */
async function upsertCatalogPrice(catalogProductId: string, entry: SyncableCatalogEntry) {
  const prisma = getPrismaClient()

  await prisma.catalogProductPrice.upsert({
    where: {
      catalogProductId_storeCode: {
        catalogProductId,
        storeCode: entry.storeCode,
      },
    },
    create: {
      catalogProductId,
      currentPrice: entry.currentPrice,
      currentUnitPrice: entry.currentUnitPrice,
      currentUnitPriceUnit: entry.currentUnitPriceUnit,
      externalId: entry.externalId,
      lastCheckedAt: entry.lastCheckedAt,
      productUrl: entry.productUrl,
      storeCode: entry.storeCode,
      storeName: entry.storeName,
    },
    update: {
      currentPrice: entry.currentPrice,
      currentUnitPrice: entry.currentUnitPrice,
      currentUnitPriceUnit: entry.currentUnitPriceUnit,
      externalId: entry.externalId,
      lastCheckedAt: entry.lastCheckedAt,
      productUrl: entry.productUrl,
      storeName: entry.storeName,
    },
  })
}

/**
 * Paginates through the Kassal product catalog and upserts all products and per-store prices into the DB.
 * Deduplicates catalog products across stores using a stable catalog key (GTIN or name/brand/unit fallback).
 * Throws if no rows were imported on a fresh run (startPage === 1).
 */
export async function syncCatalog(options: CatalogSyncOptions = {}): Promise<CatalogSyncResult> {
  const logger = options.logger ?? console
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? KASSAL_DEFAULT_SYNC_PAGE_SIZE))
  const maxPages = options.maxPages && options.maxPages > 0 ? options.maxPages : Number.POSITIVE_INFINITY
  const requestDelayMs = getConfiguredRequestDelayMs(options.requestDelayMs)
  const catalogProducts = new Map<string, CachedCatalogProduct>()
  const upsertedPriceKeys = new Set<string>()
  const storesSeen = new Set<string>()
  let fetchedListings = 0
  let importedPrices = 0
  let pagesSynced = 0

  const startPage = options.startPage && options.startPage > 1 ? options.startPage : 1

  if (startPage > 1) {
    logger.info(`Catalog sync: resuming from page ${startPage}`)
  }

  for (let page = startPage; page <= (startPage + maxPages - 1); page += 1) {
    const payload = await fetchKassalJson(buildSyncProductsUrl(page, pageSize), {
      logger,
      requestDelayMs,
    })
    const items = extractItems(payload)

    if (items.length === 0) {
      break
    }

    pagesSynced += 1
    logger.info(`Catalog sync: page ${page} fetched (${items.length} listings)`)

    for (const item of items) {
      const entry = normalizeCatalogEntry(item)
      if (!entry) {
        continue
      }

      fetchedListings += 1
      storesSeen.add(entry.storeCode)

      const catalogKey = buildCatalogKey(entry)
      const cachedProduct = catalogProducts.get(catalogKey) ?? null
      const nextProduct = mergeCatalogProductInput(cachedProduct?.data ?? null, entry)
      const productRecord = await upsertCatalogProduct(catalogKey, nextProduct)

      catalogProducts.set(catalogKey, {
        data: nextProduct,
        id: productRecord.id,
      })

      await upsertCatalogPrice(productRecord.id, entry)
      upsertedPriceKeys.add(`${productRecord.id}:${entry.storeCode}`)
      importedPrices = upsertedPriceKeys.size
    }

    if (!hasNextPage(payload, items.length, pageSize)) {
      break
    }
  }

  if (catalogProducts.size === 0 && importedPrices === 0 && startPage === 1) {
    throw new Error('Catalog sync returned no importable rows.')
  }

  return {
    fetchedListings,
    importedPrices,
    importedProducts: catalogProducts.size,
    pagesSynced,
    storesSynced: Array.from(storesSeen).sort((left, right) => left.localeCompare(right)),
  }
}
