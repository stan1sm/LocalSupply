'use client'

import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../../lib/api'

const BUYER_TOKEN_KEY = 'localsupply-token'
const BUYER_USER_KEY = 'localsupply-user'
const SUPPLIER_TOKEN_KEY = 'localsupply-supplier-token'
const SUPPLIER_SESSION_KEY = 'localsupply-supplier'

type SupplierSession = { id: string; businessName: string; address: string }

type ConversationSummary = {
  id: string
  buyerId: string
  supplierId: string
  updatedAt: string
  buyer: { id: string; firstName: string; lastName: string; email: string }
  supplier: { id: string; businessName: string; email: string }
  messages: { content: string; senderType: string; createdAt: string }[]
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ChatInboxPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [role, setRole] = useState<'buyer' | 'supplier' | null>(null)
  const [supplierSession, setSupplierSession] = useState<SupplierSession | null>(null)

  useEffect(() => {
    const buyerToken = window.localStorage.getItem(BUYER_TOKEN_KEY)
    const supplierToken = window.localStorage.getItem(SUPPLIER_TOKEN_KEY)
    const buyerRaw = window.localStorage.getItem(BUYER_USER_KEY)
    const supplierRaw = window.localStorage.getItem(SUPPLIER_SESSION_KEY)

    let token: string | null = null
    let detectedRole: 'buyer' | 'supplier' | null = null

    if (buyerToken && buyerRaw) {
      try {
        JSON.parse(buyerRaw)
        token = buyerToken
        detectedRole = 'buyer'
      } catch { /* */ }
    } else if (supplierToken && supplierRaw) {
      try {
        const parsed = JSON.parse(supplierRaw) as SupplierSession
        token = supplierToken
        detectedRole = 'supplier'
        setSupplierSession(parsed)
      } catch { /* */ }
    }

    if (!token || !detectedRole) {
      setIsLoading(false)
      setErrorMessage('Sign in to see your messages.')
      return
    }

    setRole(detectedRole)

    let cancelled = false
    async function load() {
      try {
        const resp = await fetch(buildApiUrl('/api/chat/conversations'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) throw new Error('Unable to load messages.')
        const data = (await resp.json()) as ConversationSummary[]
        if (!cancelled) setConversations(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : 'Unable to load messages.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const inboxContent = (
    <div className="overflow-hidden rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
          <div className="border-b border-[#e5ece2] px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Messages</p>
            <h1 className="mt-1 text-2xl font-bold text-[#1f2b22]">Your conversations</h1>
          </div>

          {isLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="animate-pulse border-b border-[#f0f4ef] px-6 py-4" key={i}>
                  <div className="h-4 w-1/3 rounded bg-[#e5ece2]" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-[#f0f4ef]" />
                </div>
              ))}
            </div>
          ) : errorMessage ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-[#9b2c2c]">{errorMessage}</p>
              {errorMessage.includes('Sign in') && (
                <div className="mt-4 flex justify-center gap-2">
                  <a className="rounded-xl bg-[#2f9f4f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#25813f]" href="/login">Buyer sign in</a>
                  <a className="rounded-xl border border-[#d4ddcf] px-4 py-2 text-xs font-semibold text-[#374740] hover:text-[#2f9f4f]" href="/supplier/login">Supplier sign in</a>
                </div>
              )}
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <svg className="mx-auto h-12 w-12 text-[#d4ddcf]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-3 text-sm font-semibold text-[#6b7b70]">No conversations yet</p>
              {role === 'buyer' && (
                <p className="mt-1 text-xs text-[#9ca3af]">
                  Click <strong>Connect</strong> on any supplier to start a conversation.
                </p>
              )}
            </div>
          ) : (
            <ul>
              {conversations.map((conv, idx) => {
                const lastMsg = conv.messages[0]
                const partnerName = role === 'buyer'
                  ? conv.supplier.businessName
                  : `${conv.buyer.firstName} ${conv.buyer.lastName}`
                return (
                  <li key={conv.id}>
                    <a
                      className={`flex items-center gap-4 px-6 py-4 transition hover:bg-[#f7faf6] ${
                        idx < conversations.length - 1 ? 'border-b border-[#f0f4ef]' : ''
                      }`}
                      href={`/chat/${encodeURIComponent(conv.id)}`}
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f4eb] text-sm font-bold text-[#2f9f4f]">
                        {partnerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-[#1f2b22]">{partnerName}</p>
                          {lastMsg && (
                            <span className="shrink-0 text-[10px] text-[#9ca3af]">
                              {formatRelative(lastMsg.createdAt)}
                            </span>
                          )}
                        </div>
                        {lastMsg ? (
                          <p className="mt-0.5 truncate text-xs text-[#7b8b80]">
                            {lastMsg.content}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-[#9ca3af]">No messages yet</p>
                        )}
                      </div>
                      <svg className="h-4 w-4 shrink-0 text-[#c7d2c2]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
  )

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      {role === 'supplier' && supplierSession ? (
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-[#dce5d7] bg-white/95 p-4 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">
            <div className="px-2 pb-4">
              <a className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f] hover:text-[#1f2937]" href="/">
                <span aria-hidden="true">←</span><span>LocalSupply</span>
              </a>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#2f9f4f]">Supplier</p>
              <h2 className="mt-2 text-xl font-bold text-[#1f2b22]">{supplierSession.businessName}</h2>
              <p className="mt-1 text-xs text-[#6d7b70]">{supplierSession.address}</p>
            </div>
            <nav className="space-y-1">
              {[
                { id: 'dashboard', label: 'Dashboard',      icon: 'D', href: '/supplier' },
                { id: 'products',  label: 'Products',       icon: 'P', href: '/supplier/dashboard' },
                { id: 'orders',    label: 'Orders',         icon: 'O', href: '/supplier/orders' },
                { id: 'chats',     label: 'Chats',          icon: 'H', href: '/chat' },
                { id: 'settings',  label: 'Store settings', icon: 'S', href: '/supplier/settings' },
              ].map((item) => (
                <a
                  key={item.id}
                  aria-current={item.id === 'chats' ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                    item.id === 'chats' ? 'bg-[#f0f4ef] text-[#1f2b22]' : 'text-[#4f5d52] hover:bg-[#f6faf5] hover:text-[#1f2b22]'
                  }`}
                  href={item.href}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#d6dfd2] bg-white text-xs font-bold text-[#5a675d]">
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <div>{inboxContent}</div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-4">
            <a className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f9f4f] hover:text-[#1f2937]" href="/marketplace/dashboard">
              <span aria-hidden="true">←</span> Marketplace
            </a>
          </div>
          {inboxContent}
        </div>
      )}
    </main>
  )
}
