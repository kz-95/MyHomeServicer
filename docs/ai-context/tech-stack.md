# Tech stack

> This document covers every technology used in the platform, why it was chosen, and how it fits into the overall architecture.

---

## Overview

The platform is split into three layers — a REST API backend, a single-page frontend, and a set of supporting infrastructure services. Everything is written in TypeScript where possible for consistency across the stack.

```
Browser / Mobile (Cloudflare Pages)
      │
      ├──► Cloudflare Pages (Angular SPA)
      │
      ▼
  Express.js API (Railway)
      ├──► Gemini / DeepSeek (AI chatbot)
      ├──► PostgreSQL (Railway — primary data store)
      ├──► Redis (Railway — real-time & job queue)
      ├──► Cloudflare R2 (file uploads via presigned URL)
      └──► Brevo (transactional email — SMTP)
```

---

## Backend

### Node.js
**Runtime for the API server.**
Chosen for its non-blocking I/O which handles many concurrent connections efficiently — important for a platform where multiple servicers are receiving real-time quote broadcasts at the same time. The entire team writes JavaScript/TypeScript already so there is no context switch between frontend and backend.

### Express.js
**HTTP framework.**
Minimal and unopinionated — gives full control over middleware, routing, and error handling without magic. Routes are organised by domain (`/auth`, `/quotes`, `/bookings`, `/servicer`, `/admin`). Middleware stack handles JWT verification, rate limiting, request logging, and action PIN validation for admin routes.

### TypeScript
**Type safety across the codebase.**
All backend code is written in TypeScript. Combined with Prisma's generated types, the entire data layer is end-to-end typed — a schema change in Prisma propagates type errors to every route that touches that model. Catches bugs at compile time rather than runtime.

### Prisma
**ORM and database toolkit.**
Handles all database access. Schema is defined in `prisma/schema.prisma` — the single source of truth for the data model. Generates a fully typed client so queries are autocompleted and type-checked. The dev workflow syncs the schema with `prisma db push` (via `npm run db:sync` / `db:reset`) rather than migration files — fast and simple for development; a real deployment would switch to `prisma migrate` for versioned, data-safe changes. Used with the PostgreSQL adapter.

Key Prisma patterns used in this project:
- Soft deletes via `deletedAt` — filtered out in middleware
- `Decimal` type for all money fields — maps to `NUMERIC` in Postgres
- `Json` type for `snapshot`, `old_value`, `new_value`, `auto_accept_conditions`, `field_requirements`
- Self-relations on `QUOTE_REQUEST` for repost tracking and `CATEGORY` for subcategory hierarchy
- `@@unique([servicerId, servicerSku])` compound constraint on `ServicerService`
- `@default(true)` on `isOnline` and `@default(approved)` on `kycStatus` for V1 bypass

### Middleware stack
**Layered request processing.**
Every request passes through the middleware stack in order before reaching the route handler. The stack handles security, parsing, validation, and logging.

| Middleware | Package | Applied to |
|---|---|---|
| Secure headers | `helmet` | All routes |
| CORS | `cors` | All routes |
| Rate limiting | `express-rate-limit` | Auth, OTP, quote submit, admin PIN, proposal submit |
| JSON body parser | `express.json()` | All routes |
| Request logging | `morgan` | All routes (auth bodies excluded) |
| JWT verify | custom middleware | All protected routes |
| Role guard — customer | custom | `/api/v1/*` authenticated routes |
| Role guard — servicer | custom | `/api/v1/servicer/*` |
| Role guard — admin | custom | `/api/v1/admin/*` |
| Action PIN check | custom | Sensitive admin routes (settings, penalty rules, feature flags) |
| Request validation | `express-validator` | All POST and PATCH routes |
| App logger | `winston` | Application-wide error and info logging |

> **File uploads do not use `multer`.** Files are uploaded directly from the browser to S3 using pre-signed URLs — they never pass through the Express server. The API only handles two lightweight JSON calls: `POST /files/presign` to generate the upload URL, and `POST /files/:id/confirm` to record the completed upload. This keeps request sizes small and avoids streaming large files through the API.

**Why custom JWT middleware instead of `express-jwt`:**
`express-jwt` is a thin wrapper — it adds a dependency for minimal gain. A custom middleware gives full control over error messages, token extraction logic, and the ability to check `revoked_at` on the refresh token in one pass. It's ~30 lines and owned by the team.

---

## Database

