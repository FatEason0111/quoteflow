# QuoteFlow

QuoteFlow is a pricing operations workspace for procurement teams. It is designed around one practical loop: watch material movement, compare supplier quotes, raise the right alert, and move the item into an approval-ready quote package without losing context between screens.

This repository currently combines two layers:

- a high-fidelity static frontend prototype in `frontend/`
- a working Express + Prisma backend in `backend/`

The result is already useful as a local demo environment. You can boot the full stack with Docker Compose, sign in with seeded accounts, review the dashboard, open alerts, and walk a quote package all the way from draft to dispatch.

## What the project covers today

- Overview dashboard for tracked SKUs, open alerts, savings windows, and supplier responsiveness
- Watchlist with best quote, quote spread, 7-day movement, 30-day movement, status, search, and sorting
- SKU detail views for price history, supplier comparisons, recent events, and recommended next actions
- Alert inbox for price movement, quote spread, and supplier response SLA issues
- Quote Builder flow for creating, submitting, approving, and dispatching quote packages
- Supplier workspace for profile, performance, communication, and risk review
- Settings for thresholds, delivery channels, routing, and approval governance
- CSV import endpoints for SKUs, suppliers, price points, and supplier quotes
- Role-based session auth with `HttpOnly` cookies
- Demo data seeded into PostgreSQL on first boot

## Product flow

1. Track price movement and supplier spread from the Overview and Watchlist screens.
2. Open an alert when a threshold is crossed or a supplier response goes stale.
3. Review the SKU context, supplier quotes, and recent activity.
4. Create a quote package from a SKU or directly from an alert.
5. Submit the package for approval.
6. Record dispatch to suppliers and track follow-up status.

High-value metals packages automatically add a finance approval step, so the seeded demo reflects a real routing rule rather than a placeholder workflow.

## Why the repo is split this way

The frontend is intentionally a static multi-page prototype served by Nginx in Docker. The backend already models the workflow in more detail with Express, Prisma, and PostgreSQL. That split keeps UI iteration lightweight while the domain model, auth flow, alert logic, and approval steps continue to solidify.

In other words: the frontend is optimized for product iteration, and the backend is where the workflow rules already live.

## Architecture

- `frontend/`
  Static landing page, workspace screens, shared CSS, and shared JavaScript.
- `backend/`
  Express API, Prisma schema, session auth, alert engine, quote package workflow, and tests.
- `docker-compose.yml`
  Local stack for PostgreSQL, backend API, and frontend delivery.
- `docs/design-system.md`
  Visual direction, screen inventory, and UI system notes.

When the frontend is served through Docker, `/api` is proxied to the backend automatically.

When the pages are opened directly from the filesystem, the frontend falls back to `http://localhost:3000/api`.

## Quick start

### Recommended: run the full stack with Docker Compose

Prerequisite:

- Docker with Compose support

Start everything from the repository root:

```bash
docker compose up --build
```

Available services:

- Frontend: `http://localhost:5173`
- API root: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`
- Version endpoint: `http://localhost:3000/api/version`

On first boot, the backend container will:

1. apply the Prisma schema with `prisma db push`
2. seed the demo workspace and sample records
3. start the API server

## Seeded demo workspace

The seed creates one workspace, `Northstar Metals Procurement` (`northstar-cn`), with:

- 5 users across admin, analyst, buyer, approver, and finance approval roles
- 5 tracked materials including 304 sheet, aluminum coil, nickel bar, copper rod, and zinc plate
- 5 suppliers with quote history and scoring data
- watchlist items, price history, approval rules, open alerts, and quote requests

That means the dashboard, alert queue, supplier comparison, and approval workflow are all populated immediately after startup.

### Demo accounts

All seeded users share the same password: `QuoteFlow123!`

| Role | Email |
| --- | --- |
| Admin | `admin@quoteflow.local` |
| Analyst | `analyst@quoteflow.local` |
| Buyer | `buyer@quoteflow.local` |
| Approver | `approver@quoteflow.local` |
| Finance approver | `finance@quoteflow.local` |

## Local development

### Backend

Requirements:

- Node.js 18+
- PostgreSQL 16+ or a compatible local Postgres instance

Setup:

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push
npm run db:seed
npm run dev
```

The default environment file expects Postgres at `localhost:5432` and enables common local frontend origins on ports `5173` and `5500`.

### Frontend

There is no frontend build step. Use one of these approaches:

1. Run the full stack with Docker Compose.
2. Open `frontend/index.html` directly from the filesystem.
3. Serve `frontend/` from another local HTTP server and pass an explicit API base.

Examples:

```bash
open frontend/index.html
```

or:

```text
http://127.0.0.1:5500/index.html?apiBase=http://localhost:3000
```

That `apiBase` query parameter is important when you are serving the static files outside Docker, because the prototype otherwise assumes `/api` should resolve on the same origin.

## API surface

The backend exposes both `/api` and `/api/v1`.

Core modules:

- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Dashboard: `GET /api/dashboard/overview`
- Watchlist: `GET /api/watchlist`, `GET /api/watchlist/export`
- SKUs: `GET /api/skus/:id`
- Alerts: `GET /api/alerts`, `GET /api/alerts/:id`
- Suppliers: `GET /api/suppliers`, `GET /api/suppliers/:id`
- Settings: `GET /api/settings`, `PATCH /api/settings`
- Quote packages: create, submit, approve, and dispatch flows under `/api/quote-packages`
- Imports: `POST /api/imports/skus`, `POST /api/imports/suppliers`, `POST /api/imports/price-points`, `POST /api/imports/quotes`

## Testing

The backend test suite uses Vitest + Supertest.

Current coverage focuses on the workflows that matter most for this stage of the product:

- login, session handling, and protected route access
- role restrictions around quote package actions
- quote package creation, approval, and dispatch
- alert reconciliation after threshold changes or supplier responses

Run the suite with:

```bash
cd backend
npm test
```

## Repository layout

```text
.
├── backend/
│   ├── prisma/
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── README.md
├── docs/
│   └── design-system.md
├── frontend/
│   ├── assets/
│   ├── pages/workspace/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── index.html
├── scripts/
├── docker-compose.yml
├── index.html
└── README.md
```

## Current status

QuoteFlow already runs as an end-to-end local demo, but it is intentionally honest about where it is in the product lifecycle:

- the frontend is a static prototype, not a framework-based application yet
- the backend workflow is more mature than the screen-level integration in a few places
- deployment infrastructure is not part of this repository

That trade-off keeps the core workflow testable while the product shape is still being refined.

## License

This project is licensed under Apache 2.0. See `LICENSE` for the full text.
