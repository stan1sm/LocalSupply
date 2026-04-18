'use client'

import { useEffect, useMemo, useState } from 'react'
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

type Tab = 'profile' | 'branding' | 'hours' | 'ordering'

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'profile', label: 'Store profile', description: 'Name, tagline, description, type, and contact links.' },
  { id: 'branding', label: 'Branding', description: 'Logo, banner image, and brand color.' },
  { id: 'hours', label: 'Hours & area', description: 'Opening hours and delivery service area.' },
  { id: 'ordering', label: 'Ordering', description: 'Marketplace visibility and order settings.' },
]

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      aria-checked={checked}
      className="flex w-full items-start gap-3 text-left"
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors ${
          checked ? 'border-[#2f9f4f] bg-[#2f9f4f]' : 'border-[#c7d2c2] bg-[#e5ece2]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="text-xs text-[#374740]">{label}</span>
    </button>
  )
}

function CharCount({ value, max }: { value: string | null | undefined; max: number }) {
  const len = (value ?? '').length
  const near = len > max * 0.85
  return (
    <span className={`text-[10px] ${near ? (len >= max ? 'text-[#c53030]' : 'text-amber-600') : 'text-[#9ca3af]'}`}>
      {len}/{max}
    </span>
  )
}

const inputClass =
  'mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]'
const labelClass = 'block text-xs font-semibold text-[#6b7b70]'
const hintClass = 'mt-0.5 text-[10px] text-[#9ca3af]'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7b70]">{children}</h3>
      <div className="h-px flex-1 bg-[#eef2ec]" />
    </div>
  )
}

