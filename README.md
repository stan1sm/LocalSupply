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
- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript + Express
- Database: PostgreSQL (via Prisma)

## Repo Structure
- `frontend/` Vite React app
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
PORT=3000
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

### Frontend
From `frontend/`:
```bash
npm install
npm run dev
```

## Scripts
Backend:
- `npm run dev` start API with hot reload
- `npm run build` compile TypeScript to `dist/`
- `npm run start` run compiled API
- `npm run prisma -- <command>` run Prisma CLI

Frontend:
- `npm run dev` start Vite dev server
- `npm run build` build production assets
- `npm run preview` preview production build

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
