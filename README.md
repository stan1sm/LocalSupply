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

## Useful scripts

```bash
# backend
npm run catalog:sync          # import/refresh grocery catalog from Kassal
npm run embeddings:generate   # generate OpenAI embeddings for catalog products
npm run catalog:seed          # seed sample data for dev

# both
npm run test                  # vitest
npm run lint                  # eslint (frontend only)
```

## Deploying to Vercel

Two separate Vercel projects from the same repo:

**Frontend** — root directory: `frontend`, framework: Next.js, add `NEXT_PUBLIC_API_BASE_URL` pointing to your backend URL.

**Backend** — root directory: `backend`, requests are routed via `backend/vercel.json` to the serverless handler at `backend/api/index.ts`. Add all the env vars from above in Vercel's project settings.

After deploy, hit `https://your-backend.vercel.app/` — should return `{ "status": "ok" }`.
