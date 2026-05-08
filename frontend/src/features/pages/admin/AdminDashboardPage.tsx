/**
 * @module AdminDashboardPage
 * Admin control panel for managing suppliers, users, and orders across the platform.
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'

const ADMIN_STORAGE_KEY = 'localsupply-admin'

/**
 * Authenticated admin session stored in localStorage.
 * @property id - Unique admin identifier.
 * @property email - Admin email address.
 * @property name - Display name of the admin.
 */
type AdminSession = { id: string; email: string; name: string }

/**
 * Supplier record as returned by the admin API.
 * @property id - Unique supplier identifier.
 * @property businessName - Registered business name.
 * @property contactName - Primary contact person.
 * @property email - Business email address.
 * @property address - Physical address.
 * @property orgnr - Norwegian organisation number, or null if not set.
 * @property isVerified - Whether the supplier has been fully verified.
 * @property verificationStatus - Current verification pipeline stage.
 * @property verificationRejectedReason - Reason for rejection, or null.
 * @property showInMarketplace - Whether the supplier is publicly visible.
 * @property createdAt - ISO timestamp of account creation.
 * @property productCount - Number of active products.
 * @property orderCount - Total orders placed through this supplier.
 */
type Supplier = {
  id: string
  businessName: string
  contactName: string
  email: string
  address: string
  orgnr: string | null
  isVerified: boolean
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'
  verificationRejectedReason: string | null
  showInMarketplace: boolean
  createdAt: string
  productCount: number
  orderCount: number
}

/**
 * Buyer user record as returned by the admin API.
 * @property id - Unique user identifier.
 * @property firstName - User's first name.
 * @property lastName - User's last name.
 * @property email - User's email address.
 * @property emailVerified - Whether the email address has been verified.
 * @property createdAt - ISO timestamp of account creation.
 * @property orderCount - Total orders placed by this user.
 */
type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  emailVerified: boolean
  createdAt: string
  orderCount: number
}

/**
 * Order record as returned by the admin API.
 * @property id - Unique order identifier.
 * @property status - Current order status (e.g. PENDING, CONFIRMED, DELIVERED).
 * @property total - Total order amount.
 * @property createdAt - ISO timestamp of order creation.
 * @property buyer - Buyer name and email.
 * @property supplierName - Name of the fulfilling supplier.
 * @property itemCount - Number of line items in the order.
 * @property woltStatus - Wolt Drive delivery status, or null if not dispatched.
 */
type Order = {
  id: string
  status: string
  total: number | string
  createdAt: string
  buyer: { firstName: string; lastName: string; email: string }
  supplierName: string
  itemCount: number
  woltStatus: string | null
}

type PendingProduct = {
  id: string
  name: string
  description: string | null
  unit: string
  price: number
  imageUrl: string | null
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
  supplier: { id: string; businessName: string }
}

/** Active tab in the admin dashboard navigation. */
type Tab = 'suppliers' | 'users' | 'orders' | 'products'

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  UNVERIFIED: 'bg-gray-100 text-gray-600',
}

/**
 * Formats an ISO date string into a localised Norwegian short date.
 * @param value - ISO 8601 date string.
 * @returns Formatted date string (e.g. "01. mai 2025").
 */
