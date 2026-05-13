# LocalSupply — Agent Handoff

## Project overview

LocalSupply is a B2B/B2C marketplace connecting Norwegian restaurants and cafes with local food suppliers. Buyers browse products, build a cart, checkout with store selection and Wolt delivery, and chat with suppliers. Suppliers have a full dashboard (products, orders, profile, chat).

Current branch in active development: **`development`**. Main branch (`main`) is production.

---

## Repo layout

```
LocalSupply/
  frontend/         Next.js 15 App Router, React 19, Tailwind CSS 4  → Vercel
  backend/          Express 5 + TypeScript ESM, Prisma 7, PostgreSQL  → Vercel
  delivery-service/ Express 5, drop-in Wolt Drive replacement         → Vercel
  .github/workflows/
    ci.yml          lint + test + build on every push/PR
    cd.yml          deploys to Vercel via deploy hooks on push to development/main
```

---

## Architecture

### Frontend
- Pages: `app/<route>/page.tsx` are thin wrappers. All real logic lives in `src/features/pages/<area>/<Name>Page.tsx`.
- API calls: always use `buildApiUrl()` from `src/lib/api.ts` — reads `NEXT_PUBLIC_API_BASE_URL`, falls back to `http://localhost:3001`.
- Auth: JWT in `localStorage['localsupply-token']`, buyer profile in `localStorage['localsupply-user']`.
- Cart: stored in `localStorage['localsupply-marketplace-cart']` as JSON array of `CartItem`.
- Address autocomplete: GeoNorge API via `src/lib/geonorgeAdresser.ts` (proxied through backend to avoid CORS).
- Maps: Leaflet loaded lazily in `features/components/DeliveryMap.tsx`.

### Backend
- All routers in `src/routes/<name>.ts`, wired in `src/app.ts` under `/api/` prefix.
- Protected routes use `requireBuyerAuth`, `requireSupplierAuth`, or `requireAdminAuth` middleware (JWT from `Authorization: Bearer` header). Three separate JWT secrets.
- Prisma client import: always `import { getPrismaClient } from '../lib/prisma.js'` — never instantiate directly.
- All imports use `.js` extension (ESM with `"type": "module"`).
- `src/lib/aiClient.ts` — OpenAI-compatible client. Reads `AI_API_KEY` / `AI_BASE_URL` / `AI_LLM_MODEL` / `AI_EMBEDDING_MODEL`. Default model: `text-embedding-3-small` for embeddings, `gpt-4.1-mini` for chat.
- `src/lib/catalogSync.ts` — paginates Kassal API, upserts into `CatalogProduct` + `CatalogProductPrice`.
- `src/lib/email.ts` — Resend SDK; falls back to logging if `EMAIL_VERIFICATION_ALLOW_FALLBACK=true`.
- `src/lib/woltDrive.ts` — Wolt Drive delivery API client.
- `src/lib/storeLocator.ts` — GeoNorge geocoding + OpenStreetMap Overpass API to find nearest grocery store branch.

### Delivery service
- Drop-in for Wolt Drive. Simulates delivery: `CREATED → PICKED_UP` at 30% of ETA, `PICKED_UP → DELIVERED` at 100%.
- Cron called every minute by cron-job.org at `/api/cron/advance-deliveries`.

---

## Database (Neon PostgreSQL)

Key models:
- `User` — buyers (email/password + Vipps OAuth)
- `Supplier` — suppliers (email/password)
- `Admin` — admin users
- `CatalogProduct` + `CatalogProductPrice` — grocery catalog synced from Kassal API. Prices per store code: `kiwi`, `rema1000`, `coop`, `meny`, `spar`, `joker`, `bunnpris`.
- `ProductEmbedding` — OpenAI vectors for AI cart matching and substitution (stored as `vectorJson: Json`)
- `Order` + `OrderItem` — orders. Order has indexes on `buyerId`, `supplierId`, `status`, `createdAt`.
- `Conversation` + `Message` — 1-to-1 buyer↔supplier chat.

Migrations in `backend/prisma/migrations/`. Run `npx prisma migrate dev` after schema changes.

---

## Key conventions

- Commit messages: short one-liner, conventional commits style (`feat:`, `fix:`, `perf:`, `chore:`)
- **Never** add `Co-Authored-By: Claude` or any Anthropic attribution to commits or PRs — user is very strict about this
- **Never push** without explicit user instruction
- Run `npm run lint` + `npm run test -- --run` in the affected package before every commit
- No verbose AI-style commit messages — write them as a developer would type quickly

---

## What was built in recent sessions

### Checkout page (3-column layout)
`frontend/src/features/pages/checkout/CheckoutPage.tsx`