### PostgreSQL
**Primary data store.**
Stores all application data — users, servicers, quotes, bookings, transactions, audit logs. Chosen over MySQL for its stronger support of JSON columns (`jsonb`), array types (used on `service_areas`), and decimal arithmetic. All monetary calculations happen in the database layer using Postgres `NUMERIC` to avoid floating point errors.

Key Postgres features used:
- `NUMERIC(10,2)` for all money columns
- `JSONB` for settings values, audit log diffs, and order history snapshots
- `TEXT[]` array for servicer service areas
- `UUID` primary keys generated with `gen_random_uuid()`
- Soft delete pattern — `deleted_at IS NULL` added to relevant queries

### Redis
**Real-time layer and job queue.**
Two separate responsibilities:

1. **Socket.io adapter** — when a quote request is broadcast, Socket.io uses the Redis adapter to push to all connected servicer clients across multiple server instances. Without Redis, broadcasts only reach servicers connected to the same server process.
2. **BullMQ job queue** — background jobs are queued in Redis via BullMQ. Jobs have retry logic, delay support, and a dead letter queue for failed jobs. The `JOB_QUEUE` table in Postgres mirrors job state for admin visibility.
3. **Idempotency key cache** — payment and money operation idempotency keys are stored in Redis with a 24-hour TTL. If Redis is unavailable, fallback records are written to a Postgres `idempotency_fallback` table for reconciliation.

### ioredis
**Node.js Redis client.**
`ioredis` is the Redis client library used throughout the backend. Both BullMQ and the Socket.io Redis adapter are built on top of `ioredis` — a single Redis connection is shared across both. Chosen over the official `redis` npm package for its more robust support of BullMQ's advanced Redis commands and its cluster/sentinel support for post-V1 scaling.

---

## Frontend

### Angular
**Single-page application framework.**
One Angular project serves three portals — customer app, servicer portal, and admin panel — using lazy-loaded route modules. Route guards (`AuthGuard`, `ServicerGuard`, `AdminGuard`) protect each portal. The admin module is lazy-loaded so its code is never shipped to customer or servicer sessions.

Project structure:
```
src/
  app/
    core/          # Auth, interceptors, guards
    shared/        # Shared components, pipes, directives
    customer/      # Customer portal (lazy loaded)
    servicer/      # Servicer portal (lazy loaded)
    admin/         # Admin panel (lazy loaded)
```

Angular features used:
- **Standalone components** — no NgModules where possible
- **Signals** — reactive state management for component data
- **HttpClient** with interceptors for JWT attachment and token refresh
- **Router** with lazy loading and route guards
- **Reactive forms** for the quote form and servicer onboarding
- **Block control flow** (`@if`, `@for`, `@switch`) throughout templates

---

## Real-time

### Socket.io
**Real-time bidirectional communication.**
Used for two things in V1:

1. **Quote broadcasts** — when a customer submits a quote, the server emits to all online servicers in the relevant service area and category. Servicers see the request appear live in their app.
2. **Booking status updates** — servicer status changes (confirmed, arrived, done) are pushed to the customer in real time so they don't have to refresh.

Socket.io is paired with the Redis adapter (`@socket.io/redis-adapter` built on `ioredis`) so broadcasts work correctly when the API runs on multiple instances.

### BullMQ
**Background job queue.**
BullMQ runs on top of Redis and handles all scheduled and async work that shouldn't happen inside an API request. The API drops a job into the queue and returns immediately — a separate worker process picks it up and executes it. If a job fails it retries automatically with exponential backoff.

Jobs used in this project:

| Job | Trigger | Payload | What it does |
|---|---|---|---|
| `quote.expiry` | At `servicer_deadline` | `{ quoteRequestId }` | Bundle all received proposals and send to customer |
| `quote.no_response` | At `proposal_deadline` with zero proposals | `{ quoteRequestId, userId }` | Send sorry notification, generate discount code, emit `quote.expired_no_response` socket event |
| `noshow.detect` | 30 min after time slot ends | `{ bookingId, servicerId }` | Check if servicer marked arrived — apply penalty if not |
| `penalty.deduct` | After no-show confirmed | `{ bookingId, servicerId, ruleId }` | Deduct from servicer deposit, write TRANSACTION row, update PENALTY_LOG |
| `notification.push` | On various events | `{ userId, type, message, linkQuoteList?, linkReorder? }` | Dispatch push notification without blocking the API |
| `noshow.weekly_reset` | Every Monday midnight | `{}` | Reset `weekly_noshow` counter on all servicers |
| `escrow.release` | After job marked done with no open report | `{ bookingId, escrowId }` | Release held funds to servicer, write TRANSACTION row |
| `promo.credit_payback` | After escrow released or cash confirmed | `{ bookingId, promotionRedemptionId }` | Credit servicer's `credit_balance` for platform promo used on their booking |
| `invoice.generate` | After job marked done | `{ bookingId, servicerId }` | Generate PDF invoice using `pdf-lib`, upload to S3, write `pdf_url` on INVOICE row |
| `withdrawal.notify` | After servicer submits withdrawal request | `{ withdrawalId, servicerId }` | Notify admin of pending withdrawal in queue |

