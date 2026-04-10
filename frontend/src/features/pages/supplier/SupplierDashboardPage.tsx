'use client'

import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'
import { ToastContainer } from '../../components/Toast'
import { useToast } from '../../components/useToast'

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
        if (!response.ok) {
          throw new Error((payload as { message?: string }).message ?? 'Unable to load products right now.')
        }
        if (!cancelled && Array.isArray(payload)) {
          setProducts(payload)
        }
      } catch (error) {
        if (!cancelled) {
          setProducts([])
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load products right now.')
        }
      }
    }

    loadProducts()

    return () => {
      cancelled = true
    }
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

    if (name.length < 2) nextErrors.name = 'Use at least 2 characters.'
    if (!unit) nextErrors.unit = 'Unit is required.'
    if (!Number.isFinite(price) || price <= 0) nextErrors.price = 'Enter a valid price.'
    if (!Number.isInteger(stockQty) || stockQty < 0) nextErrors.stockQty = 'Stock must be 0 or more.'

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
      addToast('Product added', 'success')
    } catch {
      setErrorMessage('Unable to create product right now.')
      addToast('Unable to create product right now.', 'error')
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
            To use the supplier dashboard, first create a supplier account or sign in, then we&apos;ll remember your business on this
            device.
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
              href="/login"
            >
              Sign in
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <ToastContainer toasts={toasts} />
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
            <h2 className="mt-2 text-xl font-bold text-[#1f2b22]">{supplier.businessName}</h2>
            <p className="mt-1 text-xs text-[#6d7b70]">{supplier.address}</p>
          </div>
          <nav aria-label="Supplier dashboard navigation" className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'D', href: '/supplier' },
              { id: 'products', label: 'Products', icon: 'P', href: '/supplier/dashboard' },
              { id: 'orders', label: 'Orders', icon: 'O', href: '/supplier/orders' },
            ].map((item) => {
              const isActive = item.id === 'products'
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
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Products</p>
              <h1 className="mt-2 text-2xl font-bold text-[#1f2b22]">Manage your items</h1>
              <p className="mt-1 text-sm text-[#617166]">
                Create and update the products you want to offer through LocalSupply. These are separate from the Kassal catalog.
              </p>
            </div>
            <div className="px-5 py-5">
              {errorMessage ? (
                <div className="mb-4 rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">{errorMessage}</div>
              ) : null}
              <form className="grid gap-4 rounded-2xl border border-[#e2e9df] bg-[#f7faf6] p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]" onSubmit={handleCreateProduct}>
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Product name
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={120}
                      onChange={(event) => handleFormChange('name', event.target.value)}
                      placeholder="Organic carrots 1kg"
                      type="text"
                      value={form.name}
                    />
                    {formErrors.name ? <p className="mt-1 text-xs text-[#9b2c2c]">{formErrors.name}</p> : null}
                  </label>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Description (optional)
                    <textarea
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      maxLength={240}
                      onChange={(event) => handleFormChange('description', event.target.value)}
                      placeholder="Short description other buyers will see."
                      rows={3}
                      value={form.description}
                    />
                  </label>
                  <div className="block">
                    <span className="text-xs font-semibold text-[#6b7b70]">Product image (optional)</span>
                    <p className="mt-1 text-[11px] text-[#7b8b80]">JPEG, PNG, WebP or GIF, max {MAX_IMAGE_MB} MB</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <input
                        accept={ACCEPT_IMAGES}
                        className="block w-full max-w-[240px] text-sm text-[#5b665f] file:mr-3 file:rounded-xl file:border-0 file:bg-[#2f9f4f] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:hover:bg-[#25813f]"
                        onChange={handleImageChange}
                        ref={imageInputRef}
                        type="file"
                      />
                      {imagePreview ? (
                        <div className="relative inline-block">
                          <img alt="Preview" className="h-16 w-16 rounded-xl border border-[#d4ddcf] object-cover" src={imagePreview} />
                          <button
                            aria-label="Remove image"
                            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#d4ddcf] bg-white text-[#6d7b70] shadow transition hover:bg-[#f7faf6]"
                            onClick={clearImage}
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Unit
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        maxLength={40}
                        onChange={(event) => handleFormChange('unit', event.target.value)}
                        placeholder="1 kg, per piece…"
                        type="text"
                        value={form.unit}
                      />
                      {formErrors.unit ? <p className="mt-1 text-xs text-[#9b2c2c]">{formErrors.unit}</p> : null}
                    </label>
                    <label className="block text-xs font-semibold text-[#6b7b70]">
                      Price (NOK)
                      <input
                        className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                        inputMode="decimal"
                        onChange={(event) => handleFormChange('price', event.target.value)}
                        placeholder="39.90"
                        type="text"
                        value={form.price}
                      />
                      {formErrors.price ? <p className="mt-1 text-xs text-[#9b2c2c]">{formErrors.price}</p> : null}
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-[#6b7b70]">
                    Stock quantity
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d4ddcf] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a] focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#b7e0c2]"
                      inputMode="numeric"
                      onChange={(event) => handleFormChange('stockQty', event.target.value)}
                      placeholder="0"
                      type="number"
                      value={form.stockQty}
                    />
                    {formErrors.stockQty ? <p className="mt-1 text-xs text-[#9b2c2c]">{formErrors.stockQty}</p> : null}
                  </label>
                  <button
                    className="mt-2 w-full rounded-2xl bg-[#2f9f4f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f] disabled:cursor-not-allowed disabled:bg-[#9ac7a6]"
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving ? 'Saving…' : 'Add Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="border-b border-[#e5ece2] px-5 py-4">
              <h2 className="text-base font-bold text-[#1f2b22]">Your products</h2>
            </div>
            <div className="max-h-[480px] overflow-y-auto px-5 py-3">
              {products.length === 0 ? (
                <p className="py-4 text-sm text-[#6d7b70]">No products yet. Use the form above to add your first one.</p>
              ) : (
                <table className="min-w-full text-left text-sm text-[#1f2b22]">
                  <thead className="sticky top-0 bg-white text-xs text-[#6d7b70]">
                    <tr>
                      <th className="w-14 py-2 pr-2">Image</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Unit</th>
                      <th className="py-2 pr-4">Price</th>
                      <th className="py-2 pr-4 text-right">Stock</th>
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
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e2e9df] bg-[#f7faf6] text-[#9db5a4]">
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
                        <td className="py-2 pr-0 text-right text-sm font-semibold text-[#1f2b22]">{product.stockQty}</td>
                      </tr>
                    );
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

