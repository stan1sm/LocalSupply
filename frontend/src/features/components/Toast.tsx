'use client'

import { useCallback, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: string; message: string; type: ToastType }

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  return { toasts, addToast }
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`pointer-events-auto max-w-xs rounded-2xl px-4 py-3 text-sm font-semibold shadow-[0_8px_24px_rgba(18,38,24,0.12)] ${
            toast.type === 'success'
              ? 'border border-[#b2d4bc] bg-[#f0faf2] text-[#1a5e30]'
              : toast.type === 'error'
                ? 'border border-[#f0d4d4] bg-[#fff5f5] text-[#9b2c2c]'
                : 'border border-[#dce5d7] bg-white text-[#1f2b22]'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