The `JOB_QUEUE` table in Postgres mirrors job state for admin visibility — Redis holds the live queue, Postgres holds the audit record.

---

## File storage

### Cloudflare R2 (S3-compatible)
**Stores all uploaded files.**
Arrive photos, done photos, KYC documents, and servicer logos are uploaded directly to Cloudflare R2 via pre-signed URLs — files never pass through the API server. The `FILE` table in Postgres tracks the URL, mime type, size, and upload status of every file. The S3 client in `backend/src/lib/s3.ts` uses the `S3_BASE_URL` as the R2 endpoint; any S3-compatible provider works by changing the env vars.

Before any photo is uploaded, `sharp` strips all EXIF metadata (GPS coordinates, device info, timestamps) to protect user privacy.

---

## AI

The chatbot calls LLMs directly from the backend — no orchestration layer. The fallback chain (defined in `chat.service.ts`):

1. **Gemini** (`gemini-2.0-flash`) — from `.env` `AICHAT_LLM_API_KEY`
2. **DeepSeek** (`deepseek-chat`) — from `.env` `AICHAT_LLM_FALLBACK_API_KEY`
3. **DB priority keys** — from `LLM_KEYS` table (any provider: Gemini, DeepSeek, OpenAI, Generic)
4. **DB fallback key** — one designated fallback from `LLM_KEYS` table
5. **Throws error** — the calling route handles the "AI unavailable" message client-side

Models are configurable per `LLM_KEYS` entry. The system prompt and FAQ knowledge base are managed server-side. Keys stored in `.env` or the `LLM_KEYS` table via admin API.

---

## Communication & notifications

### In-app notifications
Notifications are dispatched by BullMQ jobs so they are non-blocking and retryable. The `NOTIFICATION` table stores every notification sent for the in-app notification centre (bottom-left snackbar). Users receive notifications for booking status changes, new quotes, payment confirmations, and admin announcements.

> Native push (FCM/APNs) can be added post-V1 once a native mobile app exists. For V1, in-app notifications + email cover all flows.

### Email (Brevo SMTP)
Transactional emails (invoices, password reset, account notifications) are sent via **Brevo** SMTP. The `nodemailer` library in `backend/src/lib/email.ts` uses standard `SMTP_*` env vars. Falls back to `console.log` when SMTP is not configured — no code changes needed to switch providers, just change the SMTP credentials.

---

## Development tooling

| Tool | Purpose |
|---|---|
| TypeScript | Type safety across backend and frontend |
| ESLint | Code linting — enforced in CI |
| Prettier | Code formatting — single style across the team |
| Prisma CLI | Database migrations and client generation |
| ts-node-dev | Hot reload for backend development |
| Angular CLI | Scaffolding, build, and serve for frontend |
| @angular/cdk (^21.2) | Angular Component Dev Kit — `DragDropModule` (`@angular/cdk/drag-drop`) powers drag-drop reorder of questions + options in the admin Question Schema editor. Version-matched to Angular 21.2. |
| dotenv | Environment variable management |
| Jest | Unit and integration tests for backend |
| Jasmine / Karma | Unit tests for Angular components |
| Brevo | Transactional email (SMTP) |
| sharp | EXIF stripping from photos before S3 upload |
| zod | Runtime schema validation for JSONB fields and BullMQ job payloads |
| bcryptjs | Password and action PIN hashing (pure JS, swapped from bcrypt 2026-05-31) |
| pdf-lib | PDF generation for invoices and receipts |
| ioredis | Node.js Redis client — used by BullMQ and Socket.io Redis adapter |
| passport / passport-google-oauth20 | Google OAuth authentication strategy |
| express-session | Session backing for Passport |
| @lucide/angular | Lucide icon library — used across all portals |
| @angular/google-maps | Google Maps JS API integration (Places Autocomplete, map view) |
| @stripe/stripe-js | Stripe frontend SDK for Checkout and Payment Element |
| qrcode | QR code generation on invoices/receipts |
| playwright | E2E testing (alongside Jasmine/Karma unit tests) |
| gitleaks | Pre-commit hook to scan for accidentally committed secrets |
| trufflehog | CI tool to scan full git history for leaked secrets (PR gate + nightly schedule) |

