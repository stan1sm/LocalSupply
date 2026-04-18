'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
type DaySchedule = { open: boolean; start: string; end: string }
type WeeklyHours = Record<DayKey, DaySchedule>

const JS_DAY_TO_KEY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function isOpenNow(openingHours: string | null | undefined): boolean | null {
  if (!openingHours) return null
  try {
    const parsed = JSON.parse(openingHours) as Partial<WeeklyHours>
    if (typeof parsed !== 'object' || !parsed || !('mon' in parsed)) return null
    const now = new Date()
    const dayKey = JS_DAY_TO_KEY[now.getDay()]
    const schedule = parsed[dayKey]
    if (!schedule) return null
    if (!schedule.open) return false
    const [startH, startM] = schedule.start.split(':').map(Number)
    const [endH, endM] = schedule.end.split(':').map(Number)
    const current = now.getHours() * 60 + now.getMinutes()
    return current >= startH * 60 + startM && current < endH * 60 + endM
  } catch {
    return null
  }
}

type SupplierSummary = {
  id: string
  businessName: string
  contactName: string
  address: string
  email: string
  isVerified: boolean
  tagline?: string | null
  storeType?: string | null
  badgeText?: string | null
  brandColor?: string | null
  openingHours?: string | null
  productCount: number
}

function normalize(text: string) {
  return text.normalize('NFKC').toLowerCase()
}

