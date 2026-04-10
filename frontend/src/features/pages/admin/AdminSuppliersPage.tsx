'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000'

type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

type Supplier = {
  id: string
  businessName: string
  contactName: string
  email: string
  phoneNumber: string
  address: string
  verificationStatus: VerificationStatus
  verificationRejectedReason: string | null
  createdAt: string
}

const STATUS_LABELS: Record<VerificationStatus, string> = {
  UNVERIFIED: 'Unverified',
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
}

const STATUS_STYLES: Record<VerificationStatus, string> = {
  UNVERIFIED: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-yellow-100 text-yellow-700',
  VERIFIED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const STATUS_FILTERS: Array<{ label: string; value: VerificationStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Unverified', value: 'UNVERIFIED' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Rejected', value: 'REJECTED' },
]

function StatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function RejectModal({
  supplier,
  onConfirm,
  onCancel,
}: {
  supplier: Supplier
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-[#1b2a1f]">Reject supplier</h3>
        <p className="mt-1 text-sm text-[#5b665f]">
          Provide a reason for rejecting <strong>{supplier.businessName}</strong>. This will be emailed to the supplier.
        </p>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1.5 text-sm font-medium text-[#374151]">
            Rejection reason
            <textarea
              className="mt-1 w-full rounded-xl border border-[#d1d5db] px-3 py-2 text-sm text-[#1f2937] outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Incomplete business documentation, address could not be verified…"
              required
              rows={4}
              value={reason}
            />
            <span className="block text-right text-xs text-[#9ca3af]">{reason.length}/500</span>
          </label>
          <div className="flex gap-3">
            <button
              className="flex-1 rounded-xl border border-[#d1d5db] px-4 py-2.5 text-sm font-medium text-[#374151] transition hover:bg-[#f9fafb]"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              disabled={!reason.trim()}
              type="submit"
            >
              Reject supplier
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SupplierRow({
  supplier,
  onApprove,
  onReject,
  actionPending,
}: {
  supplier: Supplier
  onApprove: (id: string) => void
  onReject: (supplier: Supplier) => void
  actionPending: boolean
}) {
  const canAct = supplier.verificationStatus === 'PENDING' || supplier.verificationStatus === 'UNVERIFIED'

  return (
    <tr className="border-t border-[#e5e7eb] hover:bg-[#f9fafb]">
      <td className="px-4 py-3">
        <p className="font-medium text-[#1b2a1f]">{supplier.businessName}</p>
        <p className="text-xs text-[#5b665f]">{supplier.contactName}</p>
      </td>
      <td className="px-4 py-3 text-sm text-[#374151]">{supplier.email}</td>
      <td className="px-4 py-3 text-sm text-[#374151]">{supplier.phoneNumber}</td>
      <td className="px-4 py-3 text-sm text-[#374151]">{supplier.address}</td>
      <td className="px-4 py-3">
        <StatusBadge status={supplier.verificationStatus} />
        {supplier.verificationRejectedReason ? (
          <p className="mt-1 max-w-[180px] text-xs text-red-600" title={supplier.verificationRejectedReason}>
            {supplier.verificationRejectedReason.length > 60
              ? supplier.verificationRejectedReason.slice(0, 60) + '…'
              : supplier.verificationRejectedReason}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-sm text-[#5b665f]">{new Date(supplier.createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        {canAct ? (
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-[#2f9f4f] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#25813f] disabled:opacity-50"
              disabled={actionPending}
              onClick={() => onApprove(supplier.id)}
              type="button"
            >
              Approve
            </button>
            <button
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              disabled={actionPending}
              onClick={() => onReject(supplier)}
              type="button"
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="text-xs text-[#9ca3af]">—</span>
        )}
      </td>
    </tr>
  )
}

export default function AdminSuppliersPage() {
  const [secret, setSecret] = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [filter, setFilter] = useState<VerificationStatus | 'ALL'>('PENDING')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<Supplier | null>(null)
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const fetchSuppliers = useCallback(
    async (currentSecret: string, status: VerificationStatus | 'ALL') => {
      setLoading(true)
      setError('')
      try {
        const url =
          status === 'ALL' ? `${API_BASE}/admin/suppliers` : `${API_BASE}/admin/suppliers?status=${status}`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${currentSecret}` },
        })
        if (res.status === 401 || res.status === 403) {
          setError('Invalid admin secret.')
          setSecret('')
          return
        }
        if (!res.ok) throw new Error(`Server error ${res.status}`)
        setSuppliers((await res.json()) as Supplier[])
      } catch {
        setError('Failed to load suppliers. Check your network and try again.')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (secret) {
      void fetchSuppliers(secret, filter)
    }
  }, [secret, filter, fetchSuppliers])

  async function handleApprove(id: string) {
    setActionPending(true)
    try {
      const res = await fetch(`${API_BASE}/admin/suppliers/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (!res.ok) throw new Error()
      showToast('Supplier approved and notified.')
      await fetchSuppliers(secret, filter)
    } catch {
      setError('Failed to approve supplier.')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return
    const { id } = rejectTarget
    setRejectTarget(null)
    setActionPending(true)
    try {
      const res = await fetch(`${API_BASE}/admin/suppliers/${id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error()
      showToast('Supplier rejected and notified.')
      await fetchSuppliers(secret, filter)
    } catch {
      setError('Failed to reject supplier.')
    } finally {
      setActionPending(false)
    }
  }

  if (!secret) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7faf5] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#dfe5da] bg-white p-8 shadow-lg">
          <h1 className="text-xl font-bold text-[#1b2a1f]">Admin access</h1>
          <p className="mt-1 text-sm text-[#5b665f]">Enter the admin secret to continue.</p>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setSecret(secretInput.trim())
            }}
          >
            <label className="block space-y-1.5 text-sm font-medium text-[#374151]">
              Admin secret
              <input
                autoComplete="current-password"
                className="mt-1 w-full rounded-xl border border-[#d1d5db] px-3 py-2.5 text-sm outline-none transition focus:border-[#2f9f4f] focus:ring-2 focus:ring-[#2f9f4f]/20"
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="Enter secret"
                required
                type="password"
                value={secretInput}
              />
            </label>
            <button
              className="w-full rounded-xl bg-[#2f9f4f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25813f]"
              type="submit"
            >
              Sign in
            </button>
          </form>
        </div>
      </main>
    )
  }

  const pendingCount = suppliers.filter((s) => s.verificationStatus === 'PENDING').length

  return (
    <main className="min-h-screen bg-[#f7faf5] px-4 py-8">
      {toast ? (
        <div className="fixed right-4 top-4 z-40 rounded-xl bg-[#1b2a1f] px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {rejectTarget ? (
        <RejectModal
          onCancel={() => setRejectTarget(null)}
          onConfirm={(reason) => void handleRejectConfirm(reason)}
          supplier={rejectTarget}
        />
      ) : null}

      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1b2a1f]">Supplier verification</h1>
            {pendingCount > 0 ? (
              <p className="mt-0.5 text-sm text-[#5b665f]">
                {pendingCount} supplier{pendingCount !== 1 ? 's' : ''} awaiting review
              </p>
            ) : null}
          </div>
          <button
            className="rounded-xl border border-[#dfe5da] bg-white px-4 py-2 text-sm font-medium text-[#374151] transition hover:bg-[#f0f5ee]"
            onClick={() => void fetchSuppliers(secret, filter)}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 flex gap-2">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                filter === value
                  ? 'bg-[#2f9f4f] text-white'
                  : 'bg-white text-[#374151] border border-[#dfe5da] hover:bg-[#f0f5ee]'
              }`}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfe5da] bg-white shadow-sm">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#5b665f]">Loading…</div>
          ) : suppliers.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#5b665f]">No suppliers found for this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f7faf5] text-left text-xs font-semibold uppercase tracking-wide text-[#5b665f]">
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Applied</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <SupplierRow
                      actionPending={actionPending}
                      key={supplier.id}
                      onApprove={(id) => void handleApprove(id)}
                      onReject={setRejectTarget}
                      supplier={supplier}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