---

## Local development

### Docker Compose for infrastructure
Postgres and Redis run in Docker containers locally so no manual installation is needed. The Node and Angular apps run natively on the developer machine.

Create a `docker-compose.yml` at the project root:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: hs_postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: homeservices
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: hs_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Getting started

```bash
# 1. Clone and install
git clone <repo>
cd homeservices
npm install --prefix backend
npm install --prefix frontend

# 2. Start infrastructure
docker compose up -d

# 3. Set up environment
cp backend/.env.example backend/.env
# Fill in AICHAT_LLM_API_KEY, JWT_SECRET, and S3 credentials

# 4. Build the database schema (dev workflow uses `db push`, not migrations)
cd backend
npm run db:sync          # or `npm run db:reset` to also wipe + reseed

# 5. Start backend (terminal 1)
npm run dev

# 6. Seed demo data (optional, for development/demo)
npm run seed

# 7. Start frontend (terminal 2)
cd ../frontend
ng serve
```

Backend runs at `http://localhost:3000`, frontend at `http://localhost:4200`.

### Useful commands

| Command | Purpose |
|---|---|
| `docker compose up -d` | Start Postgres and Redis |
| `docker compose down` | Stop containers (data persisted) |
| `docker compose down -v` | Stop and wipe all data |
| `npx prisma studio` | GUI to browse the database |
| `npm run db:sync` | Push schema changes to the DB + regenerate client (keeps data) |
| `npm run db:reset` | Force-push schema + regenerate client + reseed (wipes data) |
| `npx prisma generate` | Regenerate Prisma client only |
| `npm run seed` | Seed demo data |
| `npm run unseed` | Remove all seeded data |
| `npm run reseed` | Reset to fresh seed (unseed + seed) |
| `npm run test` | Run backend tests |
| `ng test` | Run frontend tests |

---

## Project structure

```
/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Single source of truth for DB schema
│   │   └── seed/
│   │       ├── seed.ts         # Seed script
│   │       ├── unseed.ts       # Unseed script
│   │       ├── data/           # Per-table seed data
│   │       └── seeded-ids.json # Auto-generated, gitignored, tracks seeded UUIDs
│   ├── src/
│   │   ├── routes/             # Express route handlers by domain
│   │   ├── middleware/         # Auth, rate limit, PIN verification
│   │   ├── services/           # Business logic layer
│   │   ├── jobs/               # BullMQ job definitions
│   │   ├── socket/             # Socket.io event handlers
│   │   ├── lib/                # Prisma client, Redis client, S3 client
│   │   └── index.ts            # Entry point
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   └── app/
│   │       ├── core/
│   │       ├── shared/
│   │       ├── customer/
│   │       ├── servicer/
│   │       └── admin/
│   └── package.json
│
├── docker-compose.yml
└── README.md
```

---

## Environment variables

```env
# Database (Railway auto-provides DATABASE_URL from Postgres plugin)
DATABASE_URL=postgresql://user:password@localhost:5432/homeservices

# Redis (Railway auto-provides REDIS_URL from Redis plugin)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=
REFRESH_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Cloudflare R2 (S3-compatible storage — set in Railway env vars)
S3_BUCKET=
S3_REGION=auto
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BASE_URL=

# AI Chatbot
AICHAT_LLM_API_KEY=          # Primary model — Gemini 2.0 Flash
AICHAT_LLM_FALLBACK_API_KEY=        # Fallback — DeepSeek V4 Flash

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=     # Must match GCP Console → Authorized redirect URIs
ADMIN_EMAILS=

# Google Maps
GOOGLE_MAPS_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# SMTP / Brevo (transactional email)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=MyHomeServicer <noreply@myhomeservicer.com>

# Super admin Gmail API (Tier 3 rescue — separate from SMTP)
GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
GOOGLE_GMAIL_REFRESH_TOKEN=

# App
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
APP_URL=http://localhost:4200
TZ=Asia/Kuala_Lumpur
CORS_EXTRA_ORIGINS=
```

---

## Maps & location

### Google Maps Platform — Integrated

**Backend services** (`backend/src/lib/`):
- **`geocoding.ts`** — resolves addresses to `lat`/`lng` via Geocoding API on address create/update. Server-side key (IP-restricted).
- **`distance.ts`** — distance calculation between two coordinates using the Haversine formula.
- **`findMatchingServicers()`** — radius-based servicer matching using geocoded coordinates and service area overlap. Falls back to substring matching for addresses without coordinates.

