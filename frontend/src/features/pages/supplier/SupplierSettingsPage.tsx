'use client'

import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

type SupplierSession = {
  id: string
  businessName: string
  contactName: string
  email: string
  address: string
}

type SupplierProfile = SupplierSession & {
  logoUrl?: string | null
  heroImageUrl?: string | null
  tagline?: string | null
  description?: string | null
  storeType?: string | null
  badgeText?: string | null
  brandColor?: string | null
  serviceRadiusKm?: number | null
  serviceAreas?: string | null
  openingHours?: string | null
  openingHoursNote?: string | null
  websiteUrl?: string | null
  instagramUrl?: string | null
  facebookUrl?: string | null
  preferredContactMethod?: string | null
  orderNotesHint?: string | null
  showInMarketplace?: boolean
  acceptDirectOrders?: boolean
  minimumOrderAmount?: number | null
}

const SUPPLIER_STORAGE_KEY = 'localsupply-supplier'
const SUPPLIER_TOKEN_KEY = 'localsupply-supplier-token'

export default function SupplierSettingsPage() {
  const [session, setSession] = useState<SupplierSession | null>(null)
  const [profile, setProfile] = useState<SupplierProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SUPPLIER_STORAGE_KEY) : null
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierSession
        if (parsed && parsed.id) {
          setSession(parsed)
        }
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(SUPPLIER_STORAGE_KEY)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const supplierId: string = session?.id ?? ''
    if (!supplierId) return

    let cancelled = false

    async function loadProfile() {
      setErrorMessage('')
      try {
        const response = await fetch(buildApiUrl(`/api/suppliers/${encodeURIComponent(supplierId)}`))
        const payload = (await response.json().catch(() => ({}))) as SupplierProfile | { message?: string }
        if (!response.ok) {
          throw new Error((payload as { message?: string }).message ?? 'Unable to load supplier profile.')
        }
        if (!cancelled) {
          setProfile(payload as SupplierProfile)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load supplier profile.')
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [session])

  function updateField<K extends keyof SupplierProfile>(field: K, value: SupplierProfile[K]) {
    setProfile((prev) => (prev ? { ...prev, [field]: value } : prev))
    setErrorMessage('')
    setSuccessMessage('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !profile || isSaving) return

    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem(SUPPLIER_TOKEN_KEY) : null
      const response = await fetch(buildApiUrl(`/api/suppliers/${encodeURIComponent(session.id)}/profile`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          logoUrl: profile.logoUrl,
          heroImageUrl: profile.heroImageUrl,
          tagline: profile.tagline,
          description: profile.description,
          storeType: profile.storeType,
          badgeText: profile.badgeText,
          brandColor: profile.brandColor,
          serviceRadiusKm: profile.serviceRadiusKm,
          serviceAreas: profile.serviceAreas,
          openingHours: profile.openingHours,
          openingHoursNote: profile.openingHoursNote,
          websiteUrl: profile.websiteUrl,
          instagramUrl: profile.instagramUrl,
          facebookUrl: profile.facebookUrl,
          preferredContactMethod: profile.preferredContactMethod,
          orderNotesHint: profile.orderNotesHint,
          showInMarketplace: profile.showInMarketplace,
          acceptDirectOrders: profile.acceptDirectOrders,
          minimumOrderAmount:
            typeof profile.minimumOrderAmount === 'number' ? profile.minimumOrderAmount : undefined,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as SupplierProfile | { message?: string }

      if (!response.ok) {
        throw new Error((payload as { message?: string }).message ?? 'Unable to update supplier profile.')
      }

      setProfile(payload as SupplierProfile)
      setSuccessMessage('Profile updated.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update supplier profile.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d5ded1] border-t-[#2f9f4f]" />
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier</p>
          <h1 className="mt-2 text-xl font-bold text-[#1b2a1f]">No supplier session</h1>
          <p className="mt-2 text-sm text-[#5b665f]">
            To manage your store profile, first create a supplier account or sign in from this device.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <a
              className="rounded-2xl bg-[#2f9f4f] px-4 py-2.5 font-semibold text-white transition hover:bg-[#25813f]"
              href="/supplier/register"
            >
              Create Supplier Account
            </a>
            <a
              className="rounded-2xl border border-[#d4ddcf] bg-white px-4 py-2.5 font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]"
              href="/supplier/login"
            >
              Supplier Sign in
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[260px_minmax(0,1.2fr)]">
        <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="px-2 pb-4">
            <a
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]"
              href="/"
            >
              <span aria-hidden="true">←</span>
              <span>LocalSupply</span>
            </a>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier</p>
            <h2 className="mt-2 text-xl font-bold text-[#1f2b22]">{session.businessName}</h2>
            <p className="mt-1 text-xs text-[#6d7b70]">{session.address}</p>
          </div>
          <nav aria-label="Supplier dashboard navigation" className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'D', href: '/supplier' },
              { id: 'products', label: 'Products', icon: 'P', href: '/supplier/dashboard' },
              { id: 'orders', label: 'Orders', icon: 'O', href: '/supplier/orders' },
              { id: 'settings', label: 'Store settings', icon: 'S', href: '/supplier/settings' },
            ].map((item) => {
              const isActive = item.id === 'settings'
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

        <section className="space-y-6">
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="border-b border-[#e5ece2] px-5 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Store settings</p>
              <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">Manage your store profile</h1>
              <p className="mt-1 text-sm text-[#617166]">
                Update how your business appears in the supplier marketplace and on your public profile.
              </p>
            </div>
            <form className="space-y-6 px-5 py-5" onSubmit={handleSubmit}>
              {errorMessage ? (
                <div className="rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-2 text-sm text-[#9b2c2c]">
                  {errorMessage}
                </div>
              ) : null}
              {successMessage ? (
                <div className="rounded-2xl border border-[#cfe9d5] bg-[#f0faf4] px-4 py-2 text-sm text-[#246b3a]">
                  {successMessage}
                </div>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">
                    Basic profile
                  </h2>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Tagline
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={160}
                      onChange={(event) => updateField('tagline', event.target.value)}
                      placeholder="Organic vegetables from Oslo"
                      type="text"
                      value={profile?.tagline ?? ''}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    About your business
                    <textarea
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={4000}
                      onChange={(event) => updateField('description', event.target.value)}
                      placeholder="Tell buyers what makes your products special, how you operate, and anything important to know before ordering."
                      rows={4}
                      value={profile?.description ?? ''}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Store type
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={80}
                        onChange={(event) => updateField('storeType', event.target.value)}
                        placeholder="Farm, bakery, wholesaler…"
                        type="text"
                        value={profile?.storeType ?? ''}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Badge text
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={40}
                        onChange={(event) => updateField('badgeText', event.target.value)}
                        placeholder="e.g. Local farm, Family bakery"
                        type="text"
                        value={profile?.badgeText ?? ''}
                      />
                    </label>
                  </div>

                  <h2 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">
                    Contact & links
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Website
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={2048}
                        onChange={(event) => updateField('websiteUrl', event.target.value)}
                        placeholder="https://example.com"
                        type="url"
                        value={profile?.websiteUrl ?? ''}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Instagram
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={2048}
                        onChange={(event) => updateField('instagramUrl', event.target.value)}
                        placeholder="https://instagram.com/your-handle"
                        type="url"
                        value={profile?.instagramUrl ?? ''}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Facebook
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={2048}
                        onChange={(event) => updateField('facebookUrl', event.target.value)}
                        placeholder="https://facebook.com/your-page"
                        type="url"
                        value={profile?.facebookUrl ?? ''}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Preferred contact method
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={80}
                        onChange={(event) => updateField('preferredContactMethod', event.target.value)}
                        placeholder="e.g. Email, phone, messaging"
                        type="text"
                        value={profile?.preferredContactMethod ?? ''}
                      />
                    </label>
                  </div>

                  <h2 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">
                    Opening hours & service area
                  </h2>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Opening hours (free text)
                    <textarea
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={2000}
                      onChange={(event) => updateField('openingHours', event.target.value)}
                      placeholder={'Mon–Fri: 08:00–16:00\nSat: 10:00–14:00\nSun: Closed'}
                      rows={3}
                      value={profile?.openingHours ?? ''}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Opening hours notes
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={400}
                      onChange={(event) => updateField('openingHoursNote', event.target.value)}
                      placeholder="Closed on public holidays, pickup by appointment only, etc."
                      type="text"
                      value={profile?.openingHoursNote ?? ''}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Service radius (km)
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        inputMode="numeric"
                        onChange={(event) =>
                          updateField(
                            'serviceRadiusKm',
                            event.target.value ? Number.parseInt(event.target.value, 10) || 0 : null,
                          )
                        }
                        placeholder="e.g. 20"
                        type="number"
                        value={profile?.serviceRadiusKm ?? ''}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Service areas (postal codes, cities)
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={400}
                        onChange={(event) => updateField('serviceAreas', event.target.value)}
                        placeholder="0550 Oslo; 0560 Oslo; nearby areas…"
                        type="text"
                        value={profile?.serviceAreas ?? ''}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">
                    Branding & visibility
                  </h2>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Logo URL
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={2048}
                      onChange={(event) => updateField('logoUrl', event.target.value)}
                      placeholder="https://…"
                      type="url"
                      value={profile?.logoUrl ?? ''}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Hero image URL
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={2048}
                      onChange={(event) => updateField('heroImageUrl', event.target.value)}
                      placeholder="Large banner image for your profile page"
                      type="url"
                      value={profile?.heroImageUrl ?? ''}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Brand color (HEX)
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={32}
                      onChange={(event) => updateField('brandColor', event.target.value)}
                      placeholder="#2f9f4f"
                      type="text"
                      value={profile?.brandColor ?? ''}
                    />
                  </label>

                  <h2 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">
                    Ordering preferences
                  </h2>
                  <label className="flex items-start gap-3 text-xs text-[#516056]">
                    <input
                      checked={profile?.showInMarketplace ?? true}
                      className="mt-1 h-4 w-4 rounded border-[#c7d2c2] text-[#2f9f4f] focus:ring-[#2f9f4f]/40"
                      onChange={(event) => updateField('showInMarketplace', event.target.checked)}
                      type="checkbox"
                    />
                    <span>Show this store in the public supplier marketplace.</span>
                  </label>
                  <label className="flex items-start gap-3 text-xs text-[#516056]">
                    <input
                      checked={profile?.acceptDirectOrders ?? true}
                      className="mt-1 h-4 w-4 rounded border-[#c7d2c2] text-[#2f9f4f] focus:ring-[#2f9f4f]/40"
                      onChange={(event) => updateField('acceptDirectOrders', event.target.checked)}
                      type="checkbox"
                    />
                    <span>Allow buyers to place direct orders with this supplier through LocalSupply.</span>
                  </label>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Minimum order amount (NOK)
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      inputMode="decimal"
                      onChange={(event) =>
                        updateField(
                          'minimumOrderAmount',
                          event.target.value ? Number.parseFloat(event.target.value.replace(',', '.')) : null,
                        )
                      }
                      placeholder="Optional minimum per order"
                      type="number"
                      value={profile?.minimumOrderAmount ?? ''}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Order notes hint
                    <textarea
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={400}
                      onChange={(event) => updateField('orderNotesHint', event.target.value)}
                      placeholder="e.g. Let buyers know about delivery windows, packaging, or anything special you want them to include."
                      rows={3}
                      value={profile?.orderNotesHint ?? ''}
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  className="rounded-2xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6]"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