export default function SupplierSettingsPage() {
  const [session, setSession] = useState<SupplierSession | null>(null)
  const [profile, setProfile] = useState<SupplierProfile | null>(null)
  const [savedProfile, setSavedProfile] = useState<SupplierProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  const isDirty = useMemo(() => {
    if (!profile || !savedProfile) return false
    return JSON.stringify(profile) !== JSON.stringify(savedProfile)
  }, [profile, savedProfile])

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
        if (!response.ok) throw new Error((payload as { message?: string }).message ?? 'Unable to load supplier profile.')
        if (!cancelled) {
          setProfile(payload as SupplierProfile)
          setSavedProfile(payload as SupplierProfile)
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Unable to load supplier profile.')
      }
    }
    loadProfile()
    return () => { cancelled = true }
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
      if (!response.ok) throw new Error((payload as { message?: string }).message ?? 'Unable to update profile.')
      setProfile(payload as SupplierProfile)
      setSavedProfile(payload as SupplierProfile)
      setSuccessMessage('Changes saved successfully.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update profile.')
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
            To manage your store profile, create a supplier account or sign in from this device.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <a className="rounded-2xl bg-[#2f9f4f] px-4 py-2.5 font-semibold text-white transition hover:bg-[#25813f]" href="/supplier/register">
              Create Supplier Account
            </a>
            <a className="rounded-2xl border border-[#d4ddcf] bg-white px-4 py-2.5 font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]" href="/supplier/login">
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

        {/* Sidebar */}
        <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="px-2 pb-4">
            <a className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]" href="/">
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

        {/* Main content */}
        <section className="space-y-4">
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">

            {/* Header */}
            <div className="border-b border-[#e5ece2] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Store settings</p>
                  <h1 className="mt-1.5 text-2xl font-bold text-[#1f2b22]">Manage your store profile</h1>
                  <p className="mt-1 text-sm text-[#617166]">
                    Control how your business appears to buyers in the LocalSupply marketplace.
                  </p>
                </div>
                {isDirty && (
                  <div className="shrink-0 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-1.5 text-xs font-semibold text-amber-700">
                    Unsaved changes
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="mt-5 flex flex-wrap gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      activeTab === tab.id
                        ? 'bg-[#2f9f4f] text-white shadow-sm'
                        : 'text-[#5b665f] hover:bg-[#f0f4ef] hover:text-[#1f2b22]'
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Global messages */}
            {(errorMessage || successMessage) && (
              <div className="px-6 pt-4">
                {errorMessage && (
                  <div className="rounded-xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-2.5 text-sm text-[#9b2c2c]">
                    {errorMessage}
                  </div>
                )}
                {successMessage && (
                  <div className="rounded-xl border border-[#cfe9d5] bg-[#f0faf4] px-4 py-2.5 text-sm text-[#246b3a]">
                    ✓ {successMessage}
                  </div>
                )}
              </div>
            )}

            {/* Tab description */}
            <div className="px-6 pt-4">
              <p className="text-xs text-[#8b9e92]">
                {TABS.find((t) => t.id === activeTab)?.description}
              </p>
            </div>

            <form className="px-6 py-5" onSubmit={handleSubmit}>

              {/* Tab: Store profile */}
              {activeTab === 'profile' && (
                <div className="space-y-5">
                  <SectionTitle>Public listing</SectionTitle>
                  <label className={labelClass}>
                    <span className="flex items-center justify-between">
                      Tagline <CharCount value={profile?.tagline} max={160} />
                    </span>
                    <input
                      className={inputClass}
                      maxLength={160}
                      onChange={(event) => updateField('tagline', event.target.value)}
                      placeholder="Fresh organic vegetables from Oslo — delivered twice weekly."
                      type="text"
                      value={profile?.tagline ?? ''}
                    />
                    <p className={hintClass}>A short sentence shown on your marketplace card. Make it memorable.</p>
                  </label>

                  <label className={labelClass}>
                    <span className="flex items-center justify-between">
                      About your business <CharCount value={profile?.description} max={4000} />
                    </span>
                    <textarea
                      className={inputClass}
                      maxLength={4000}
                      onChange={(event) => updateField('description', event.target.value)}
                      placeholder="Tell buyers what makes your products special, how you operate, and anything important to know before ordering."
                      rows={5}
                      value={profile?.description ?? ''}
                    />
                    <p className={hintClass}>Shown on your full profile page. Mention certifications, sourcing, and delivery practices.</p>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelClass}>
                      Store type
                      <input
                        className={inputClass}
                        maxLength={80}
                        onChange={(event) => updateField('storeType', event.target.value)}
                        placeholder="Farm, bakery, wholesaler, fishery…"
                        type="text"
                        value={profile?.storeType ?? ''}
                      />
                      <p className={hintClass}>Helps buyers filter and find you.</p>
                    </label>
                    <label className={labelClass}>
                      Badge text
                      <input
                        className={inputClass}
                        maxLength={40}
                        onChange={(event) => updateField('badgeText', event.target.value)}
                        placeholder="Local farm · Certified organic"
                        type="text"
                        value={profile?.badgeText ?? ''}
                      />
                      <p className={hintClass}>Short label shown on your marketplace card, e.g. "Local farm".</p>
                    </label>
                  </div>

                  <SectionTitle>Contact &amp; links</SectionTitle>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelClass}>
                      Website
                      <input
                        className={inputClass}
                        maxLength={2048}
                        onChange={(event) => updateField('websiteUrl', event.target.value)}
                        placeholder="https://yourbusiness.no"
                        type="url"
                        value={profile?.websiteUrl ?? ''}
                      />
                    </label>
                    <label className={labelClass}>
                      Instagram
                      <input
                        className={inputClass}
                        maxLength={2048}
                        onChange={(event) => updateField('instagramUrl', event.target.value)}
                        placeholder="https://instagram.com/your-handle"
                        type="url"
                        value={profile?.instagramUrl ?? ''}
                      />
                    </label>
                    <label className={labelClass}>
                      Facebook
                      <input
                        className={inputClass}
                        maxLength={2048}
                        onChange={(event) => updateField('facebookUrl', event.target.value)}
                        placeholder="https://facebook.com/your-page"
                        type="url"
                        value={profile?.facebookUrl ?? ''}
                      />
                    </label>
                    <label className={labelClass}>
                      Preferred contact method
                      <input
                        className={inputClass}
                        maxLength={80}
                        onChange={(event) => updateField('preferredContactMethod', event.target.value)}
                        placeholder="Email, phone, WhatsApp…"
                        type="text"
                        value={profile?.preferredContactMethod ?? ''}
                      />
                      <p className={hintClass}>How buyers can best reach you for questions.</p>
                    </label>
                  </div>
                </div>
              )}

              {/* Tab: Branding */}
              {activeTab === 'branding' && (
                <div className="space-y-5">
                  <SectionTitle>Images</SectionTitle>
                  <label className={labelClass}>
                    Logo URL
                    <input
                      className={inputClass}
                      maxLength={2048}
                      onChange={(event) => updateField('logoUrl', event.target.value)}
                      placeholder="https://…/logo.png"
                      type="url"
                      value={profile?.logoUrl ?? ''}
                    />
                    <p className={hintClass}>Square image works best. Used in your store listing and emails.</p>
                    {profile?.logoUrl && (
                      <img alt="Logo preview" className="mt-2 h-14 w-14 rounded-xl border border-[#e2e9df] object-contain bg-white p-1" src={profile.logoUrl} />
                    )}
                  </label>
                  <label className={labelClass}>
                    Banner image URL
                    <input
                      className={inputClass}
                      maxLength={2048}
                      onChange={(event) => updateField('heroImageUrl', event.target.value)}
                      placeholder="https://…/banner.jpg"
                      type="url"
                      value={profile?.heroImageUrl ?? ''}
                    />
                    <p className={hintClass}>Large landscape image shown at the top of your store profile page. Recommended: 1200×400px.</p>
                    {profile?.heroImageUrl && (
                      <img alt="Banner preview" className="mt-2 h-24 w-full rounded-xl border border-[#e2e9df] object-cover" src={profile.heroImageUrl} />
                    )}
                  </label>

                  <SectionTitle>Brand color</SectionTitle>
                  <label className={labelClass}>
                    Brand color (HEX)
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        className="h-9 w-12 cursor-pointer rounded-lg border border-[#d4ddcf] p-0.5"
                        onChange={(event) => updateField('brandColor', event.target.value)}
                        type="color"
                        value={profile?.brandColor && /^#[0-9a-fA-F]{6}$/.test(profile.brandColor) ? profile.brandColor : '#2f9f4f'}
                      />
                      <input
                        className="flex-1 rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={32}
                        onChange={(event) => updateField('brandColor', event.target.value)}
                        placeholder="#2f9f4f"
                        type="text"
                        value={profile?.brandColor ?? ''}
                      />
                    </div>
                    <p className={hintClass}>Used to accent your store profile page. Enter a 6-digit HEX value.</p>
                  </label>
                </div>
              )}

              {/* Tab: Hours & area */}
              {activeTab === 'hours' && (
                <div className="space-y-5">
                  <SectionTitle>Opening hours</SectionTitle>
                  <label className={labelClass}>
                    <span className="flex items-center justify-between">
                      Opening hours <CharCount value={profile?.openingHours} max={2000} />
                    </span>
                    <textarea
                      className={inputClass}
                      maxLength={2000}
                      onChange={(event) => updateField('openingHours', event.target.value)}
                      placeholder={'Mon–Fri: 08:00–16:00\nSat: 10:00–14:00\nSun: Closed'}
                      rows={4}
                      value={profile?.openingHours ?? ''}
                    />
                    <p className={hintClass}>Free-form text — write it as you&apos;d want it displayed to buyers.</p>
                  </label>
                  <label className={labelClass}>
                    <span className="flex items-center justify-between">
                      Additional notes <CharCount value={profile?.openingHoursNote} max={400} />
                    </span>
                    <input
                      className={inputClass}
                      maxLength={400}
                      onChange={(event) => updateField('openingHoursNote', event.target.value)}
                      placeholder="Closed on public holidays. Pickup by appointment only in July."
                      type="text"
                      value={profile?.openingHoursNote ?? ''}
                    />
                    <p className={hintClass}>Any exceptions, seasonal closures, or special arrangements.</p>
                  </label>

                  <SectionTitle>Service area</SectionTitle>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelClass}>
                      Service radius (km)
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        min={0}
                        onChange={(event) =>
                          updateField('serviceRadiusKm', event.target.value ? Number.parseInt(event.target.value, 10) || 0 : null)
                        }
                        placeholder="e.g. 20"
                        type="number"
                        value={profile?.serviceRadiusKm ?? ''}
                      />
                      <p className={hintClass}>How far you can deliver from your location.</p>
                    </label>
                    <label className={labelClass}>
                      Service areas
                      <input
                        className={inputClass}
                        maxLength={400}
                        onChange={(event) => updateField('serviceAreas', event.target.value)}
                        placeholder="0550 Oslo; Grünerløkka; Bærum…"
                        type="text"
                        value={profile?.serviceAreas ?? ''}
                      />
                      <p className={hintClass}>Postal codes or neighbourhood names, separated by semicolons.</p>
                    </label>
                  </div>
                </div>
              )}

              {/* Tab: Ordering */}
              {activeTab === 'ordering' && (
                <div className="space-y-5">
                  <SectionTitle>Marketplace visibility</SectionTitle>
                  <div className="space-y-3 rounded-xl border border-[#e5ece2] bg-[#f9fbf8] p-4">
                    <Toggle
                      checked={profile?.showInMarketplace ?? true}
                      onChange={(v) => updateField('showInMarketplace', v)}
                      label="Show this store in the public supplier marketplace. Buyers can discover and browse your products."
                    />
                    <Toggle
                      checked={profile?.acceptDirectOrders ?? true}
                      onChange={(v) => updateField('acceptDirectOrders', v)}
                      label="Allow buyers to place direct orders through LocalSupply. Turn off to operate as a contact-only listing."
                    />
                  </div>

                  <SectionTitle>Order settings</SectionTitle>
                  <label className={labelClass}>
                    Minimum order amount (NOK)
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      min={0}
                      onChange={(event) =>
                        updateField(
                          'minimumOrderAmount',
                          event.target.value ? Number.parseFloat(event.target.value.replace(',', '.')) : null,
                        )
                      }
                      placeholder="e.g. 500 — leave blank for no minimum"
                      type="number"
                      value={profile?.minimumOrderAmount ?? ''}
                    />
                    <p className={hintClass}>Buyers will see a warning if their order total is below this amount.</p>
                  </label>

                  <label className={labelClass}>
                    <span className="flex items-center justify-between">
                      Order notes hint <CharCount value={profile?.orderNotesHint} max={400} />
                    </span>
                    <textarea
                      className={inputClass}
                      maxLength={400}
                      onChange={(event) => updateField('orderNotesHint', event.target.value)}
                      placeholder="e.g. Please specify your preferred delivery window. All orders must be placed by Tuesday 14:00 for Thursday delivery."
                      rows={3}
                      value={profile?.orderNotesHint ?? ''}
                    />
                    <p className={hintClass}>Shown to buyers in the order notes field — use it to set expectations about delivery, packaging, or lead times.</p>
                  </label>
                </div>
              )}

              {/* Save bar */}
              <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-[#e5ece2] bg-[#f7faf6] px-4 py-3">
                <p className="text-xs text-[#7b8b80]">
                  {isDirty ? 'You have unsaved changes on this page.' : 'All changes saved.'}
                </p>
                <button
                  className="flex items-center gap-2 rounded-xl bg-[#2f9f4f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6]"
                  disabled={isSaving || !isDirty}
                  type="submit"
                >
                  {isSaving ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Saving…
                    </>
                  ) : (
                    'Save changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
