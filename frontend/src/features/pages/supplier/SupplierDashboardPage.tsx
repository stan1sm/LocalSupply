'use client'

import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'
import { ToastContainer } from '../../components/Toast'
import { useToast } from '../../components/useToast'
import SupplierSidebar from '../../components/SupplierSidebar'

type Supplier = {
  id: string
  businessName: string
  contactName: string
  email: string
  address: string
}

type Product = {
  id: string
  name: string
  description: string | null
  unit: string
  price: number
  stockQty: number
  imageUrl?: string | null
  isActive?: boolean
}

const SUPPLIER_STORAGE_KEY = 'localsupply-supplier'
const SUPPLIER_TOKEN_KEY = 'localsupply-supplier-token'
const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/gif'
const MAX_IMAGE_MB = 5

type ProductForm = {
  name: string
  description: string
  unit: string
  price: string
  stockQty: string
}

const initialProductForm: ProductForm = {
  name: '',
  description: '',
  unit: '',
  price: '',
  stockQty: '',
}

const UNIT_SUGGESTIONS = [
  'per kg', 'per stk', 'per liter', 'per 500g', 'per kasse', 'per boks',
  'per pakke', 'per brett', 'per pose', 'per flaske', 'per bundle',
]

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length
  const near = len > max * 0.85
  return (
    <span className={`text-[10px] ${near ? (len >= max ? 'text-[#c53030]' : 'text-amber-500') : 'text-[#9ca3af]'}`}>
      {len}/{max}
    </span>
  )
}

