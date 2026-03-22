# QuoteFlow Frontend

This frontend is the interactive UI layer for QuoteFlow, a pricing operations workspace focused on procurement, supplier comparison, alert triage, and quote package workflow.

It is intentionally lightweight: there is no bundler, no framework runtime, and no frontend package install step. The application is built as a static multi-page interface with shared CSS and shared JavaScript, then served either through Docker + Nginx or directly from the filesystem during local iteration.

## What this frontend includes

- Landing page with product positioning and sign-in entry
- Auth modal wired to the backend session API
- Overview dashboard for price signals, active alerts, supplier responsiveness, and suggested next actions
- Watchlist for tracked SKUs, search, sorting, export, and drill-down navigation
- SKU detail page for trend context, supplier comparison, and follow-up actions
- Alerts workspace for triage and alert-to-action flow
- Suppliers workspace for supplier profile, performance, communication, and monitoring
- Settings page for thresholds, delivery routing, and governance controls
- Quote Builder flow for package review, submission, approval, and dispatch

## Frontend approach

The frontend is not a marketing-only prototype. It already reads live data from the backend and uses the seeded demo workspace to drive real page states.

A few important implementation choices:

- Pages are plain HTML files under `pages/workspace/`
- Shared behavior lives in `assets/js/app.js`
- Shared styling is split between `assets/css/styles.css` and `assets/css/app.css`
- Workspaces rely on backend session cookies and backend-validated session redirects
- API calls are made with `fetch`, always using `credentials: "include"`

This keeps the editing loop fast while still allowing the product workflow to be exercised end to end.

## Page inventory

- `index.html`
  Landing page, login modal, provider presets, workspace entry
- `pages/workspace/overview.html`
  Dashboard and high-level operating view
- `pages/workspace/watchlist.html`
  SKU watchlist with search, table interaction, and exports
- `pages/workspace/sku-detail.html`
  Single-item pricing context and supplier comparison
- `pages/workspace/alerts.html`
  Alert inbox and triage surface
- `pages/workspace/suppliers.html`
  Supplier profile, history, and risk review
- `pages/workspace/settings.html`
  Thresholds, delivery, routing, and governance settings
- `pages/workspace/quote-builder.html`
  Quote package workflow from draft to dispatch

## How the frontend talks to the backend

By default, the frontend resolves its API base like this:

1. `apiBase` query parameter from the current URL
2. `window.PRICETOOL_API_BASE` if injected externally
3. a previously stored value in `localStorage`
4. `/api` when served over HTTP
5. `http://localhost:3000/api` when opened from `file://`

That means the frontend works in three common modes:

- through Docker, where Nginx proxies `/api` to the backend container
- through another local HTTP server, using `?apiBase=http://localhost:3000`
- directly from the filesystem, where it falls back to `http://localhost:3000/api`

## Authentication model

The workspace pages are session-gated. If a user opens a workspace page without a valid backend session, the frontend redirects back to the landing page and opens the login flow automatically.

The landing page currently supports:

- local login through `POST /auth/login`
- session restore through `GET /auth/me`
- logout through `POST /auth/logout`
- remember-me behavior through server-managed cookie lifetime
- workspace redirects that always re-validate the session against the backend

The SSO, Google, and WeChat buttons on the landing screen are demo presets for seeded users. They help fill the login form quickly, but backend authentication is still handled through the local email/password flow.

## Running the frontend

### Recommended: run with Docker Compose from the repository root

From the project root:

```bash
docker compose up --build
```

Then open:

- `http://localhost:5173`

In this mode, Nginx serves the static files and proxies `/api` to the backend service automatically.

### Open directly from the filesystem

If the backend is already running on port `3000`, you can open:

```bash
open frontend/index.html
```

The frontend will use `http://localhost:3000/api` automatically when loaded from `file://`.

### Serve from another local HTTP server

If you serve `frontend/` from a different origin, pass the backend explicitly:

```text
http://127.0.0.1:5500/index.html?apiBase=http://localhost:3000
```

## Demo login

This frontend is designed around the demo data seeded by the backend.

Seeded users:

- `admin@quoteflow.local`
- `analyst@quoteflow.local`
- `buyer@quoteflow.local`
- `approver@quoteflow.local`
- `finance@quoteflow.local`

Shared password:

- `QuoteFlow123!`

## Directory layout

```text
frontend/
├── assets/
│   ├── css/
│   │   ├── app.css
│   │   └── styles.css
│   └── js/
│       ├── app.js
│       └── capture-optin.js
├── pages/
│   └── workspace/
│       ├── alerts.html
│       ├── overview.html
│       ├── quote-builder.html
│       ├── settings.html
│       ├── sku-detail.html
│       ├── suppliers.html
│       └── watchlist.html
├── Dockerfile
├── nginx.conf
└── index.html
```

## Styling and interaction notes

- The interface is designed around the SUSE type family, with local/system fallback fonts when it is unavailable
- Shared UI motion respects reduced-motion preferences
- The landing page and workspace include responsive behavior for smaller screens
- Tables, badges, pill states, and workflow cards are all rendered from shared frontend helpers in `assets/js/app.js`

## Figma capture opt-in

The frontend includes an optional Figma HTML-to-design capture hook in `assets/js/capture-optin.js`.

It is disabled by default and only loads when either of these is set:

- `?figmaCapture=1` in the page URL
- `localStorage["pricetool-figma-capture"] = "1"`

This keeps normal browsing clean while preserving a useful handoff path for design capture when needed.

## Current limitations

- There is no frontend build pipeline, bundling, or lint step yet
- There is no dedicated frontend test suite in this directory
- Provider buttons on the landing page are convenience presets, not full OAuth implementations
- Some screens are still product-grade prototypes sitting in front of a more mature backend workflow

Those trade-offs are deliberate for the current phase of the project: move quickly on workflow, keep the UI easy to edit, and validate the operational model before introducing a heavier frontend toolchain.