function formatDate(value: string) {
  return new Date(value).toLocaleDateString('no-NO', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Formats a numeric or string value as a Norwegian krone currency string.
 * @param value - Numeric amount or string representation of the amount.
 * @returns Formatted string with two decimal places and "kr" suffix.
 */
function formatCurrency(value: number | string) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(2)} kr` : `${value} kr`
}

/**
 * Admin dashboard page with tabs for managing suppliers, buyers, and orders.
 * Requires an active admin session stored in localStorage; redirects to login otherwise.
 */
export default function AdminDashboardPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminSession | null>(null)
  const [tab, setTab] = useState<Tab>('suppliers')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState('')
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})

  useEffect(() => {
    function checkAuth() {
      try {
        const stored = window.localStorage.getItem(ADMIN_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as AdminSession
          if (parsed?.id) { setAdmin(parsed); return }
        }
      } catch { /* ignore */ }
      router.push('/admin/login')
    }
    checkAuth()
  }, [router])

  /** Returns the Authorization header object for authenticated admin API calls. */
  function getAuthHeader(): Record<string, string> {
    try {
      const token = window.localStorage.getItem('localsupply-admin-token')
      if (token) return { Authorization: `Bearer ${token}` }
    } catch { /* ignore */ }
    return {}
  }

  useEffect(() => {
    if (!admin) return
    function loadData() {
      setLoading(true)
      const headers = getAuthHeader()
      Promise.all([
        fetch(buildApiUrl('/api/admin/suppliers'), { headers }).then((r) => r.json()),
        fetch(buildApiUrl('/api/admin/users'), { headers }).then((r) => r.json()),
        fetch(buildApiUrl('/api/admin/orders'), { headers }).then((r) => r.json()),
        fetch(buildApiUrl('/api/admin/products?status=PENDING'), { headers }).then((r) => r.json()),
      ])
        .then(([s, u, o, p]) => {
          if (Array.isArray(s)) setSuppliers(s as Supplier[])
          if (Array.isArray(u)) setUsers(u as User[])
          if (Array.isArray(o)) setOrders(o as Order[])
          if (Array.isArray(p)) setPendingProducts(p as PendingProduct[])
        })
        .catch(() => { /* ignore */ })
        .finally(() => setLoading(false))
    }
    loadData()
  }, [admin])

  /** Clears the admin session from localStorage and redirects to the admin login page. */
  function handleLogout() {
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    router.push('/admin/login')
  }

  /**
   * Sends a partial update to the supplier record via the admin API and refreshes local state.
   * @param id - Supplier ID to update.
   * @param patch - Key/value pairs to patch on the supplier record.
   */
  async function updateSupplier(id: string, patch: Record<string, unknown>) {
    setActionMessage('')
    try {
      const res = await fetch(buildApiUrl(`/api/admin/suppliers/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(patch),
      })
      if (!res.ok) { setActionMessage('Update failed.'); return }
      const updated = (await res.json()) as Partial<Supplier>
      setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)))
      setActionMessage('Updated.')
      setTimeout(() => setActionMessage(''), 2000)
    } catch { setActionMessage('Update failed.') }
  }

  /**
   * Prompts for confirmation, then permanently deletes a supplier via the admin API.
   * @param id - Supplier ID to delete.
   */
  async function deleteSupplier(id: string) {
    if (!window.confirm('Delete this supplier? This cannot be undone.')) return
    try {
      await fetch(buildApiUrl(`/api/admin/suppliers/${id}`), { method: 'DELETE', headers: getAuthHeader() })
      setSuppliers((prev) => prev.filter((s) => s.id !== id))
    } catch { setActionMessage('Delete failed.') }
  }

  /**
   * Prompts for confirmation, then permanently deletes a buyer user via the admin API.
   * @param id - User ID to delete.
   */
  async function deleteUser(id: string) {
    if (!window.confirm('Delete this user? This cannot be undone.')) return
    try {
      await fetch(buildApiUrl(`/api/admin/users/${id}`), { method: 'DELETE', headers: getAuthHeader() })
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch { setActionMessage('Delete failed.') }
  }

  async function handleProductAction(productId: string, action: 'approve' | 'reject') {
    try {
      const res = await fetch(buildApiUrl(`/api/admin/products/${productId}/${action}`), {
        method: 'PATCH',
        headers: getAuthHeader(),
      })
      if (!res.ok) { setActionMessage('Action failed.'); return }
      setPendingProducts((prev) => prev.filter((p) => p.id !== productId))
      setActionMessage(action === 'approve' ? 'Product approved.' : 'Product rejected.')
      setTimeout(() => setActionMessage(''), 3000)
    } catch { setActionMessage('Action failed.') }
  }

  if (!admin) return null

  const tabs: { id: Tab; label: string; count: number; badge?: boolean }[] = [
    { id: 'suppliers', label: 'Suppliers', count: suppliers.length },
    { id: 'users', label: 'Users', count: users.length },
    { id: 'orders', label: 'Orders', count: orders.length },
    { id: 'products', label: 'Products', count: pendingProducts.length, badge: pendingProducts.length > 0 },
  ]

  return (
    <main className="min-h-screen bg-[#f3f4f6]">
      {/* Header */}
      <header className="border-b border-[#e5e7eb] bg-white px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1f2937] text-xs font-bold text-white">LS</span>
            <div>
              <p className="text-sm font-bold text-[#1f2937]">LocalSupply Admin</p>
              <p className="text-xs text-[#6b7280]">{admin.name} · {admin.email}</p>
            </div>
          </div>
          <button
            className="rounded-lg border border-[#d1d5db] px-3 py-1.5 text-xs font-medium text-[#374151] transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Total Suppliers', value: suppliers.length },
            { label: 'Pending Verification', value: suppliers.filter((s) => s.verificationStatus === 'UNVERIFIED' || s.verificationStatus === 'PENDING').length },
            { label: 'Total Users', value: users.length },
          ].map((stat) => (
            <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm" key={stat.label}>
              <p className="text-xs font-medium text-[#6b7280]">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-[#111827]">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-sm">
          {tabs.map((t) => (
            <button
              className={`relative flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-[#1f2937] text-white' : 'text-[#374151] hover:bg-[#f9fafb]'}`}
              key={t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label} <span className={`ml-1 text-xs ${tab === t.id ? 'text-white/70' : 'text-[#6b7280]'}`}>({t.count})</span>
              {t.badge ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#e53e3e]" /> : null}
            </button>
          ))}
        </div>

        {actionMessage && (
          <div className="mb-4 rounded-lg border border-[#d1fae5] bg-[#f0fdf4] px-4 py-2 text-sm text-[#166534]">{actionMessage}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#e5e7eb] border-t-[#1f2937]" />
          </div>
        ) : (
          <>
            {/* Suppliers tab */}
            {tab === 'suppliers' && (
              <div className="space-y-3">
                {suppliers.length === 0 && <p className="text-center text-sm text-[#6b7280] py-12">No suppliers yet.</p>}
                {suppliers.map((s) => (
                  <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm" key={s.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-[#111827]">{s.businessName}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[s.verificationStatus]}`}>
                            {s.verificationStatus}
                          </span>
                          {!s.showInMarketplace && (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Hidden</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[#6b7280]">{s.email} · {s.contactName}</p>
                        <p className="text-xs text-[#6b7280]">{s.address}</p>
                        {s.orgnr && (
                          <p className="text-xs text-[#6b7280]">Org.nr: {s.orgnr}</p>
                        )}
                        <p className="mt-1 text-xs text-[#9ca3af]">
                          {s.productCount} products · {s.orderCount} orders · joined {formatDate(s.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {s.verificationStatus !== 'VERIFIED' && (
                          <button
                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700"
                            onClick={() => updateSupplier(s.id, { verificationStatus: 'VERIFIED' })}
                          >
                            Verify
                          </button>
                        )}
                        {s.verificationStatus !== 'REJECTED' && (
                          <button
                            className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-200"
                            onClick={() => {
                              const reason = rejectReason[s.id] ?? ''
                              void updateSupplier(s.id, { verificationStatus: 'REJECTED', verificationRejectedReason: reason || null })
                            }}
                          >
                            Reject
                          </button>
                        )}
                        <button
                          className="rounded-lg border border-[#d1d5db] px-3 py-1.5 text-xs font-semibold text-[#374151] transition hover:bg-[#f9fafb]"
                          onClick={() => updateSupplier(s.id, { showInMarketplace: !s.showInMarketplace })}
                        >
                          {s.showInMarketplace ? 'Hide' : 'Show'}
                        </button>
                        <button
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          onClick={() => deleteSupplier(s.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {s.verificationStatus !== 'REJECTED' && (
                      <div className="mt-2">
                        <input
                          className="w-full rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-xs text-[#374151] outline-none focus:border-[#9ca3af]"
                          onChange={(e) => setRejectReason((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder="Rejection reason (optional)"
                          type="text"
                          value={rejectReason[s.id] ?? ''}
                        />
                      </div>
                    )}
                    {s.verificationRejectedReason && (
                      <p className="mt-1 text-xs text-red-600">Reason: {s.verificationRejectedReason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Users tab */}
            {tab === 'users' && (
              <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                {users.length === 0 && <p className="py-12 text-center text-sm text-[#6b7280]">No users yet.</p>}
                <table className="w-full text-sm">
                  <thead className="border-b border-[#e5e7eb] bg-[#f9fafb] text-left text-xs font-semibold text-[#6b7280]">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Verified</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    {users.map((u) => (
                      <tr className="hover:bg-[#f9fafb]" key={u.id}>
                        <td className="px-4 py-3 font-medium text-[#111827]">{u.firstName} {u.lastName}</td>
                        <td className="px-4 py-3 text-[#374151]">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${u.emailVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {u.emailVerified ? 'Yes' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#374151]">{u.orderCount}</td>
                        <td className="px-4 py-3 text-[#6b7280]">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <button
                            className="rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                            onClick={() => deleteUser(u.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Orders tab */}
            {tab === 'orders' && (
              <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                {orders.length === 0 && <p className="py-12 text-center text-sm text-[#6b7280]">No orders yet.</p>}
                <table className="w-full text-sm">
                  <thead className="border-b border-[#e5e7eb] bg-[#f9fafb] text-left text-xs font-semibold text-[#6b7280]">
                    <tr>
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Buyer</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    {orders.map((o) => (
                      <tr className="hover:bg-[#f9fafb]" key={o.id}>
                        <td className="px-4 py-3 font-mono text-xs text-[#374151]">…{o.id.slice(-8)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#111827]">{o.buyer.firstName} {o.buyer.lastName}</p>
                          <p className="text-[10px] text-[#6b7280]">{o.buyer.email}</p>
                        </td>
                        <td className="px-4 py-3 text-[#374151]">{o.supplierName}</td>
                        <td className="px-4 py-3 font-semibold text-[#111827]">{formatCurrency(o.total)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold text-[#374151]">{o.status}</span>
                          {o.woltStatus && (
                            <p className="mt-0.5 text-[10px] text-[#6b7280]">🛵 {o.woltStatus}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#6b7280]">{formatDate(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Products tab */}
            {tab === 'products' && (
              <div className="space-y-3">
                {pendingProducts.length === 0 ? (
                  <div className="rounded-xl border border-[#e5e7eb] bg-white px-6 py-12 text-center">
                    <p className="text-sm font-semibold text-[#111827]">No products awaiting approval</p>
                    <p className="mt-1 text-xs text-[#6b7280]">New supplier products will appear here for review.</p>
                  </div>
                ) : (
                  pendingProducts.map((p) => (
                    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm" key={p.id}>
                      <div className="flex items-start gap-4">
                        {p.imageUrl ? (
                          <img alt="" className="h-16 w-16 shrink-0 rounded-lg border border-[#e5e7eb] object-cover" src={p.imageUrl} />
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-[#f9fafb] text-[#d1d5db]">
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-[#111827]">{p.name}</p>
                            <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-[10px] font-semibold text-[#854d0e]">Pending approval</span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#6b7280]">
                            {p.supplier.businessName} · {p.unit} · {Number(p.price).toFixed(2)} kr
                          </p>
                          {p.description ? <p className="mt-1 text-xs text-[#374151]">{p.description}</p> : null}
                          <p className="mt-1 text-[10px] text-[#9ca3af]">Submitted {formatDate(p.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            className="rounded-lg bg-[#dcfce7] px-3 py-1.5 text-xs font-semibold text-[#166534] transition hover:bg-[#bbf7d0]"
                            onClick={() => handleProductAction(p.id, 'approve')}
                            type="button"
                          >
                            Approve
                          </button>
                          <button
                            className="rounded-lg bg-[#fee2e2] px-3 py-1.5 text-xs font-semibold text-[#991b1b] transition hover:bg-[#fecaca]"
                            onClick={() => handleProductAction(p.id, 'reject')}
                            type="button"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
