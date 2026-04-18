'use client'

import { useEffect, useRef, useState } from 'react'
import { buildApiUrl, buildWsUrl } from '../../../lib/api'

const BUYER_TOKEN_KEY = 'localsupply-token'
const BUYER_USER_KEY = 'localsupply-user'
const SUPPLIER_TOKEN_KEY = 'localsupply-supplier-token'
const SUPPLIER_SESSION_KEY = 'localsupply-supplier'

type Message = {
  id: string
  conversationId: string
  senderType: 'buyer' | 'supplier'
  senderId: string
  content: string
  createdAt: string
}

type ConversationDetail = {
  id: string
  buyerId: string
  supplierId: string
  buyer: { id: string; firstName: string; lastName: string; email: string }
  supplier: { id: string; businessName: string; email: string }
}

type WsStatus = 'connecting' | 'authing' | 'joining' | 'ready' | 'error'

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return 'Today'
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ChatConversationPage({
  conversationId,
  supplierId,
}: {
  conversationId?: string
  supplierId?: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<WsStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState('')
  const [myId, setMyId] = useState('')
  const [myType, setMyType] = useState<'buyer' | 'supplier' | null>(null)
  const [convId, setConvId] = useState(conversationId ?? '')
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages])

  useEffect(() => {
    const buyerToken = window.localStorage.getItem(BUYER_TOKEN_KEY)
    const supplierToken = window.localStorage.getItem(SUPPLIER_TOKEN_KEY)
    const buyerRaw = window.localStorage.getItem(BUYER_USER_KEY)
    const supplierRaw = window.localStorage.getItem(SUPPLIER_SESSION_KEY)

    let token: string | null = null
    let role: 'buyer' | 'supplier' | null = null
    let uid = ''

    if (buyerToken && buyerRaw) {
      try {
        const u = JSON.parse(buyerRaw) as { id: string }
        uid = u.id
        role = 'buyer'
        token = buyerToken
      } catch { /* */ }
    } else if (supplierToken && supplierRaw) {
      try {
        const s = JSON.parse(supplierRaw) as { id: string }
        uid = s.id
        role = 'supplier'
        token = supplierToken
      } catch { /* */ }
    }

    if (!token || !role) {
      setStatus('error')
      setErrorMessage('Sign in to use chat.')
      return
    }

    setMyId(uid)
    setMyType(role)

    const abortController = new AbortController()

    async function init() {
      let cid = conversationId ?? convId

      // Buyer initiating: create or get conversation
      if (!cid && supplierId && role === 'buyer') {
        try {
          const resp = await fetch(buildApiUrl('/api/chat/conversations'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ supplierId }),
            signal: abortController.signal,
          })
          if (!resp.ok) throw new Error('Could not start conversation.')
          const data = (await resp.json()) as ConversationDetail
          cid = data.id
          setConvId(cid)
          setConversation(data)
        } catch (err) {
          if ((err as Error).name === 'AbortError') return
          setStatus('error')
          setErrorMessage(err instanceof Error ? err.message : 'Could not start conversation.')
          return
        }
      }

      if (!cid) {
        setStatus('error')
        setErrorMessage('No conversation to open.')
        return
      }

      // Load conversation info if not yet loaded
      if (!conversation) {
        try {
          const resp = await fetch(buildApiUrl(`/api/chat/conversations/${encodeURIComponent(cid)}`), {
            headers: { Authorization: `Bearer ${token}` },
            signal: abortController.signal,
          })
          if (resp.ok) {
            const data = (await resp.json()) as ConversationDetail
            setConversation(data)
          }
        } catch { /* non-fatal */ }
      }

      // WebSocket
      const ws = new WebSocket(buildWsUrl())
      wsRef.current = ws

      ws.addEventListener('open', () => {
        setStatus('authing')
        ws.send(JSON.stringify({ type: 'auth', token }))
      })

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>
          if (msg.type === 'authed') {
            setStatus('joining')
            ws.send(JSON.stringify({ type: 'join', conversationId: cid }))
          } else if (msg.type === 'history') {
            setMessages((msg.messages as Message[]) ?? [])
            setStatus('ready')
            setTimeout(() => inputRef.current?.focus(), 50)
          } else if (msg.type === 'message') {
            setMessages((prev) => [...prev, msg.message as Message])
          } else if (msg.type === 'error') {
            setStatus('error')
            setErrorMessage(String(msg.message))
          }
        } catch { /* */ }
      })

      ws.addEventListener('close', () => {
        setStatus((prev) => prev === 'ready' ? 'error' : prev)
        setErrorMessage((prev) => prev || 'Connection lost. Refresh to reconnect.')
      })

      ws.addEventListener('error', () => {
        setStatus('error')
        setErrorMessage('Could not connect to chat server.')
      })
    }

    init()

    return () => {
      abortController.abort()
      wsRef.current?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function sendMessage() {
    if (!input.trim() || status !== 'ready' || !wsRef.current || !convId) return
    wsRef.current.send(JSON.stringify({ type: 'send', conversationId: convId, content: input.trim() }))
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const partnerName = conversation
    ? myType === 'buyer'
      ? conversation.supplier.businessName
      : `${conversation.buyer.firstName} ${conversation.buyer.lastName}`
    : '…'

  // Group messages by date for date separators
  const grouped: { date: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const d = formatDate(msg.createdAt)
    const last = grouped[grouped.length - 1]
    if (last && last.date === d) {
      last.msgs.push(msg)
    } else {
      grouped.push({ date: d, msgs: [msg] })
    }
  }

  const statusLabel: Record<WsStatus, string> = {
    connecting: 'Connecting…',
    authing: 'Authenticating…',
    joining: 'Loading messages…',
    ready: '',
    error: '',
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,155,79,0.18),_transparent_28%),linear-gradient(180deg,#f7fbf6_0%,#edf2eb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <a
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#2f9f4f] hover:text-[#1f2937]"
            href="/chat"
          >
            <span aria-hidden="true">←</span> Messages
          </a>
          {partnerName !== '…' && (
            <span className="text-xs text-[#9ca3af]">/ {partnerName}</span>
          )}
        </div>

        {/* Chat card */}
        <div className="flex h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-[28px] border border-[#dce5d7] bg-white/95 shadow-[0_18px_60px_rgba(18,38,24,0.08)] backdrop-blur">

          {/* Chat header */}
          <div className="border-b border-[#e5ece2] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f9f4f]">Chat</p>
            <h1 className="mt-0.5 text-lg font-bold text-[#1f2b22]">{partnerName}</h1>
            {status !== 'ready' && status !== 'error' && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#9ca3af]">
                <span className="h-2 w-2 animate-spin rounded-full border border-[#9ca3af] border-t-[#2f9f4f]" />
                {statusLabel[status]}
              </p>
            )}
            {status === 'ready' && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#2f9f4f]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2f9f4f]" /> Connected
              </p>
            )}
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {status === 'error' ? (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-2xl border border-[#f0d4d4] bg-[#fff5f5] px-5 py-4 text-center text-sm text-[#9b2c2c]">
                  {errorMessage}
                  {errorMessage.includes('Sign in') && (
                    <div className="mt-3 flex justify-center gap-2">
                      <a className="rounded-xl bg-[#2f9f4f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#25813f]" href="/login">Sign in as buyer</a>
                      <a className="rounded-xl border border-[#d4ddcf] px-4 py-2 text-xs font-semibold text-[#374740] hover:text-[#2f9f4f]" href="/supplier/login">Sign in as supplier</a>
                    </div>
                  )}
                </div>
              </div>
            ) : messages.length === 0 && status === 'ready' ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#6b7b70]">Start the conversation</p>
                  <p className="mt-1 text-xs text-[#9ca3af]">Send a message to {partnerName}</p>
                </div>
              </div>
            ) : (
              grouped.map(({ date, msgs }) => (
                <div key={date} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#eef2ec]" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">{date}</span>
                    <div className="h-px flex-1 bg-[#eef2ec]" />
                  </div>
                  {msgs.map((msg) => {
                    const isMine = msg.senderId === myId && msg.senderType === myType
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 ${
                          isMine
                            ? 'rounded-br-sm bg-[#2f9f4f] text-white'
                            : 'rounded-bl-sm bg-[#f0f4ef] text-[#1f2b22]'
                        }`}>
                          <p className="text-sm leading-snug">{msg.content}</p>
                          <p className={`mt-1 text-right text-[9px] ${isMine ? 'text-white/60' : 'text-[#9ca3af]'}`}>
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-[#e5ece2] px-4 py-3">
            <div className="flex items-center gap-2 rounded-2xl border border-[#d4ddcf] bg-[#f9fbf8] px-3 py-2 focus-within:border-[#2f9f4f] focus-within:ring-2 focus-within:ring-[#b7e0c2]">
              <input
                className="flex-1 bg-transparent text-sm text-[#1f2937] outline-none placeholder:text-[#95a39a]"
                disabled={status !== 'ready'}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={status === 'ready' ? 'Type a message…' : statusLabel[status] || 'Connecting…'}
                ref={inputRef}
                type="text"
                value={input}
              />
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#2f9f4f] transition hover:bg-[#25813f] disabled:opacity-40"
                disabled={!input.trim() || status !== 'ready'}
                onClick={sendMessage}
                type="button"
              >
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-center text-[9px] text-[#c7d2c2]">Enter to send</p>
          </div>
        </div>
      </div>
    </main>
  )
}
