'use client'

/**
 * @module useToast
 * React hook and supporting types for managing a timed toast notification queue.
 */

import { useCallback, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'

/**
 * Represents a single toast notification held in the queue.
 *
 * @property {string} id - Unique identifier generated at creation time.
 * @property {string} message - The text content to display inside the toast.
 * @property {ToastType} type - Visual variant: `'success'`, `'error'`, or `'info'`.
 */
export type Toast = { id: string; message: string; type: ToastType }

/**
 * Manages a list of auto-dismissing toast notifications.
 *
 * Each toast is automatically removed from the queue after 3 500 ms. Multiple
 * toasts can be queued simultaneously and will all be visible until dismissed.
 *
 * @returns {{ toasts: Toast[], addToast: (message: string, type?: ToastType) => void }}
 *   An object containing:
 *   - `toasts` – the current array of active {@link Toast} records to render.
 *   - `addToast(message, type?)` – enqueues a new toast with the given `message`
 *     and optional `type` (defaults to `'info'`).
 */
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