**Frontend** (`frontend/src/app/`):
- **Places Autocomplete** — address autocomplete on quote form and account address fields, powered by client-side Map key (referrer-restricted).
- **Map view** — embedded Google Map on address selection for visual confirmation.
- **Service area chips** — servicer service area selection with location-aware chips.

**Key management:**
- Client-side key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`): restricted by HTTP referrer (only the app domain), only Places API + Maps JS API
- Server-side key (`GOOGLE_MAPS_API_KEY`): restricted by IP address, only Geocoding API
- Both stored in `.env` / frontend `environment.ts` — never hardcoded

---

## Payments

### Stripe

**`stripe` SDK v22.1.1** — payment gateway integration for real customer payments and wallet top-ups.

- **PaymentIntents** — `POST /stripe/create-payment-intent` for gateway-payment bookings (pay_now).
- **Checkout Sessions** — `POST /stripe/create-topup-session` for wallet top-up flow.
- **Webhook verification** — `POST /stripe/webhook` with HMAC-SHA256 signature verification (raw-body mount before JSON parser). Events handled: `payment_intent.succeeded` (marks invoice paid, creates gateway_payment transaction), `checkout.session.completed` (credits wallet, creates deposit_topup transaction).
- **Idempotency** — Redis lock (`SET NX EX 30`) + DB unique constraints on `stripePaymentIntentId` / `stripeSessionId`. Fallback to Postgres `idempotency_fallback` table if Redis unavailable.
- `POST /user/me/topup` returns Stripe Checkout URL (production) or instant +RM100 credit (dev fallback).

---

## Version targets

| Category | Technology | Version |
|---|---|---|
| **Runtime** | Node.js | 20 LTS (prod) / 24 (dev) |
| **Language** | TypeScript | 5.4.5 (backend) / 5.9.3 (frontend) |
| **Backend** | Express.js | ^4.22.2 |
| **Backend** | Prisma | 5.12.1 |
| **Backend** | Socket.io server | ^4.8.3 |
| **Backend** | BullMQ | ^5.77.6 |
| **Backend** | Sharp | 0.33.3 |
| **Backend** | Zod | 3.22.4 |
| **Backend** | pdf-lib | 1.17.1 |
| **Backend** | ioredis | 5.3.2 |
| **Frontend** | Angular | 21.2.15 |
| **Frontend** | Socket.io client | ^4.7.5 |
| **Infrastructure** | PostgreSQL | 16 |
| **Infrastructure** | Redis | 7 |
| **Deployment** | Railway | Express + Postgres + Redis |
| **Deployment** | Cloudflare Pages | Angular SPA |
| **Deployment** | Cloudflare R2 | S3-compatible file storage |
| **External Service** | Google Maps Platform | Places API / Geocoding API / Maps JS API |
| **External Service** | Gemini | 2.0 Flash |
| **External Service** | DeepSeek | V4 Flash |
| **External Service** | Brevo | SMTP transactional email |
| **External Service** | Stripe | Payment gateway |

## Update 2026-05-31
- **bcrypt → bcryptjs** — switched to pure-JS bcryptjs (no native binary). Fixes Windows DLL lock + Railway/Alpine native build issues. Same API.
- **@angular/cdk@^17** — added for drag-drop (admin Question Schema editor).
- Resolved 32 npm-audit vulns via dep upgrades (commit 3770818).

## Update 2026-06-03
- **Dify removed** — AI stack replaced with direct Gemini/DeepSeek/OpenAI provider calls via `chat.service.ts`. `LLM_KEYS` table for admin-managed keys.
- **AI model names corrected** — `gemini-2.0-flash` primary, `deepseek-chat` fallback (not "V4 Flash").
- **Passport OAuth added** — Google OAuth via `passport-google-oauth20` + `express-session`.
- **Frontend deps documented** — `@lucide/angular`, `@angular/google-maps`, `@stripe/stripe-js`, `qrcode`, `playwright`.
- **Version table synced** — TypeScript 5.4.5/5.9.3, Prisma 5.12.1, Socket.io ^4.8.3, BullMQ ^5.77.6, ioredis 5.3.2, Zod 3.22.4, pdf-lib 1.17.1, Sharp 0.33.3.
- **Email switched to Brevo SMTP** — `smtp-relay.brevo.com:587` replacing dead localhost SMTP.
