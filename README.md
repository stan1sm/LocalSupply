# LocalSupply

LocalSupply is a B2B supply chain platform that connects restaurants, cafes, and local businesses with suppliers
and transport vendors through one seamless digital marketplace. By combining procurement, logistics, and real-time
order management in a single system, LocalSupply reduces cost, waste, and manual overhead while improving visibility.

## Problem Statement
Small businesses face:
- Fragmented supplier relationships.
- Manual ordering processes with poor visibility.
- Inefficient logistics coordination with multiple delivery providers.
- Limited transparency in pricing, inventory, and delivery status.

## Solution Overview
LocalSupply provides a one-stop platform for procurement and logistics, including:
- Supplier Marketplace: verified local farmers, wholesalers, and distributors.
- Transport Vendor Network: integrated logistics partners with real-time routing and tracking.
- Smart Order Management: automated reordering, consolidated invoices, and inventory forecasting.
- Notifications and Status Updates: instant alerts for confirmations, delays, or arrivals.
- Data Insights: demand forecasting, supplier performance, and cost optimization analytics.
- Scalable platform: APIs plus web and mobile applications.

## Tech Stack
- Frontend: Next.js (App Router) + React + TypeScript
- Backend: Node.js + TypeScript + Express
- Database: PostgreSQL (via Prisma)

## Repo Structure
- `frontend/` Next.js web app
- `backend/` Node/Express API + Prisma schema

## Getting Started
Prerequisites:
- Node.js 18+ (or latest LTS)
- npm
- PostgreSQL (local or hosted)

### Backend
From `backend/`:
```bash
npm install
```

Create a `.env` file:
```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
PORT=3001
FRONTEND_BASE_URL=http://localhost:3000
BACKEND_BASE_URL=http://localhost:3001
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASS=your-password
SMTP_FROM=LocalSupply <mailer@example.com>
EMAIL_VERIFICATION_ALLOW_FALLBACK=false
VIPPS_CLIENT_ID=your-vipps-client-id
VIPPS_CLIENT_SECRET=your-vipps-client-secret
VIPPS_REDIRECT_URI=http://localhost:3001/api/auth/vipps/callback
VIPPS_API_BASE_URL=https://apitest.vipps.no
VIPPS_SCOPES=openid name email phoneNumber
KASSAL_API_KEY=your-kassal-api-key
KASSALAPP_API_KEY=your-kassal-api-key
KASSAL_API_BASE_URL=https://kassal.app/api/v1
CATALOG_SYNC_SECRET=optional-secret-for-post-api-products-sync
```

Prisma setup:
```bash
npm run prisma -- generate
npm run prisma -- migrate dev
```

Run the API:
```bash
npm run dev
```

User registration now requires email verification. The backend sends a verification link to the registered email address, verifies the token on the API, and redirects the user to the frontend confirmation page. For development or staging without a verified sender domain, you can set `EMAIL_VERIFICATION_ALLOW_FALLBACK=true` to return a direct verification link in the UI when email delivery fails.

Vipps login/register is supported through the browser Login API flow. You need a configured Vipps app with a redirect URI that matches `VIPPS_REDIRECT_URI`, plus `VIPPS_CLIENT_ID` and `VIPPS_CLIENT_SECRET` on the backend project.

Marketplace product discovery now uses a slim Postgres-backed catalog for Kassal imports. The backend stores lightweight product rows plus current prices per store, and the marketplace reads from the database instead of live-fetching every page view.

The slim imported catalog stores:
- `externalId`, `gtin`, `name`, `brand`, `category`, `unit`, `imageUrl`
- current price rows per chain in a dedicated table

It does not store:
- image blobs
- long descriptions or full historical payloads

To populate or refresh the imported catalog from `backend/`, run:
```bash
npm run catalog:sync
```

You can also trigger the same sync over HTTP:
```bash
POST /api/products/sync
```

If `CATALOG_SYNC_SECRET` is set, send it as:
```bash
x-catalog-sync-secret: <your-secret>
```

The sync importer now walks the paginated Kassal `/products` catalog and upserts into Postgres, grouping store listings into one product row when they share a GTIN.

### Frontend
From `frontend/`:
```bash
npm install
```

Create a `frontend/.env.local` file:
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

Then run:
```bash
npm run dev
```

If `NEXT_PUBLIC_API_BASE_URL` is omitted during local development, the frontend falls back to `http://localhost:3001`.

## Scripts
Backend:
- `npm run dev` start API with hot reload
- `npm run build` compile TypeScript to `dist/`
- `npm run start` run compiled API
- `npm run catalog:sync` upsert the imported Kassal catalog into Postgres
- `npm run prisma -- <command>` run Prisma CLI

Frontend:
- `npm run dev` start Next.js dev server
- `npm run build` build the Next.js app
- `npm run start` run the production Next.js server

## Deploying To Vercel
Use two Vercel projects (recommended for this repo structure):

1. Frontend project
- Import this repo into Vercel.
- Set the **Root Directory** to `frontend`.
- Framework preset: **Next.js** (Vercel should auto-detect it now).
- Build command: `npm run build` (Vercel usually auto-detects this).
- No SPA rewrite config is needed because routing is handled by Next.js.

2. Backend project
- Import the same repo again as a second Vercel project.
- Set the **Root Directory** to `backend`.
- The backend is exposed as a Vercel Serverless Function via `backend/api/index.ts`.
- `backend/vercel.json` rewrites all requests to that function.

Backend environment variables (Vercel Project Settings -> Environment Variables):
- `DATABASE_URL` (required once Prisma/database routes are used)
- Any other secrets from `backend/.env`

Optional frontend environment variable:
- `NEXT_PUBLIC_API_BASE_URL=https://<your-backend-project>.vercel.app`

Quick checks after deploy:
- Frontend: open the frontend Vercel URL
- Backend: open the backend Vercel URL and confirm it returns `{ "status": "ok" }`

## Status
Early-stage MVP. Core models and endpoints are in progress.

## Roadmap
- Supplier onboarding and verification flows
- Orders, invoices, and inventory tracking
- Logistics partner integration and delivery tracking
- Analytics dashboard and reporting
- Role-based access and audit logs

## License
Add a license file if you plan to open source this project.