Layout: `lg:grid-cols-[220px_minmax(0,1fr)_360px] xl:grid-cols-[220px_260px_minmax(0,1fr)_320px]`
- Column 1: `BuyerSidebar` (navigation)
- Column 2 (xl only): cart item list with line totals — read-only, "Edit cart →" link
- Column 3: store selection panel with ranked stores + savings callout + delivery map
- Column 4: delivery address, payment, order summary, place order button

### AI substitute finder for unavailable items
When a cart item is unavailable at the selected store, a "Find substitute" button appears. It calls `POST /api/cart/ai-substitute`.

**Backend endpoint** (`backend/src/routes/cart.ts`):
1. Fetches source product metadata via `priceId` (category, brand, price, stored embedding)
2. Falls back to `getEmbedding(itemName)` if no stored vector
3. Queries store products filtered by same category first; broadens if < 5 results
4. Composite score: `semSim * 0.55 + catBonus * 0.25 + brandBonus * 0.12 + priceScore * 0.08`
5. Returns top 3 candidates

**Frontend state** in CheckoutPage:
```typescript
type AiCandidate = { catalogProductId: string; name: string; brand: string | null; imageUrl: string | null; unitPrice: number }
aiSubstitutes: Record<string, AiCandidate[]>       // keyed by priceId
aiSubstituteLoading: Record<string, boolean>
acceptedSubstitutes: (AiCandidate & { quantity: number; originalName: string })[]
```
Accepted substitutes are included in `handlePlaceOrder` and counted in `effectiveTotal`.

### Store re-ranking by real delivery cost
Once `storeLocatorData` (real distance-based delivery fee from the backend) loads, stores are re-ranked using `useMemo`. The best store auto-switches if the user hasn't manually changed selection. Uses `useRef` for selected/initial store codes to avoid stale closure issues in `useEffect`.

### Performance fixes (merged to development)
- `backend/src/routes/orders.ts`: Pre-fetches all catalog product stubs in one `findMany` before the order creation loop — eliminates N+1 `findFirst` per item.
- `backend/src/routes/chat.ts` (`GET /conversations/:id/messages`): Conversation auth check and message fetch now run in `Promise.all` — was two sequential DB round-trips.

### Cart isolation fix
`localStorage['localsupply-marketplace-cart']` is now cleared on login (`LoginPage.tsx`) and on Vipps OAuth return (`app/auth/vipps-return/page.tsx`) before writing the new session. Prevents one user's cart leaking to the next.

---

## Known issues / open GitHub issues

- **#6** — Vipps ePayment (checkout payment via Vipps, separate from Vipps Login)
- **#64** — Supplier Vipps login
- **#65** — Resend email (production email sending)
- **#66** — Invoice PDF generation
- **#67** — Wolt tracking UI improvements
- **#68** — Various UI polish items

---

## Dev commands

```bash
# Frontend (run from frontend/)
npm run dev          # :3000
npm run lint         # ESLint
npm run test         # Vitest

# Backend (run from backend/)
npm run dev          # :3001
npm run test
npx prisma migrate dev
npm run catalog:sync
npm run embeddings:generate

# Delivery service (run from delivery-service/)
npm run dev          # :3002

# E2E (from root)
npm run test:e2e
```

---

## Environment variables (backend)

```
DATABASE_URL             Neon PostgreSQL connection string (pooler endpoint)
AI_API_KEY               OpenAI API key
AI_BASE_URL              OpenAI base URL (default: https://api.openai.com)
AI_LLM_MODEL             Chat model (default: gpt-4.1-mini)
AI_EMBEDDING_MODEL       Embedding model (default: text-embedding-3-small)
BUYER_JWT_SECRET
SUPPLIER_JWT_SECRET
ADMIN_JWT_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
WOLT_API_BASE_URL
WOLT_API_KEY
WOLT_MERCHANT_ID
VIPPS_BASE_URL
VIPPS_CLIENT_ID
VIPPS_CLIENT_SECRET
VIPPS_REDIRECT_URI
BLOB_READ_WRITE_TOKEN     Vercel Blob
EMAIL_VERIFICATION_ALLOW_FALLBACK=true  (dev only)
```

---

## Current branch state

On `development`, ahead of `main` by many commits. The CD pipeline deploys `development` to the Vercel preview environment automatically on push.

Last 5 commits on development:
```
e86bb5b fix: clear cart on login and vipps oauth return
12f0a13 perf: batch catalog product lookup and parallelize chat message fetch
52edc79 fix: re-rank stores by real delivery cost once locator data loads
f2bdaf8 fix: category-first + composite scoring for AI substitute search
8808504 fix: use stored product embedding for AI substitute search
```
