'use client'

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'
import { ToastContainer } from '../../components/Toast'
import { useToast } from '../../components/useToast'

function productImageSrc(url: string | null): string | null {
  if (!url) return null
  return url.startsWith('/') ? buildApiUrl(url) : url
}

type Product = {
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

type ProductResponse = {
  items?: Product[]
  message?: string
  page?: number
  pageSize?: number
  total?: number
}

type CartItem = {
  id: string
  imageUrl: string | null
  name: string
  price: number
  quantity: number
  store: string | null
  unitInfo: string | null
}

type Substitution = {
  priceId: string
  name: string
  brand: string | null
  imageUrl: string | null
  unit: string | null
  storeName: string
  price: number
  savingsAmount: number
  savingsPercentage: number | null
  reason: string
}

type CategoryOption = {
  id: string
  label: string
}

type NavItem = {
  href: string
  icon: string
  id: string
  label: string
}

type StoreOption = {
  label: string
  value: string
}

const PAGE_SIZE = 50
const CART_STORAGE_KEY = 'localsupply-marketplace-cart'

const categoryOptions: CategoryOption[] = [
  { id: 'all', label: 'All' },
  { id: 'local-suppliers', label: 'Local suppliers' },
  { id: 'produce', label: 'Fresh Produce' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'pantry', label: 'Pantry Staples' },
  { id: 'protein', label: 'Meat & Seafood' },
  { id: 'drinks', label: 'Beverages' },
]

const navItems: NavItem[] = [
  { id: 'marketplace', label: 'Marketplace', icon: 'M', href: '/marketplace/dashboard' },
  { id: 'suppliers', label: 'Suppliers', icon: 'S', href: '/suppliers' },
  { id: 'my-cart', label: 'My Cart', icon: 'C', href: '/cart' },
  { id: 'orders', label: 'Orders', icon: 'O', href: '/orders' },
  { id: 'chats', label: 'Chats', icon: 'C', href: '/chat' },
  { id: 'delivery', label: 'Delivery Tracking', icon: 'T', href: '#' },
  { id: 'settings', label: 'Settings', icon: 'G', href: '/settings' },
]

const DEFAULT_STORE_OPTIONS: StoreOption[] = [
  { value: 'all', label: 'All stores' },
]

function formatCurrency(value: number) {
  return `${value.toFixed(2)} kr`
}

function sortProducts(products: Product[], sortBy: string) {
  const next = [...products]

  switch (sortBy) {
    case 'price-asc':
      next.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY))
      return next
    case 'price-desc':
      next.sort((a, b) => (b.price ?? Number.NEGATIVE_INFINITY) - (a.price ?? Number.NEGATIVE_INFINITY))
      return next
    case 'name-asc':
      next.sort((a, b) => a.name.localeCompare(b.name))
      return next
    case 'store-asc':
      next.sort((a, b) => (a.store ?? 'zzz').localeCompare(b.store ?? 'zzz'))
      return next
    default:
      return next
  }
}