export default function SupplierMarketplacePage() {
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadSuppliers() {
      setIsLoading(true)
      setErrorMessage('')
      try {
        const response = await fetch(buildApiUrl('/api/suppliers'))
        const payload = (await response.json().catch(() => ({}))) as SupplierSummary[] | { message?: string }

        if (!response.ok) {
          throw new Error((payload as { message?: string }).message ?? 'Unable to load suppliers right now.')
        }

        if (!cancelled && Array.isArray(payload)) {
          setSuppliers(payload)
        }
      } catch (error) {
        if (!cancelled) {
          setSuppliers([])
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load suppliers right now.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadSuppliers()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredSuppliers = useMemo(() => {
    const query = normalize(search.trim())
    if (!query) return suppliers
    return suppliers.filter((supplier) => {
      const haystack = `${supplier.businessName} ${supplier.address}`.trim()
      return normalize(haystack).includes(query)
    })
  }, [search, suppliers])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
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
          <nav aria-label="Supplier navigation" className="space-y-1">
            {[
              { id: 'marketplace', label: 'Marketplace', icon: 'M', href: '/marketplace/dashboard' },
              { id: 'suppliers', label: 'Suppliers', icon: 'S', href: '/suppliers' },
              { id: 'my-cart', label: 'My Cart', icon: 'C', href: '/cart' },
              { id: 'orders', label: 'Orders', icon: 'O', href: '#' },
              { id: 'delivery', label: 'Delivery Tracking', icon: 'T', href: '#' },
            ].map((item) => {
              const isActive = item.id === 'suppliers'
              return (
                <a
                  key={item.id}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                    isActive ? 'bg-[#f0f4ef] text-[#1f2b22]' : 'text-[#4f5d52] hover:bg-[#f6faf5] hover:text-[#1f2b22]'
                  }`}
                  href={item.href}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#d6dfd2] bg-white text-xs font-bold text-[#5a675d]">
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              )
            })}
          </nav>
        </aside>

        <section className="overflow-hidden rounded-[28px] border border-[#dce5d7] bg-white/92 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <header className="border-b border-[#e5ece2] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Suppliers</p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1c2b21]">Supplier Marketplace</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#617166] sm:text-base">
                  Discover and connect with local suppliers. See who delivers to you and what kind of products they offer.
                </p>
              </div>
              <div className="rounded-2xl border border-[#d9e3d4] bg-[#f6faf5] px-4 py-3 text-sm text-[#36513e]">
                <p className="font-semibold">
                  {suppliers.length > 0 ? `${suppliers.length} suppliers in marketplace` : 'Supplier marketplace ready'}
                </p>
                <p className="mt-1 text-xs text-[#6a796f]">Browse before you commit to anything.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_160px]">
              <label className="rounded-2xl border border-[#dde5d9] bg-[#f7faf6] px-4 py-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Search suppliers</span>
                <input
                  className="mt-2 w-full bg-transparent text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a]"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or area..."
                  type="search"
                  value={search}
                />
              </label>
              <label className="rounded-2xl border border-[#dde5d9] bg-[#f7faf6] px-4 py-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Category</span>
                <select className="mt-2 w-full bg-transparent text-sm text-[#1f2937] outline-none" defaultValue="all">
                  <option value="all">All categories</option>
                </select>
              </label>
              <label className="rounded-2xl border border-[#dde5d9] bg-[#f7faf6] px-4 py-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">Sort</span>
                <select className="mt-2 w-full bg-transparent text-sm text-[#1f2937] outline-none" defaultValue="recent">
                  <option value="recent">Newest</option>
                  <option value="name">Name A-Z</option>
                </select>
              </label>
            </div>
          </header>

          <div className="px-5 py-5 sm:px-6">
            {errorMessage ? (
              <div className="rounded-3xl border border-[#f0d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#9b2c2c]">{errorMessage}</div>
            ) : null}

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="animate-pulse rounded-3xl border border-[#e6ede3] bg-[#f8faf7] p-4" key={index}>
                    <div className="h-5 w-1/2 rounded bg-[#e2e9df]" />
                    <div className="mt-2 h-4 w-2/3 rounded bg-[#e2e9df]" />
                    <div className="mt-4 h-3 w-3/4 rounded bg-[#e2e9df]" />
                    <div className="mt-6 h-9 rounded-xl bg-[#e2e9df]" />
                  </div>
                ))}
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#cfd9cb] bg-[#f8fbf7] px-6 py-16 text-center">
                <h3 className="text-lg font-semibold text-[#213026]">No suppliers yet</h3>
                <p className="mt-2 text-sm text-[#6c7c71]">
                  As suppliers onboard to LocalSupply, they&apos;ll show up here. For now you can still browse the regular marketplace.
                </p>
                <a
                  className="mt-4 inline-block rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
                  href="/marketplace/dashboard"
                >
                  Go to Marketplace
                </a>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredSuppliers.map((supplier) => (
                  <article
                    className="flex h-full flex-col justify-between rounded-3xl border border-[#e5ece2] bg-white p-4 shadow-[0_12px_24px_rgba(18,38,24,0.06)]"
                    key={supplier.id}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a8a7f]">
                              {supplier.isVerified ? 'Verified supplier' : supplier.storeType || 'Supplier'}
                            </p>
                            {(() => {
                              const status = isOpenNow(supplier.openingHours)
                              if (status === null) return null
                              return (
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                  status ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'
                                }`}>
                                  {status ? 'Open' : 'Closed'}
                                </span>
                              )
                            })()}
                          </div>
                          <h3 className="mt-1 text-base font-semibold text-[#1f2b22]">{supplier.businessName}</h3>
                          {supplier.tagline ? (
                            <p className="mt-1 text-xs text-[#5f6c62]">{supplier.tagline}</p>
                          ) : null}
                        </div>
                        {supplier.badgeText ? (
                          <span
                            className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                            style={{
                              backgroundColor: supplier.brandColor || '#eef7ef',
                              color: supplier.brandColor ? '#0b1810' : '#2f9f4f',
                            }}
                          >
                            {supplier.badgeText}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-[#6d7b70]">{supplier.address}</p>
                      <p className="text-xs text-[#859286]">
                        {supplier.productCount > 0 ? `${supplier.productCount} products` : 'No products uploaded yet'}
                      </p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <a
                        className="flex-1 rounded-2xl border border-[#d5ded1] bg-white px-3 py-2 text-xs font-semibold text-[#415044] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
                        href={`/suppliers/${encodeURIComponent(supplier.id)}`}
                      >
                        View Products
                      </a>
                      <a
                        className="flex-1 rounded-2xl bg-[#2f9f4f] px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#25813f]"
                        href={`/chat?supplierId=${encodeURIComponent(supplier.id)}`}
                      >
                        Connect
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

