# QuoteFlow Backend

Express + Prisma + Postgres backend for the QuoteFlow MVP.

## Stack

- Express API with JSON responses under `/api`
- Prisma ORM on Postgres
- Server-side session auth with `HttpOnly` cookies
- RBAC roles: `admin`, `analyst`, `buyer`, `approver`, `finance_approver`
- Vitest + Supertest test suite

## Local Setup

1. Install dependencies

```bash
cd backend
npm install
```

2. Create env file

```bash
cp .env.example .env
```

3. Push schema and seed demo data

```bash
npx prisma db push
npx prisma db seed
```

4. Start the API

```bash
npm run dev
```

## Demo Accounts

All seeded accounts use password `QuoteFlow123!`.

- `admin@quoteflow.local`
- `analyst@quoteflow.local`
- `buyer@quoteflow.local`
- `approver@quoteflow.local`
- `finance@quoteflow.local`

## Key Endpoints

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/dashboard/overview`
- `GET /api/watchlist`
- `GET /api/watchlist/export`
- `GET /api/skus/:id`
- `GET /api/alerts`
- `GET /api/alerts/:id`
- `GET /api/suppliers`
- `GET /api/suppliers/:id`
- `GET /api/settings`
- `PATCH /api/settings`
- `POST /api/quote-packages`
- `GET /api/quote-packages/:id`
- `PATCH /api/quote-packages/:id`
- `POST /api/quote-packages/:id/submit`
- `POST /api/quote-packages/:id/approvals/:stepId/decision`
- `POST /api/quote-packages/:id/dispatch`
- `POST /api/imports/skus`
- `POST /api/imports/suppliers`
- `POST /api/imports/price-points`
- `POST /api/imports/quotes`
- `GET /api/imports/:id`