export default function MarketplaceDashboardPage() {
  const { toasts, addToast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedStore, setSelectedStore] = useState('all')
  const [sortBy, setSortBy] = useState('relevance')
  const [products, setProducts] = useState<Product[]>([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>(DEFAULT_STORE_OPTIONS)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [substitutions, setSubstitutions] = useState<Record<string, Substitution[] | null>>({})
  const [loadingSubstitutions, setLoadingSubstitutions] = useState<Set<string>>(new Set())
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const deferredSearchQuery = useDeferredValue(searchQuery)
  const explicitSearchQuery = deferredSearchQuery.trim()
  const shouldRequestProducts = explicitSearchQuery.length >= 3 || Boolean(selectedCategoryId)
  const effectiveQuery = explicitSearchQuery
  const requestKeyRef = useRef('')
  const hasMore = products.length < totalProducts

  useEffect(() => {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
      if (storedCart) {
        const parsed = JSON.parse(storedCart) as CartItem[]
        if (Array.isArray(parsed)) {
          setCartItems(parsed)
        }
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))
  }, [cartItems])

  useEffect(() => {
    let cancelled = false
    async function fetchStores() {
      try {
        const url = buildApiUrl('/api/products/stores')
        const res = await fetch(url)
        if (!res.ok) return
        const data = (await res.json()) as { code: string; name: string }[]
        if (cancelled || !Array.isArray(data)) return
        setStoreOptions([
          { value: 'all', label: 'All stores' },
          ...data.map((s) => ({ value: s.code, label: s.name })),
        ])
      } catch { /* ignore */ }
    }
    fetchStores()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const controller = new AbortController()
    const requestKey = `${effectiveQuery || '<empty>'}::${selectedCategoryId}::${selectedStore}`
    requestKeyRef.current = requestKey

    async function loadInitialProducts() {
      setIsLoading(true)
      setErrorMessage('')
      setProducts([])
      setTotalProducts(0)
      setCurrentPage(1)

      if (!shouldRequestProducts) {
        setIsLoading(false)
        return
      }

      try {
        const url = new URL(buildApiUrl('/api/products'), window.location.origin)
        url.searchParams.set('page', '1')
        url.searchParams.set('pageSize', String(PAGE_SIZE))

        if (effectiveQuery) {
          url.searchParams.set('q', effectiveQuery)
        }
        if (selectedCategoryId && selectedCategoryId !== 'all') {
          url.searchParams.set('category', selectedCategoryId)
        }
        if (selectedStore !== 'all') {
          url.searchParams.set('store', selectedStore)
        }

        const response = await fetch(url.toString(), { signal: controller.signal })
        const payload = (await response.json().catch(() => ({}))) as ProductResponse

        if (!response.ok) {
          throw new Error(payload.message ?? 'Unable to load products right now.')
        }

        if (!isCancelled && requestKeyRef.current === requestKey) {
          setProducts(payload.items ?? [])
          setTotalProducts(payload.total ?? payload.items?.length ?? 0)
        }
      } catch (error) {
        if (controller.signal.aborted || isCancelled) {
          return
        }

        setProducts([])
        setTotalProducts(0)
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load products right now.')
      } finally {
        if (!isCancelled && requestKeyRef.current === requestKey) {
          setIsLoading(false)
        }
      }
    }

    loadInitialProducts()

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [effectiveQuery, selectedCategoryId, selectedStore, shouldRequestProducts])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoading || !hasMore) return
    const nextPage = currentPage + 1
    setIsLoadingMore(true)
    try {
      const url = new URL(buildApiUrl('/api/products'), window.location.origin)
      url.searchParams.set('page', String(nextPage))
      url.searchParams.set('pageSize', String(PAGE_SIZE))
      if (effectiveQuery) url.searchParams.set('q', effectiveQuery)
      if (selectedCategoryId && selectedCategoryId !== 'all') url.searchParams.set('category', selectedCategoryId)
      if (selectedStore !== 'all') url.searchParams.set('store', selectedStore)

      const response = await fetch(url.toString())
      const payload = (await response.json().catch(() => ({}))) as ProductResponse
      if (response.ok && payload.items && payload.items.length > 0) {
        setProducts((prev) => [...prev, ...payload.items!])
        setCurrentPage(nextPage)
      }
    } catch { /* ignore */ } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, isLoading, hasMore, currentPage, effectiveQuery, selectedCategoryId, selectedStore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore() },
      { rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  const filteredProducts = sortProducts(products, sortBy)

  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const estimatedDelivery = cartSubtotal > 0 ? 49 : 0
  const cartTotal = cartSubtotal + estimatedDelivery
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  function updateQuantity(product: Product, nextQuantity: number) {
    if (product.price === null) {
      return
    }

    const price = product.price

    setCartItems((current) => {
      const existingItem = current.find((item) => item.id === product.id)

      if (!existingItem && nextQuantity <= 0) {
        return current
      }

      if (!existingItem) {
        addToast(`${product.name} added to cart`, 'success')
        return [
          ...current,
          {
            id: product.id,
            imageUrl: product.imageUrl,
            name: product.name,
            price,
            quantity: nextQuantity,
            store: product.store,
            unitInfo: product.unitInfo,
          },
        ]
      }

      if (nextQuantity <= 0) {
        return current.filter((item) => item.id !== product.id)
      }

      return current.map((item) => (item.id === product.id ? { ...item, quantity: nextQuantity } : item))
    })
  }

  function getProductQuantity(productId: string) {
    return cartItems.find((item) => item.id === productId)?.quantity ?? 0
  }

  function handleProceedToCheckout() {
    if (cartItems.length === 0) return
    window.location.href = '/checkout'
  }

  async function fetchSubstitutions(itemId: string) {
    if (substitutions[itemId] !== undefined || loadingSubstitutions.has(itemId)) return
    setLoadingSubstitutions((prev) => new Set(prev).add(itemId))
    try {
      const res = await fetch(buildApiUrl(`/api/products/${encodeURIComponent(itemId)}/substitutions`))
      const data = (await res.json().catch(() => ({}))) as { suggestions?: Substitution[] }
      setSubstitutions((prev) => ({ ...prev, [itemId]: data.suggestions ?? [] }))
    } catch {
      setSubstitutions((prev) => ({ ...prev, [itemId]: [] }))
    } finally {
      setLoadingSubstitutions((prev) => { const next = new Set(prev); next.delete(itemId); return next })
    }
  }

  function swapCartItem(oldItemId: string, suggestion: Substitution, quantity: number) {
    setCartItems((current) =>
      current.map((item) =>
        item.id === oldItemId
          ? { id: suggestion.priceId, name: suggestion.name, price: suggestion.price, store: suggestion.storeName, imageUrl: suggestion.imageUrl, unitInfo: suggestion.unit, quantity }
          : item,
      ),
    )
    setSubstitutions((prev) => { const next = { ...prev }; delete next[oldItemId]; return next })
    addToast(`Swapped to ${suggestion.name}`, 'success')
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <ToastContainer toasts={toasts} />
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="px-2 pb-4">
            <a
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]"
              href="/"
            >
              <span aria-hidden="true">←</span>
              <span>LocalSupply</span>
            </a>
          </div>

          <nav aria-label="Marketplace navigation" className="space-y-1">
            {navItems.map((item) => {
              const isActive = item.id === 'marketplace'

              return (
                <a
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                    isActive ? 'bg-[#f0f4ef] text-[#1f2b22]' : 'text-[#4f5d52] hover:bg-[#f6faf5] hover:text-[#1f2b22]'
                  }`}
                  href={item.href}
                  key={item.id}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#d6dfd2] bg-white text-xs font-bold text-[#5a675d]">
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              )
            })}
          </nav>
          <div className="mt-4 border-t border-[#e5ece2] pt-4">
            <button
              onClick={() => {
                try { window.localStorage.removeItem('localsupply-user'); window.localStorage.removeItem('localsupply-token') } catch { /* ignore */ }
                window.location.href = '/login'
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-[#7a3a3a] transition hover:bg-[#fff5f5] hover:text-[#9b2c2c]"
              type="button"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#f0d4d4] bg-white text-xs font-bold text-[#9b2c2c]">↩</span>
              Sign out
            </button>
          </div>
        </aside>

        <section className="overflow-hidden rounded-[28px] border border-[#dce5d7] bg-white/92 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <header className="border-b border-[#e5ece2] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Marketplace</p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1c2b21]">Fresh grocery search across Norwegian stores</h1>

              </div>
              <div className="rounded-2xl border border-[#d9e3d4] bg-[#f6faf5] px-4 py-3 text-sm text-[#36513e]">
                <p className="font-semibold">
                  {selectedCategoryId === 'local-suppliers'
                    ? totalProducts > 0
                      ? `${totalProducts} product${totalProducts !== 1 ? 's' : ''} from local suppliers`
                      : 'Products from registered local suppliers'
                    : totalProducts > 0
                      ? `${totalProducts}+ imported products available`
                      : 'Imported catalog connection ready'}
                </p>
                <p className="mt-1 text-xs text-[#6a796f]">{shouldRequestProducts ? `Showing ${filteredProducts.length} of ${totalProducts} results` : 'Choose a category or search to begin'}</p>
              </div>
            </div>

            <div className={`mt-5 grid gap-4 ${selectedCategoryId === 'local-suppliers' ? 'lg:grid-cols-[minmax(0,1fr)_180px]' : 'lg:grid-cols-[minmax(0,1fr)_180px_180px]'}`}>
              <label className="rounded-2xl border border-[#dde5d9] bg-[#f7faf6] px-4 py-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Search</span>
                <input
                  className="mt-2 w-full bg-transparent text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a]"
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    if (event.target.value.trim().length > 0) {
                      setSelectedCategoryId('all')
                    }
                  }}
                  placeholder="Search for melk, ost, kaffe, epler..."
                  type="search"
                  value={searchQuery}
                />
              </label>
              <label className="rounded-2xl border border-[#dde5d9] bg-[#f7faf6] px-4 py-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Sort</span>
                <select
                  className="mt-2 w-full bg-transparent text-sm text-[#1f2937] outline-none"
                  onChange={(event) => setSortBy(event.target.value)}
                  value={sortBy}
                >
                  <option value="relevance">Recommended</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A-Z</option>
                  <option value="store-asc">Store: A-Z</option>
                </select>
              </label>
              {selectedCategoryId !== 'local-suppliers' ? (
                <label className="rounded-2xl border border-[#dde5d9] bg-[#f7faf6] px-4 py-3">
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Store</span>
                  <select
                    className="mt-2 w-full bg-transparent text-sm text-[#1f2937] outline-none"
                    onChange={(event) => setSelectedStore(event.target.value)}
                    value={selectedStore}
                  >
                    {storeOptions.map((store) => (
                      <option key={store.value} value={store.value}>
                        {store.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {categoryOptions.map((category) => (
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    category.id === selectedCategoryId
                      ? 'border-[#2f9f4f] bg-[#2f9f4f] text-white shadow-[0_10px_24px_rgba(47,159,79,0.24)]'
                      : 'border-[#d5ded1] bg-white text-[#415044] hover:border-[#9db5a4] hover:text-[#2f9f4f]'
                  }`}
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                  type="button"
                >
                  {category.label}
                </button>
              ))}
            </div>
          </header>

          <div className="px-5 py-5 sm:px-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#1f2b22]">Explore Products</h2>
                <p className="mt-1 text-sm text-[#6a796f]">
                  {filteredProducts.length} products in view{totalProducts > filteredProducts.length ? ` out of ${totalProducts} live matches` : ''}
                </p>
              </div>
              <div className="rounded-full bg-[#eff6ef] px-4 py-2 text-sm font-semibold text-[#2f9f4f]">{cartCount} items in cart</div>
            </div>

            {errorMessage ? (
              <div className="rounded-3xl border border-[#f0d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#9b2c2c]">{errorMessage}</div>
            ) : null}

            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div className="animate-pulse rounded-3xl border border-[#e6ede3] bg-[#f8faf7] p-3" key={index}>
                    <div className="h-28 rounded-2xl bg-[#e2e9df]" />
                    <div className="mt-3 h-4 rounded bg-[#e2e9df]" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-[#e2e9df]" />
                    <div className="mt-4 h-9 rounded-xl bg-[#e2e9df]" />
                  </div>
                ))}
              </div>
            ) : !shouldRequestProducts ? (
              <div className="rounded-3xl border border-dashed border-[#cfd9cb] bg-[#f8fbf7] px-6 py-16 text-center">
                <h3 className="text-lg font-semibold text-[#213026]">Search or choose a category to start browsing</h3>
                <p className="mt-2 text-sm text-[#6c7c71]">The marketplace stays search-first so you are not loading a broad 20k-product catalog into one screen.</p>
              </div>
            ) : (
              <div className="min-h-[34rem] pr-2">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {filteredProducts.map((product) => {
                    const quantity = getProductQuantity(product.id)

                    return (
                      <article className="group flex flex-col overflow-hidden rounded-3xl border border-[#e5ece2] bg-white shadow-[0_12px_24px_rgba(18,38,24,0.06)]" key={product.id}>
                        <div className="relative h-40 shrink-0 overflow-hidden bg-white">
                          {product.imageUrl ? (
                            <img
                              alt={product.name}
                              className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-105"
                              src={productImageSrc(product.imageUrl) ?? ''}
                              onError={(e) => {
                                const target = e.currentTarget
                                target.style.display = 'none'
                                const placeholder = target.parentElement?.querySelector('.img-placeholder')
                                if (placeholder) (placeholder as HTMLElement).style.display = 'flex'
                              }}
                            />
                          ) : null}
                          <div
                            className="img-placeholder h-full items-center justify-center text-4xl text-[#86a28f]"
                            style={{ display: product.imageUrl ? 'none' : 'flex' }}
                          >
                            <svg className="h-12 w-12 text-[#c5d4c0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[#1f2b22]">{product.name}</h3>
                              <p className="mt-1 truncate text-xs text-[#647267]">{product.brand ?? product.store ?? 'Store product'}</p>
                            </div>
                            {product.store ? (
                              <span className="shrink-0 rounded-full bg-[#eef7ef] px-2 py-1 text-[10px] font-semibold text-[#2f9f4f]">
                                {product.store}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2">
                            <p className="text-lg font-extrabold text-[#2f9f4f]">{product.priceText ?? 'Price unavailable'}</p>
                            <p className="truncate text-[11px] text-[#7b8b80]">
                              {product.unitInfo ?? product.category ?? (product.source === 'supplier' ? 'From local supplier' : 'Updated from store catalog')}
                            </p>
                          </div>
                          <div className="mt-auto pt-3">
                            {product.source === 'supplier' && product.supplierId ? (
                              <div className="flex gap-2">
                                <a
                                  className="flex-1 items-center justify-center rounded-2xl border-2 border-[#2f9f4f] bg-white px-3 py-2 text-center text-xs font-semibold text-[#2f9f4f] transition hover:bg-[#eaf7ee]"
                                  href={`/suppliers/${product.supplierId}`}
                                >
                                  View supplier
                                </a>
                                <a
                                  className="flex-1 items-center justify-center rounded-2xl bg-[#2f9f4f] px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#25813f]"
                                  href={`/suppliers/${product.supplierId}?buy=${encodeURIComponent(product.id)}`}
                                >
                                  Buy item
                                </a>
                              </div>
                            ) : quantity > 0 ? (
                              <div className="flex h-9 w-full items-center justify-between rounded-2xl bg-[#2f9f4f] px-3 text-xs font-semibold text-white">
                                <button
                                  className="grid h-7 w-7 place-items-center rounded-xl bg-white/10 text-xs font-semibold text-white hover:bg-white/20"
                                  disabled={product.price === null}
                                  onClick={() => updateQuantity(product, Math.max(quantity - 1, 0))}
                                  type="button"
                                >
                                  -
                                </button>
                                <span className="min-w-[2rem] text-center">{quantity}</span>
                                <button
                                  className="grid h-7 w-7 place-items-center rounded-xl bg-white/10 text-xs font-semibold text-white hover:bg-white/20"
                                  disabled={product.price === null}
                                  onClick={() => updateQuantity(product, quantity + 1)}
                                  type="button"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                className="h-9 w-full rounded-2xl bg-[#2f9f4f] px-3 text-xs font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#a0c6ab]"
                                disabled={product.price === null}
                                onClick={() => updateQuantity(product, 1)}
                                type="button"
                              >
                                Add to Cart
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
                {isLoadingMore && (
                  <div className="mt-4 flex justify-center py-6">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
                  </div>
                )}
                <div ref={sentinelRef} className="h-1" />
              </div>
            )}

            {!isLoading && !errorMessage && filteredProducts.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-[#cfd9cb] bg-[#f8fbf7] px-6 py-12 text-center">
                <h3 className="text-lg font-semibold text-[#213026]">No products matched this combination</h3>
                <p className="mt-2 text-sm text-[#6c7c71]">Try a broader search or switch category.</p>
              </div>
            ) : null}

          </div>
        </section>

        <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="border-b border-[#e5ece2] px-5 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Your Cart</p>
                <h2 className="mt-2 text-2xl font-bold text-[#1f2b22]">Smart cart</h2>
              </div>
              <span className="rounded-full bg-[#eff6ef] px-3 py-1 text-sm font-semibold text-[#2f9f4f]">{cartCount}</span>
            </div>
          </div>

          <div className="max-h-[560px] space-y-4 overflow-y-auto px-5 py-5">
            {cartItems.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#d2dcd0] bg-[#f8fbf7] px-5 py-10 text-center">
                      <p className="text-sm font-semibold text-[#304136]">Your cart is empty</p>
                      <p className="mt-2 text-sm text-[#728176]">Add products from the marketplace to start comparing totals.</p>
              </div>
            ) : (
              cartItems.map((item) => (
                <div className="flex gap-3 rounded-3xl border border-[#e6ede3] p-3" key={item.id}>
                  <div className="h-16 w-16 overflow-hidden rounded-2xl bg-[#eef5ee]">
                    {item.imageUrl ? <img alt={item.name} className="h-full w-full object-cover" src={productImageSrc(item.imageUrl) ?? ''} /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-[#1f2b22]">{item.name}</h3>
                    <p className="mt-1 text-xs text-[#6d7b70]">{item.store ?? item.unitInfo ?? 'Live product'}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="grid h-8 w-8 place-items-center rounded-xl border border-[#d4ddd0] text-[#516056]"
                          onClick={() =>
                            setCartItems((current) =>
                              current
                                .map((cartItem) =>
                                  cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity - 1 } : cartItem,
                                )
                                .filter((cartItem) => cartItem.quantity > 0),
                            )
                          }
                          type="button"
                        >
                          -
                        </button>
                        <span className="text-sm font-semibold text-[#1f2b22]">{item.quantity}</span>
                        <button
                          className="grid h-8 w-8 place-items-center rounded-xl border border-[#d4ddd0] text-[#516056]"
                          onClick={() =>
                            setCartItems((current) =>
                              current.map((cartItem) =>
                                cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem,
                              ),
                            )
                          }
                          type="button"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-sm font-bold text-[#2f9f4f]">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                    <div className="mt-2">
                      {substitutions[item.id] === undefined ? (
                        <button
                          className="text-[11px] font-semibold text-[#2f9f4f] hover:underline disabled:text-[#9ca3af]"
                          disabled={loadingSubstitutions.has(item.id)}
                          onClick={() => fetchSubstitutions(item.id)}
                          type="button"
                        >
                          {loadingSubstitutions.has(item.id) ? 'Finding alternatives…' : 'Find cheaper alternatives'}
                        </button>
                      ) : substitutions[item.id]!.length === 0 ? (
                        <p className="text-[11px] text-[#9ca3af]">No cheaper alternatives found</p>
                      ) : (
                        <div className="mt-1 space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7b70]">Cheaper options</p>
                          {substitutions[item.id]!.map((s) => (
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-[#e5ece2] bg-[#f7faf6] px-3 py-2" key={s.priceId}>
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold text-[#1f2b22]">{s.name}</p>
                                <p className="text-[10px] text-[#7b8b80]">{s.storeName} · {formatCurrency(s.price)}</p>
                                {s.savingsPercentage !== null && (
                                  <p className="text-[10px] font-semibold text-[#2f9f4f]">Save {s.savingsPercentage.toFixed(0)}%</p>
                                )}
                              </div>
                              <button
                                className="shrink-0 rounded-lg bg-[#2f9f4f] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#25813f]"
                                onClick={() => swapCartItem(item.id, s, item.quantity)}
                                type="button"
                              >
                                Swap
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[#e5ece2] px-5 py-5">
            <dl className="space-y-2 text-sm text-[#647267]">
              <div className="flex items-center justify-between">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-[#1f2b22]">{formatCurrency(cartSubtotal)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Estimated delivery</dt>
                <dd className="font-semibold text-[#1f2b22]">{formatCurrency(estimatedDelivery)}</dd>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#e5ece2] pt-4 text-base font-bold text-[#1f2b22]">
                <dt>Total</dt>
                <dd>{formatCurrency(cartTotal)}</dd>
              </div>
            </dl>

            <button
              className="mt-5 w-full rounded-2xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6]"
              disabled={cartItems.length === 0}
              onClick={handleProceedToCheckout}
              type="button"
            >
              Proceed to Checkout
            </button>
          </div>
        </aside>
      </div>
    </main>
  )
}
