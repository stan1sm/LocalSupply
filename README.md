# LocalSupply

B2B marketplace for the Norwegian market connecting restaurants and cafes with local suppliers. Buyers can browse products, place orders, and chat with suppliers. Suppliers get a full dashboard to manage products, orders, and their store profile.

## What's built

**Buyer side**
- Browse a marketplace of supplier products and a grocery catalog synced from Kassal
- AI cart planner — describe a meal and it builds a cart from available products
- Checkout with Vipps or invoice, Wolt delivery integration for real delivery pricing
- Order history and tracking
- Chat with suppliers directly

**Supplier side**
- Register with Brreg (Norwegian business registry) verification
- Dashboard to manage products (with image upload), incoming orders, and store profile
- Store profile with logo/banner upload, structured opening hours, brand color
- Admin verification flow before going live in the marketplace

**Both**
- Email verification on signup
- Persistent chat between buyers and suppliers

## Stack

- Frontend: Next.js 15 (App Router) + React 19 + Tailwind CSS
- Backend: Express 5 + TypeScript
- DB: PostgreSQL via Prisma
- AI: OpenAI-compatible API for embeddings and the cart planner
- Delivery: Wolt Drive API
- Deployed on Vercel (two projects — frontend + backend)

## Architecture

The repo is a monorepo with two independent apps that talk over HTTP.

**Frontend** — Next.js App Router. Pages in `app/` are thin shells; all logic lives in `features/pages/<area>/`. API calls go through `src/lib/api.ts` which prepends `NEXT_PUBLIC_API_BASE_URL`. Two separate auth flows (buyer token / supplier token) stored in `localStorage` — no shared context provider.

**Backend** — Express app (`app.ts`) mounts all routes under `/api/*`. The AI client (`lib/aiClient.ts`) is a thin wrapper around any OpenAI-compatible endpoint — not tied to the OpenAI SDK. Embeddings are stored as JSON in Postgres (no vector DB). The Prisma client is generated into `src/generated/prisma/` — don't edit manually.

## Project structure

```
LocalSupply/
├── frontend/src/
│   ├── app/                      # Next.js routes (thin page wrappers)
│   ├── features/pages/           # UI + logic per domain
│   │   ├── marketplace/          # Product browsing, cart, checkout
│   │   ├── supplier/             # Supplier dashboard, product/order management
│   │   └── auth/                 # Login, register, verification
│   ├── components/               # Shared UI components
│   └── lib/api.ts                # buildApiUrl() — all fetch calls use this
├── backend/src/
│   ├── routes/                   # auth, products, cart, orders, suppliers, addresses
│   ├── lib/                      # aiClient, embeddings, intentCartPlanner, catalogSync, email
│   └── app.ts                    # Express app entry
├── backend/prisma/
│   └── schema.prisma             # Models: User, Supplier, Product, Order, CatalogProduct
├── docker-compose.yml            # PostgreSQL on :5433 + backend on :3001
└── README.md
```

## Security

- Passwords hashed with bcrypt; JWT tokens issued on login.
- Two token namespaces: `token` (buyers) and `supplierToken` (suppliers) — never mixed.
- CORS locked to explicit origins via `CORS_ORIGINS`; Vercel preview domains opt-in via `CORS_ALLOW_VERCEL_PREVIEWS`.
- Email verification required before login.
- No secrets committed — all credentials live in `.env` files excluded from git.

## Running locally

You need Node 18+, npm, and a Postgres database.

**Backend** — from `backend/`:

```bash
npm install
```

Create `.env`:
```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
PORT=3001
FRONTEND_BASE_URL=http://localhost:3000
BACKEND_BASE_URL=http://localhost:3001
JWT_SECRET=any-random-string

# Email — set ALLOW_FALLBACK=true to skip real SMTP in dev (shows link in UI instead)
EMAIL_VERIFICATION_ALLOW_FALLBACK=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=yourpassword
SMTP_FROM=LocalSupply <you@example.com>

# AI (OpenAI or compatible)
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_LLM_MODEL=gpt-4.1-mini
AI_EMBEDDING_MODEL=text-embedding-3-small

# Kassal grocery catalog
KASSAL_API_KEY=your-key
KASSAL_API_BASE_URL=https://kassal.app/api/v1

# Wolt Drive delivery
WOLT_API_KEY=your-key
WOLT_MERCHANT_ID=your-merchant-id
WOLT_API_BASE_URL=https://daas-staging.wolt.com
WOLT_DEFAULT_PICKUP_ADDRESS=Storgata 1, Oslo
```

```bash
npm run prisma -- generate
npm run prisma -- migrate dev
npm run dev
```

**Frontend** — from `frontend/`:

```bash
npm install
```

Create `.env.local`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

```bash
npm run dev
```

## Tests

```bash
cd backend && npm test    # vitest — backend unit tests
cd frontend && npm test   # vitest + testing-library — frontend unit tests
```

## Useful scripts

```bash
# backend
npm run catalog:sync          # import/refresh grocery catalog from Kassal
npm run embeddings:generate   # generate OpenAI embeddings for catalog products
npm run catalog:seed          # seed sample data for dev
npm run lint                  # eslint (frontend only)
```

## Deploying to Vercel

Two separate Vercel projects from the same repo:

**Frontend** — root directory: `frontend`, framework: Next.js, add `NEXT_PUBLIC_API_BASE_URL` pointing to your backend URL.

**Backend** — root directory: `backend`, requests are routed via `backend/vercel.json` to the serverless handler at `backend/api/index.ts`. Add all the env vars from above in Vercel's project settings.

After deploy, hit `https://your-backend.vercel.app/` — should return `{ "status": "ok" }`.