function ProductPreviewCard({
  name, description, unit, price, imagePreview,
}: {
  name: string; description: string; unit: string; price: string; imagePreview: string | null
}) {
  const parsedPrice = Number.parseFloat(price.replace(',', '.'))
  const hasPrice = Number.isFinite(parsedPrice) && parsedPrice > 0

  return (
    <div className="rounded-2xl border border-[#e5ece2] bg-white p-4 shadow-[0_12px_24px_rgba(18,38,24,0.06)]">
      <div className="flex gap-3">
        {imagePreview ? (
          <img alt="" className="h-16 w-16 shrink-0 rounded-xl border border-[#e2e9df] object-cover" src={imagePreview} />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#e2e9df] bg-[#f7faf6] text-[#c3cfc3]">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${name ? 'text-[#1f2b22]' : 'text-[#c3cfc3]'}`}>
            {name || 'Product name'}
          </p>
          <p className={`mt-0.5 text-xs ${description ? 'text-[#6d7b70]' : 'text-[#c3cfc3]'}`}>
            {description || 'Description'}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div>
              <p className={`text-sm font-bold ${hasPrice ? 'text-[#2f9f4f]' : 'text-[#c3cfc3]'}`}>
                {hasPrice ? `${parsedPrice.toFixed(2)} kr` : '—.— kr'}
              </p>
              <p className={`text-[10px] ${unit ? 'text-[#9db5a4]' : 'text-[#c3cfc3]'}`}>
                {unit || 'per unit'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="grid h-7 w-7 place-items-center rounded-lg border border-[#d4ddd0] text-sm text-[#516056]" type="button" disabled>−</button>
              <span className="min-w-[1.5rem] text-center text-sm font-semibold text-[#1f2b22]">0</span>
              <button className="grid h-7 w-7 place-items-center rounded-lg border border-[#d4ddd0] text-sm text-[#516056]" type="button" disabled>+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SupplierDashboardPage() {
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [form, setForm] = useState<ProductForm>(initialProductForm)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ProductForm, string>>>({})
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const { toasts, addToast } = useToast()

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SUPPLIER_STORAGE_KEY) : null
      if (stored) {
        const parsed = JSON.parse(stored) as Supplier
        if (parsed && parsed.id) {
          setSupplier(parsed)
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
    if (!supplier) return
    const supplierId = supplier.id
    let cancelled = false
    async function loadProducts() {
      setErrorMessage('')
      try {
        const response = await fetch(buildApiUrl(`/api/suppliers/${encodeURIComponent(supplierId)}/products`))
        const payload = (await response.json().catch(() => ({}))) as Product[] | { message?: string }
        if (!response.ok) throw new Error((payload as { message?: string }).message ?? 'Unable to load products right now.')
        if (!cancelled && Array.isArray(payload)) setProducts(payload)
      } catch (error) {
        if (!cancelled) {
          setProducts([])
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load products right now.')
        }
      }
    }
    loadProducts()
    return () => { cancelled = true }
  }, [supplier])

  function handleFormChange<K extends keyof ProductForm>(field: K, value: ProductForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFormErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      setImageFile(null)
      setImagePreview(null)
      return
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setErrorMessage(`Image must be under ${MAX_IMAGE_MB} MB.`)
      setImageFile(null)
      setImagePreview(null)
      event.target.value = ''
      return
    }
    if (!ACCEPT_IMAGES.split(',').some((t) => file.type === t.trim())) {
      setErrorMessage('Use JPEG, PNG, WebP or GIF only.')
      setImageFile(null)
      setImagePreview(null)
      event.target.value = ''
      return
    }
    setErrorMessage('')
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  async function handleCreateProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supplier) return

    const nextErrors: Partial<Record<keyof ProductForm, string>> = {}
    const name = form.name.trim()
    const unit = form.unit.trim()
    const price = Number(form.price.replace(',', '.'))
    const stockQty = Number(form.stockQty)

    if (name.length < 2) nextErrors.name = 'Product name must be at least 2 characters.'
    if (!unit) nextErrors.unit = 'Unit is required — e.g. "per kg" or "per stk".'
    if (!Number.isFinite(price) || price <= 0) nextErrors.price = 'Enter a valid price greater than 0.'
    if (!Number.isInteger(stockQty) || stockQty < 0) nextErrors.stockQty = 'Stock must be 0 or a positive whole number.'

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors)
      return
    }

    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('description', form.description.trim())
      formData.append('unit', unit)
      formData.append('price', String(price))
      formData.append('stockQty', String(stockQty))
      if (imageFile) formData.append('image', imageFile)

      const token = typeof window !== 'undefined' ? window.localStorage.getItem(SUPPLIER_TOKEN_KEY) : null
      const response = await fetch(buildApiUrl(`/api/suppliers/${encodeURIComponent(supplier.id)}/products`), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      const payload = (await response.json().catch(() => ({}))) as Product | { message?: string; errors?: Record<string, string> }
      if (!response.ok) {
        const message = (payload as { message?: string }).message ?? 'Unable to create product right now.'
        setErrorMessage(message)
        addToast(message, 'error')
        return
      }
      setProducts((prev) => [payload as Product, ...prev])
      setForm(initialProductForm)
      setFormErrors({})
      clearImage()
      setShowPreview(false)
      addToast(`"${name}" added to your products`, 'success')
    } catch {
      const message = 'Unable to create product right now.'
      setErrorMessage(message)
      addToast(message, 'error')
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

  if (!supplier) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f6f1] px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe5da] bg-white p-6 text-center shadow-[0_20px_50px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier Portal</p>
          <h1 className="mt-3 text-xl font-bold text-[#1b2a1f]">No supplier session</h1>
          <p className="mt-2 text-sm text-[#5b665f]">
            To use the supplier dashboard, create a supplier account or sign in — we&apos;ll remember your business on this device.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <a className="rounded-2xl bg-[#2f9f4f] px-4 py-2.5 font-semibold text-white transition hover:bg-[#25813f]" href="/supplier/register">
              Create Supplier Account
            </a>
            <a className="rounded-2xl border border-[#d4ddcf] bg-white px-4 py-2.5 font-semibold text-[#314237] transition hover:border-[#9db5a4] hover:text-[#2f9f4f]" href="/login">
              Sign in
            </a>
          </div>
        </div>
      </main>
    )
  }

  const inputClass =
    'mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]'
  const labelClass = 'block text-xs font-semibold text-[#6b7b70]'
  const errorClass = 'mt-1 text-xs text-[#9b2c2c]'
  const hintClass = 'mt-0.5 text-[10px] text-[#9ca3af]'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <ToastContainer toasts={toasts} />
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[260px_minmax(0,1.2fr)]">

        <SupplierSidebar activeId="products" supplier={supplier} />

        <section className="space-y-6">

          {/* Add product form */}
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="border-b border-[#e5ece2] px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Products</p>
                  <h1 className="mt-1.5 text-2xl font-bold text-[#1f2b22]">Add a new product</h1>
                  <p className="mt-1 text-sm text-[#617166]">
                    Create the products you want to offer through LocalSupply. These are separate from the Kassal grocery catalog.
                  </p>
                </div>
                <button
                  className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    showPreview
                      ? 'border-[#2f9f4f] bg-[#f0faf4] text-[#1a5c2e]'
                      : 'border-[#d4ddcf] bg-white text-[#5b665f] hover:border-[#9db5a4]'
                  }`}
                  onClick={() => setShowPreview((v) => !v)}
                  type="button"
                >
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              {errorMessage ? (
                <div className="mb-4 rounded-xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
                  {errorMessage}
                </div>
              ) : null}

              <form
                className={`grid gap-6 ${showPreview ? 'lg:grid-cols-[minmax(0,1.2fr)_280px]' : ''}`}
                onSubmit={handleCreateProduct}
              >
                <div className="space-y-5">

                  {/* Product identity */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8b9e92]">Product details</h2>
                      <div className="h-px flex-1 bg-[#eef2ec]" />
                    </div>
                    <label className={labelClass}>
                      <span className="flex items-center justify-between">
                        Product name <span className="font-normal text-[#c53030] text-[10px]">required</span>
                      </span>
                      <input
                        className={inputClass}
                        maxLength={120}
                        onChange={(event) => handleFormChange('name', event.target.value)}
                        placeholder="Organic carrots — 1 kg bag"
                        type="text"
                        value={form.name}
                      />
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className={hintClass}>Clear, descriptive name buyers will search for.</p>
                        <CharCount value={form.name} max={120} />
                      </div>
                      {formErrors.name ? <p className={errorClass}>{formErrors.name}</p> : null}
                    </label>

                    <label className={labelClass}>
                      Description
                      <textarea
                        className={inputClass}
                        maxLength={240}
                        onChange={(event) => handleFormChange('description', event.target.value)}
                        placeholder="Freshly harvested, unwashed carrots from our farm in Østfold. Perfect for soups, salads, and juicing."
                        rows={3}
                        value={form.description}
                      />
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className={hintClass}>Optional. Highlight origin, quality, or ideal uses.</p>
                        <CharCount value={form.description} max={240} />
                      </div>
                    </label>
                  </div>

                  {/* Pricing & stock */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8b9e92]">Pricing &amp; stock</h2>
                      <div className="h-px flex-1 bg-[#eef2ec]" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className={labelClass}>
                        <span className="flex items-center justify-between">
                          Unit <span className="font-normal text-[#c53030] text-[10px]">required</span>
                        </span>
                        <input
                          className={inputClass}
                          list="unit-suggestions"
                          maxLength={40}
                          onChange={(event) => handleFormChange('unit', event.target.value)}
                          placeholder="per kg"
                          type="text"
                          value={form.unit}
                        />
                        <datalist id="unit-suggestions">
                          {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
                        </datalist>
                        <p className={hintClass}>How you sell it — e.g. "per kg", "per stk".</p>
                        {formErrors.unit ? <p className={errorClass}>{formErrors.unit}</p> : null}
                      </label>

                      <label className={labelClass}>
                        <span className="flex items-center justify-between">
                          Price (NOK) <span className="font-normal text-[#c53030] text-[10px]">required</span>
                        </span>
                        <div className="relative mt-1">
                          <input
                            className="w-full rounded-xl border border-[#d4ddcf] bg-white py-2 pl-3 pr-10 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                            inputMode="decimal"
                            onChange={(event) => handleFormChange('price', event.target.value)}
                            placeholder="39.90"
                            type="text"
                            value={form.price}
                          />
                          <span className="pointer-events-none absolute right-3 top-2 text-xs text-[#9ca3af]">kr</span>
                        </div>
                        <p className={hintClass}>Use comma or dot for decimals.</p>
                        {formErrors.price ? <p className={errorClass}>{formErrors.price}</p> : null}
                      </label>

                      <label className={labelClass}>
                        <span className="flex items-center justify-between">
                          Stock quantity <span className="font-normal text-[#c53030] text-[10px]">required</span>
                        </span>
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          min={0}
                          onChange={(event) => handleFormChange('stockQty', event.target.value)}
                          placeholder="0"
                          type="number"
                          value={form.stockQty}
                        />
                        <p className={hintClass}>Set to 0 if temporarily out of stock.</p>
                        {formErrors.stockQty ? <p className={errorClass}>{formErrors.stockQty}</p> : null}
                      </label>
                    </div>
                  </div>

                  {/* Image */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8b9e92]">Product image</h2>
                      <div className="h-px flex-1 bg-[#eef2ec]" />
                      <span className="text-[10px] text-[#9ca3af]">optional</span>
                    </div>
                    <div className="flex items-start gap-4">
                      {imagePreview ? (
                        <div className="relative shrink-0">
                          <img alt="Preview" className="h-20 w-20 rounded-xl border border-[#d4ddcf] object-cover" src={imagePreview} />
                          <button
                            aria-label="Remove image"
                            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#d4ddcf] bg-white text-[#6d7b70] shadow transition hover:bg-[#fff5f5] hover:text-[#c53030]"
                            onClick={clearImage}
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-[#d4ddcf] bg-[#f7faf6] text-[#c3cfc3]">
                          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <input
                          accept={ACCEPT_IMAGES}
                          className="block w-full text-sm text-[#5b665f] file:mr-3 file:rounded-xl file:border-0 file:bg-[#2f9f4f] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:transition file:hover:bg-[#25813f]"
                          onChange={handleImageChange}
                          ref={imageInputRef}
                          type="file"
                        />
                        <p className="mt-1.5 text-[10px] text-[#9ca3af]">
                          JPEG, PNG, WebP or GIF · max {MAX_IMAGE_MB} MB · Square or landscape works best.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2f9f4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6]"
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Adding product…
                      </>
                    ) : (
                      'Add product'
                    )}
                  </button>
                </div>

                {/* Live preview panel */}
                {showPreview && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8b9e92]">Buyer preview</h2>
                      <div className="h-px flex-1 bg-[#eef2ec]" />
                    </div>
                    <p className="text-[10px] text-[#9ca3af]">How this product will look to buyers in the marketplace.</p>
                    <ProductPreviewCard
                      name={form.name}
                      description={form.description}
                      unit={form.unit}
                      price={form.price}
                      imagePreview={imagePreview}
                    />
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Product list */}
          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-[#e5ece2] px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-[#1f2b22]">Your products</h2>
                {products.length > 0 && (
                  <p className="mt-0.5 text-xs text-[#8b9e92]">{products.length} product{products.length !== 1 ? 's' : ''} listed</p>
                )}
              </div>
            </div>
            <div className="max-h-[480px] overflow-y-auto px-6 py-3">
              {products.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#e2e9df] bg-[#f7faf6] text-[#c3cfc3]">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[#6d7b70]">No products yet</p>
                  <p className="text-xs text-[#9ca3af]">Use the form above to add your first product to LocalSupply.</p>
                </div>
              ) : (
                <table className="min-w-full text-left text-sm text-[#1f2b22]">
                  <thead className="sticky top-0 bg-white text-xs text-[#6d7b70]">
                    <tr>
                      <th className="w-14 py-2 pr-2">Image</th>
                      <th className="py-2 pr-4">Name &amp; description</th>
                      <th className="py-2 pr-4">Unit</th>
                      <th className="py-2 pr-4">Price</th>
                      <th className="py-2 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const imgSrc = product.imageUrl
                        ? (product.imageUrl.startsWith('/') ? buildApiUrl(product.imageUrl) : product.imageUrl)
                        : null
                      return (
                        <tr className="border-t border-[#eef2ec]" key={product.id}>
                          <td className="py-2 pr-2">
                            {imgSrc ? (
                              <img alt="" className="h-10 w-10 rounded-lg border border-[#e2e9df] object-cover" src={imgSrc} />
                            ) : (
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e2e9df] bg-[#f7faf6] text-[#c3cfc3]">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                                </svg>
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            <p className="truncate font-medium">{product.name}</p>
                            {product.description ? (
                              <p className="truncate text-xs text-[#6d7b70]">{product.description}</p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-4 text-xs text-[#6d7b70]">{product.unit}</td>
                          <td className="py-2 pr-4 text-sm font-semibold text-[#1f2b22]">
                            {product.price.toFixed ? `${product.price.toFixed(2)} kr` : `${Number(product.price).toFixed(2)} kr`}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-sm font-semibold ${product.stockQty === 0 ? 'text-[#c53030]' : 'text-[#1f2b22]'}`}>
                              {product.stockQty}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
