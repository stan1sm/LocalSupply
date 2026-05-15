/**
 * @module vippsSessionStore
 * Shared in-memory one-time session stores for the Vipps OAuth callback.
 * Entries expire after 60 seconds and are purged every 2 minutes.
 */

export const buyerSessionStore = new Map<string, { token: string; user: string; expiresAt: number }>()
export const deliverySessionStore = new Map<string, { token: string; person: string; expiresAt: number }>()

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of buyerSessionStore) {
    if (entry.expiresAt < now) buyerSessionStore.delete(key)
  }
  for (const [key, entry] of deliverySessionStore) {
    if (entry.expiresAt < now) deliverySessionStore.delete(key)
  }
}, 120_000).unref()
