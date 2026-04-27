'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildApiUrl } from '../../../lib/api'

const ADMIN_STORAGE_KEY = 'localsupply-admin'

type AdminSession = { id: string; email: string; name: string }

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

type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  emailVerified: boolean
  createdAt: string
  orderCount: number
}

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

type Tab = 'suppliers' | 'users' | 'orders'

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  UNVERIFIED: 'bg-gray-100 text-gray-600',
}

/** Formats an ISO date string as a Norwegian short date (e.g. "27. apr. 2026"). */
function formatDate(value: string) {
  return new Date(value).toLocaleDateString('no-NO', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Formats a number or Decimal value as a kroner string. */
function formatCurrency(value: number | string) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(2)} kr` : `${value} kr`
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminSession | null>(null)
  const [tab, setTab] = useState<Tab>('suppliers')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [orders, setOrders] = useState<Order[]>([])
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

  /** Returns the admin `Authorization: Bearer` header from localStorage. */
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
      ])
        .then(([s, u, o]) => {
          if (Array.isArray(s)) setSuppliers(s as Supplier[])
          if (Array.isArray(u)) setUsers(u as User[])
          if (Array.isArray(o)) setOrders(o as Order[])
        })
        .catch(() => { /* ignore */ })
        .finally(() => setLoading(false))
    }
    loadData()
  }, [admin])

  /** Clears the admin session from localStorage and redirects to the login page. */
  function handleLogout() {
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    router.push('/admin/login')
  }

  /** PATCHes a supplier with the given fields and merges the API response back into local state. */
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

  /** Prompts for confirmation, then DELETEs the supplier and removes it from local state. */
  async function deleteSupplier(id: string) {
    if (!window.confirm('Delete this supplier? This cannot be undone.')) return
    try {
      await fetch(buildApiUrl(`/api/admin/suppliers/${id}`), { method: 'DELETE', headers: getAuthHeader() })
      setSuppliers((prev) => prev.filter((s) => s.id !== id))
    } catch { setActionMessage('Delete failed.') }
  }

  /** Prompts for confirmation, then DELETEs the user and removes them from local state. */
  async function deleteUser(id: string) {
    if (!window.confirm('Delete this user? This cannot be undone.')) return
    try {
      await fetch(buildApiUrl(`/api/admin/users/${id}`), { method: 'DELETE', headers: getAuthHeader() })
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch { setActionMessage('Delete failed.') }
  }

  if (!admin) return null

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'suppliers', label: 'Suppliers', count: suppliers.length },
    { id: 'users', label: 'Users', count: users.length },
    { id: 'orders', label: 'Orders', count: orders.length },
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
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-[#1f2937] text-white' : 'text-[#374151] hover:bg-[#f9fafb]'}`}
              key={t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label} <span className={`ml-1 text-xs ${tab === t.id ? 'text-white/70' : 'text-[#6b7280]'}`}>({t.count})</span>
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
          </>
        )}
      </div>
    </main>
  )
}
